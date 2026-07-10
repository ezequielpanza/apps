(() => {
  const registry = new Map();

  function policy() {
    if (!window.WanderSourcePolicy) throw new Error('WanderSourcePolicy is unavailable');
    return window.WanderSourcePolicy;
  }

  function normalizedPOI() {
    if (!window.WanderNormalizedPOI) throw new Error('WanderNormalizedPOI is unavailable');
    return window.WanderNormalizedPOI;
  }

  function consolidatedPOI() {
    if (!window.WanderConsolidatedPOI) throw new Error('WanderConsolidatedPOI is unavailable');
    return window.WanderConsolidatedPOI;
  }

  function validateConnector(connector) {
    if (!connector || typeof connector !== 'object') throw new Error('POI connector is required');
    if (!connector.id || typeof connector.id !== 'string') throw new Error('POI connector id is required');
    if (!connector.version || typeof connector.version !== 'string') throw new Error('POI connector version is required');
    if (typeof connector.search !== 'function') throw new Error('POI connector search() is required');
  }

  function register(connector) {
    validateConnector(connector);
    policy().assertCapability(connector.id, 'automatedAcquisition');
    registry.set(connector.id, connector);
    return connector;
  }

  function unregister(sourceId) { return registry.delete(String(sourceId || '')); }
  function getConnector(sourceId) { return registry.get(String(sourceId || '')) || null; }

  function listConnectors() {
    return Array.from(registry.values(), (connector) => ({
      id: connector.id,
      version: connector.version,
      capabilities: Array.isArray(connector.capabilities) ? [...connector.capabilities] : [],
      policy: policy().getOrDefault(connector.id).mode,
    }));
  }

  function validateBatch(sourceId, connector, result) {
    if (!result || typeof result !== 'object') throw new Error(`POI connector ${sourceId} returned an invalid result`);
    const pois = Array.isArray(result.pois) ? result.pois : [];
    for (const poi of pois) {
      if (!normalizedPOI().isNormalizedPOI(poi)) throw new Error(`POI connector ${sourceId} returned a non-normalized POI`);
      if (poi.source.id !== connector.id) throw new Error(`POI connector ${sourceId} returned POI from source ${poi.source.id}`);
      if (poi.source.version !== connector.version) throw new Error(`POI connector ${sourceId} returned POI with mismatched source version`);
    }
    return { sourceId: connector.id, sourceVersion: connector.version, pois, diagnostics: result.diagnostics || {} };
  }

  async function search(sourceId, request = {}) {
    const id = String(sourceId || '').trim();
    policy().assertCapability(id, 'automatedAcquisition');
    const connector = getConnector(id);
    if (!connector) throw new Error(`Unknown POI connector: ${id}`);
    return validateBatch(id, connector, await connector.search(request));
  }

  async function searchMany(sourceIds, request = {}) {
    const ids = Array.from(new Set((Array.isArray(sourceIds) ? sourceIds : []).map(String).filter(Boolean)));
    const settled = await Promise.allSettled(ids.map((sourceId) => search(sourceId, request)));
    const batches = [];
    const errors = [];
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') batches.push(result.value);
      else errors.push({ sourceId: ids[index], message: result.reason?.message || String(result.reason), code: result.reason?.code || null });
    });
    return { batches, pois: batches.flatMap((batch) => batch.pois), errors };
  }

  async function searchAndStore(sourceId, request = {}, store = window.WanderPOIStore) {
    const id = String(sourceId || '').trim();
    policy().assertCapability(id, 'storePOIs');
    if (!store?.ingestNormalized) throw new Error('POI store is unavailable');
    const batch = await search(id, request);
    return { ...batch, stored: store.ingestNormalized(batch.pois) };
  }

  async function searchManyAndStore(sourceIds, request = {}, store = window.WanderPOIStore) {
    if (!store?.ingestNormalized) throw new Error('POI store is unavailable');
    const result = await searchMany(sourceIds, request);
    const stored = [];
    for (const batch of result.batches) {
      if (!policy().canStorePOIs(batch.sourceId)) continue;
      stored.push(...store.ingestNormalized(batch.pois));
    }
    return { ...result, stored };
  }

  function radians(value) { return value * Math.PI / 180; }

  function distanceMeters(left, right) {
    if (!left || !right) return null;
    const earthRadiusM = 6371008.8;
    const dLat = radians(right.lat - left.lat);
    const dLng = radians(right.lng - left.lng);
    const lat1 = radians(left.lat);
    const lat2 = radians(right.lat);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function tokenSet(value) {
    return new Set(normalizedPOI().normalizeText(value).split(' ').filter(Boolean));
  }

  function jaccard(left, right) {
    const a = tokenSet(left);
    const b = tokenSet(right);
    if (!a.size || !b.size) return 0;
    let intersection = 0;
    a.forEach((token) => { if (b.has(token)) intersection += 1; });
    return intersection / (a.size + b.size - intersection);
  }

  function bestNameSimilarity(left, right) {
    const leftNames = [left.name, ...(left.aliases || [])].filter(Boolean);
    const rightNames = [right.name, ...(right.aliases || [])].filter(Boolean);
    let best = 0;
    for (const a of leftNames) {
      for (const b of rightNames) {
        const normalizedA = normalizedPOI().normalizeText(a);
        const normalizedB = normalizedPOI().normalizeText(b);
        if (normalizedA && normalizedA === normalizedB) return 1;
        best = Math.max(best, jaccard(a, b));
      }
    }
    return best;
  }

  function categorySimilarity(left, right) {
    const leftLabels = (left.categories || []).map((item) => item.label || item.id).filter(Boolean);
    const rightLabels = (right.categories || []).map((item) => item.label || item.id).filter(Boolean);
    let best = 0;
    for (const a of leftLabels) for (const b of rightLabels) best = Math.max(best, jaccard(a, b));
    return best;
  }

  function sharedIdentifiers(left, right) {
    const rightKeys = new Set((right.identifiers || []).map((item) => `${item.namespace}:${item.value}`));
    return (left.identifiers || []).filter((item) => rightKeys.has(`${item.namespace}:${item.value}`));
  }

  function compareNormalized(left, right, options = {}) {
    if (!normalizedPOI().isNormalizedPOI(left) || !normalizedPOI().isNormalizedPOI(right)) {
      throw new Error('compareNormalized requires normalized POIs');
    }

    if (left.id === right.id) {
      return { decision: 'match', score: 1, reasons: ['same_normalized_id'], signals: { distanceM: 0, nameSimilarity: 1, categorySimilarity: 1, sharedIdentifiers: [] } };
    }

    const identifiers = sharedIdentifiers(left, right);
    const distanceM = distanceMeters(left.location, right.location);
    const nameSimilarity = bestNameSimilarity(left, right);
    const categories = categorySimilarity(left, right);
    const signals = {
      distanceM: distanceM == null ? null : Math.round(distanceM * 10) / 10,
      nameSimilarity: Math.round(nameSimilarity * 1000) / 1000,
      categorySimilarity: Math.round(categories * 1000) / 1000,
      sharedIdentifiers: identifiers,
    };

    if (identifiers.length) {
      return { decision: 'match', score: distanceM != null && distanceM > 5000 ? 0.97 : 0.995, reasons: ['shared_identifier'], signals };
    }

    const maxDistanceM = Number(options.maxDistanceM || 1000);
    if (distanceM != null && distanceM > maxDistanceM) {
      return { decision: 'no_match', score: 0, reasons: ['too_far_apart'], signals };
    }
    if (distanceM != null && distanceM <= 250 && nameSimilarity === 1) {
      return { decision: 'match', score: 0.95, reasons: ['exact_name_nearby'], signals };
    }
    if (distanceM != null && distanceM <= 200 && nameSimilarity >= 0.9) {
      return { decision: 'match', score: 0.92, reasons: ['strong_name_nearby'], signals };
    }
    if (distanceM != null && distanceM <= 60 && nameSimilarity >= 0.78) {
      return { decision: 'match', score: 0.88, reasons: ['similar_name_very_near'], signals };
    }
    if (distanceM != null && distanceM <= 30 && nameSimilarity >= 0.65 && categories >= 0.5) {
      return { decision: 'match', score: 0.86, reasons: ['name_category_extremely_near'], signals };
    }
    if ((distanceM != null && distanceM <= 300 && nameSimilarity >= 0.7) ||
        (distanceM == null && nameSimilarity === 1 && categories >= 0.5)) {
      return { decision: 'ambiguous', score: 0.65, reasons: ['partial_match_signals'], signals };
    }
    return { decision: 'no_match', score: 0.1, reasons: ['insufficient_match_evidence'], signals };
  }

  function chooseBestMember(members, predicate = () => true) {
    return members.filter(predicate).sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return String(b.name || '').length - String(a.name || '').length;
    })[0] || null;
  }

  function uniqueBy(items, keyFn) {
    const map = new Map();
    for (const item of items) map.set(keyFn(item), item);
    return Array.from(map.values());
  }

  function buildConsolidated(members, pairComparisons = [], at = Date.now()) {
    const best = chooseBestMember(members);
    if (!best) throw new Error('Cannot consolidate an empty POI group');

    const aliases = uniqueBy(
      members.flatMap((member) => [member.name, ...(member.aliases || [])])
        .filter((value) => normalizedPOI().normalizeText(value) !== normalizedPOI().normalizeText(best.name)),
      (value) => normalizedPOI().normalizeText(value),
    );
    const categories = uniqueBy(members.flatMap((member) => member.categories || []), (item) => item.id);
    const identifiers = uniqueBy(members.flatMap((member) => member.identifiers || []), (item) => `${item.namespace}:${item.value}`);
    const sources = uniqueBy(members.map((member) => member.source), (source) => `${source.id}:${source.ref || source.url || ''}`);
    const notes = uniqueBy(members.flatMap((member) => member.notes || []), (note) => `${note.source?.id || ''}:${note.source?.ref || ''}:${note.kind || ''}:${note.text}`);
    const evidence = uniqueBy(members.flatMap((member) => member.evidence || []), (item) => JSON.stringify([item.type, item.source?.id, item.source?.ref, item.value, item.location]));
    const locationMember = chooseBestMember(members, (member) => Boolean(member.location));
    const addressMember = chooseBestMember(members, (member) => Boolean(member.address));
    const matchScores = pairComparisons.filter((item) => item.result.decision === 'match').map((item) => item.result.score);
    const memberConfidence = members.reduce((sum, member) => sum + member.confidence, 0) / members.length;
    const matchConfidence = matchScores.length ? matchScores.reduce((sum, value) => sum + value, 0) / matchScores.length : memberConfidence;
    const confidence = members.length === 1 ? best.confidence : Math.min(0.99, memberConfidence * 0.6 + matchConfidence * 0.4);

    return consolidatedPOI().create({
      name: best.name,
      normalizedName: normalizedPOI().normalizeText(best.name),
      aliases,
      categories,
      identifiers,
      location: locationMember?.location || null,
      address: addressMember?.address || null,
      confidence,
      sources,
      memberIds: members.map((member) => member.id),
      notes,
      evidence,
      tagsBySource: Object.fromEntries(members.map((member) => [member.source.id, member.tags || {}])),
      attributesBySource: Object.fromEntries(members.map((member) => [member.source.id, member.attributes || {}])),
      resolution: {
        method: members.length === 1 ? 'single_normalized_poi' : 'multi_source_match',
        memberCount: members.length,
        comparisons: pairComparisons.map((item) => ({
          leftId: item.leftId,
          rightId: item.rightId,
          decision: item.result.decision,
          score: item.result.score,
          reasons: item.result.reasons,
          signals: item.result.signals,
        })),
      },
      metadata: {
        destinationIds: Array.from(new Set(members.map((member) => member.destination?.id).filter(Boolean))),
      },
    }, at);
  }

  function consolidate(pois, options = {}) {
    const normalized = Array.isArray(pois) ? pois : [];
    normalized.forEach((poi) => {
      if (!normalizedPOI().isNormalizedPOI(poi)) throw new Error('consolidate requires normalized POIs');
    });

    const sorted = [...normalized].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const clusters = [];
    const ambiguities = [];

    for (const poi of sorted) {
      let bestCluster = null;
      let bestScore = -1;
      let bestComparisons = null;

      for (const cluster of clusters) {
        const comparisons = cluster.members.map((member) => ({
          leftId: member.id,
          rightId: poi.id,
          result: compareNormalized(member, poi, options),
        }));
        if (!comparisons.every((item) => item.result.decision === 'match')) {
          comparisons.filter((item) => item.result.decision === 'ambiguous').forEach((item) => ambiguities.push(item));
          continue;
        }
        const score = Math.min(...comparisons.map((item) => item.result.score));
        if (score > bestScore) {
          bestCluster = cluster;
          bestScore = score;
          bestComparisons = comparisons;
        }
      }

      if (bestCluster) {
        bestCluster.members.push(poi);
        bestCluster.comparisons.push(...bestComparisons);
      } else {
        clusters.push({ members: [poi], comparisons: [] });
      }
    }

    const consolidated = clusters.map((cluster) => buildConsolidated(cluster.members, cluster.comparisons));
    return {
      consolidated,
      ambiguities: uniqueBy(ambiguities, (item) => [item.leftId, item.rightId].sort().join('|')),
      diagnostics: {
        normalizedCount: normalized.length,
        consolidatedCount: consolidated.length,
        mergedGroupCount: consolidated.filter((poi) => poi.memberIds.length > 1).length,
        ambiguityCount: ambiguities.length,
      },
    };
  }

  function consolidateStore(store = window.WanderPOIStore, options = {}) {
    if (!store?.listNormalized || !store?.replaceConsolidated) throw new Error('POI store is unavailable');
    const result = consolidate(store.listNormalized(), options);
    store.replaceConsolidated(result.consolidated);
    return result;
  }

  async function searchManyStoreAndConsolidate(sourceIds, request = {}, store = window.WanderPOIStore, options = {}) {
    const searchResult = await searchManyAndStore(sourceIds, request, store);
    return { ...searchResult, consolidation: consolidateStore(store, options) };
  }

  window.WanderPOIEngine = Object.freeze({
    register,
    unregister,
    getConnector,
    listConnectors,
    search,
    searchMany,
    searchAndStore,
    searchManyAndStore,
    compareNormalized,
    consolidate,
    consolidateStore,
    searchManyStoreAndConsolidate,
  });
})();
