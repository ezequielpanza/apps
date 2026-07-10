(() => {
  const STORAGE_KEY = 'wander.poi.store.v4';
  const SCHEMA_VERSION = 4;

  const EMPTY = {
    schemaVersion: SCHEMA_VERSION,
    normalized: {},
    consolidated: {},
  };

  let data = load();
  let persistTimer = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sourcePolicy() {
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

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored?.schemaVersion === SCHEMA_VERSION) {
        return {
          schemaVersion: SCHEMA_VERSION,
          normalized: stored.normalized || {},
          consolidated: stored.consolidated || {},
        };
      }
    } catch {}
    return clone(EMPTY);
  }

  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(flush, 900);
  }

  function flush() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  }

  function mergeCategories(left = [], right = []) {
    const byId = new Map();
    [...left, ...right].forEach((category) => {
      if (category?.id) byId.set(category.id, clone(category));
    });
    return Array.from(byId.values());
  }

  function mergeIdentifiers(left = [], right = []) {
    const byKey = new Map();
    [...left, ...right].forEach((item) => {
      if (!item?.namespace || !item?.value) return;
      byKey.set(`${item.namespace}:${item.value}`, clone(item));
    });
    return Array.from(byKey.values());
  }

  function noteKey(note) {
    return JSON.stringify([
      note?.source?.id || '',
      note?.source?.ref || note?.source?.url || '',
      note?.kind || '',
      note?.language || '',
      note?.text || '',
    ]);
  }

  function mergeNotes(left = [], right = []) {
    const byKey = new Map();
    [...left, ...right].forEach((note) => byKey.set(noteKey(note), clone(note)));
    return Array.from(byKey.values());
  }

  function evidenceKey(item) {
    return JSON.stringify([
      item?.type || '',
      item?.source?.id || '',
      item?.source?.ref || item?.source?.url || '',
      item?.value == null ? null : item.value,
      item?.location || null,
    ]);
  }

  function mergeEvidence(left = [], right = []) {
    const byKey = new Map();
    [...left, ...right].forEach((item) => byKey.set(evidenceKey(item), clone(item)));
    return Array.from(byKey.values());
  }

  function upsertNormalized(poi) {
    if (!normalizedPOI().isNormalizedPOI(poi)) throw new Error('Invalid normalized POI');
    sourcePolicy().assertCapability(poi.source?.id, 'storePOIs');

    const existing = data.normalized[poi.id];
    const merged = existing ? {
      ...existing,
      ...clone(poi),
      observedAt: poi.observedAt || existing.observedAt,
      aliases: Array.from(new Set([...(existing.aliases || []), ...(poi.aliases || [])])),
      categories: mergeCategories(existing.categories, poi.categories),
      identifiers: mergeIdentifiers(existing.identifiers, poi.identifiers),
      notes: mergeNotes(existing.notes, poi.notes),
      tags: { ...(existing.tags || {}), ...(poi.tags || {}) },
      attributes: { ...(existing.attributes || {}), ...(poi.attributes || {}) },
      metadata: { ...(existing.metadata || {}), ...(poi.metadata || {}) },
      evidence: mergeEvidence(existing.evidence, poi.evidence),
    } : clone(poi);

    data.normalized[poi.id] = merged;
    schedulePersist();
    return clone(merged);
  }

  function ingestNormalized(pois = []) {
    return (Array.isArray(pois) ? pois : []).map(upsertNormalized);
  }

  function getNormalized(poiId) {
    const value = data.normalized[poiId];
    return value ? clone(value) : null;
  }

  function listNormalized(filters = {}) {
    return Object.values(data.normalized)
      .filter((poi) => !filters.sourceId || poi.source?.id === filters.sourceId)
      .filter((poi) => !filters.destinationId || poi.destination?.id === filters.destinationId)
      .filter((poi) => !filters.categoryId || poi.categories?.some((category) => category.id === filters.categoryId))
      .sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt)))
      .map(clone);
  }

  function upsertConsolidated(poi) {
    if (!consolidatedPOI().isConsolidatedPOI(poi)) throw new Error('Invalid consolidated POI');
    data.consolidated[poi.id] = clone(poi);
    schedulePersist();
    return clone(data.consolidated[poi.id]);
  }

  function replaceConsolidated(pois = []) {
    const next = {};
    for (const poi of Array.isArray(pois) ? pois : []) {
      if (!consolidatedPOI().isConsolidatedPOI(poi)) throw new Error('Invalid consolidated POI');
      next[poi.id] = clone(poi);
    }
    data.consolidated = next;
    schedulePersist();
    return listConsolidated();
  }

  function getConsolidated(poiId) {
    const value = data.consolidated[poiId];
    return value ? clone(value) : null;
  }

  function listConsolidated(filters = {}) {
    return Object.values(data.consolidated)
      .filter((poi) => !filters.sourceId || poi.sources?.some((source) => source.id === filters.sourceId))
      .filter((poi) => !filters.memberId || poi.memberIds?.includes(filters.memberId))
      .filter((poi) => !filters.categoryId || poi.categories?.some((category) => category.id === filters.categoryId))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map(clone);
  }

  function snapshot() {
    return clone(data);
  }

  function clear() {
    data = clone(EMPTY);
    flush();
  }

  window.WanderPOIStore = Object.freeze({
    storageKey: STORAGE_KEY,
    schemaVersion: SCHEMA_VERSION,
    upsertNormalized,
    ingestNormalized,
    getNormalized,
    listNormalized,
    upsertConsolidated,
    replaceConsolidated,
    getConsolidated,
    listConsolidated,
    snapshot,
    flush,
    clear,
  });
})();
