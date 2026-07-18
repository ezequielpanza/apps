(() => {
  const context = window.WanderContext;
  if (!context || window.WanderPlaceHierarchy) return;

  const store = window.WanderPOIStore;
  const SOURCE_BONUS = Object.freeze({
    'personal-poi': 22,
    user: 22,
    google_places: 10,
    google: 10,
    openstreetmap: 8,
    wikidata: 4,
    nearby: 3,
    administrative: 0,
  });
  const SWITCH_MARGIN = 8;
  const MAX_DIAGNOSTIC_CANDIDATES = 12;

  let currentLeafId = null;
  let lastSignature = null;
  let evaluationQueued = false;

  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function radians(value) {
    return value * Math.PI / 180;
  }

  function distanceMeters(a, b) {
    const radius = 6371008.8;
    const dLat = radians(b.lat - a.lat);
    const dLng = radians(b.lng - a.lng);
    const lat1 = radians(a.lat);
    const lat2 = radians(b.lat);
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.asin(Math.min(1, Math.sqrt(value)));
  }

  function pointInRing(point, ring) {
    if (!Array.isArray(ring) || ring.length < 4) return false;
    let inside = false;
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
      const current = ring[index];
      const prior = ring[previous];
      const yi = finite(current?.lat);
      const xi = finite(current?.lng);
      const yj = finite(prior?.lat);
      const xj = finite(prior?.lng);
      if ([yi, xi, yj, xj].some((value) => value === null)) continue;
      const intersects = ((yi > point.lat) !== (yj > point.lat)) &&
        point.lng < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function shortName(value) {
    return String(value || '')
      .replace(/^hotel\s+/i, '')
      .replace(/\s*[-–—]\s*(adults? only|solo adultos|all[- ]inclusive.*)$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function sourceIds(item) {
    const direct = [item?.source?.id, item?.source];
    const multi = Array.isArray(item?.sources) ? item.sources.map((source) => typeof source === 'string' ? source : source?.id) : [];
    return [...new Set([...direct, ...multi].map((value) => String(value || '').trim()).filter(Boolean))];
  }

  function primarySource(item, fallback = 'nearby') {
    return sourceIds(item)[0] || fallback;
  }

  function categoryIds(item) {
    return (Array.isArray(item?.categories) ? item.categories : [])
      .map((category) => String(category?.id || category?.label || category || '').toLowerCase())
      .filter(Boolean);
  }

  function isContainer(item) {
    const categories = categoryIds(item).join(' ');
    const tags = item?.tagsBySource?.openstreetmap || item?.tags || {};
    return /hotel|resort|mall|marina|airport|aerodrome|terminal|hospital|university|college|school|stadium|sports_centre|theme_park|camp_site|marketplace|commercial|retail/.test(categories) ||
      /^(hotel|resort|hostel|guest_house|motel|camp_site|theme_park)$/.test(String(tags.tourism || '')) ||
      /^(marina|sports_centre|stadium|resort|water_park)$/.test(String(tags.leisure || '')) ||
      String(tags.shop || '') === 'mall' ||
      /^(aerodrome|terminal)$/.test(String(tags.aeroway || '')) ||
      /^(retail|commercial|hotel|hospital|university|school|civic)$/.test(String(tags.building || ''));
  }

  function containmentGeometry(item) {
    return item?.attributesBySource?.openstreetmap?.containmentGeometry || item?.attributes?.containmentGeometry || null;
  }

  function isInsideGeometry(point, geometry) {
    if (!geometry) return false;
    const bounds = geometry.bounds;
    if (bounds && !(point.lat >= finite(bounds.south) && point.lat <= finite(bounds.north) && point.lng >= finite(bounds.west) && point.lng <= finite(bounds.east))) return false;
    const polygons = Array.isArray(geometry.polygons) ? geometry.polygons : [];
    return polygons.some((ring) => pointInRing(point, ring));
  }

  function compactAdministrative(value, kind) {
    if (value == null || value === '') return null;
    if (typeof value === 'object') {
      const name = shortName(value.name || value.label || value.displayName);
      if (!name) return null;
      return {
        id: String(value.id || value.placeId || `${kind}:${name.toLowerCase()}`),
        name,
        kind,
        source: value.source || context.value('place.source') || 'administrative',
        confidence: finite(value.confidence) ?? 0.85,
      };
    }
    const name = shortName(value);
    return name ? {
      id: `${kind}:${name.toLowerCase()}`,
      name,
      kind,
      source: context.value('place.source') || 'administrative',
      confidence: 0.85,
    } : null;
  }

  function dedupe(items) {
    const byId = new Map();
    for (const item of items) {
      if (!item?.id) continue;
      const key = String(item.id);
      const existing = byId.get(key);
      if (!existing || Number(item.confidence || 0) > Number(existing.confidence || 0)) byId.set(key, item);
    }
    return [...byId.values()];
  }

  function allPOIs() {
    const nearby = Array.isArray(context.value('nearby.items')) ? context.value('nearby.items') : [];
    const stored = store?.listConsolidated?.() || [];
    return dedupe([...nearby, ...stored]);
  }

  function personalCandidates(point, accuracy) {
    const items = Array.isArray(context.value('personalPOI.items')) ? context.value('personalPOI.items') : [];
    return items.map((item) => {
      const lat = finite(item.lat);
      const lng = finite(item.lng);
      if (lat === null || lng === null) return null;
      const distanceM = distanceMeters(point, { lat, lng });
      const radiusM = Math.max(5, finite(item.radiusM) ?? 35);
      const thresholdM = radiusM + Math.min(25, accuracy * 0.45);
      if (distanceM > thresholdM) return null;
      return makeCandidate({
        id: item.id,
        name: item.name,
        kind: 'personal',
        source: 'personal-poi',
        confidence: 1,
        location: { lat, lng },
        distanceM,
        thresholdM,
        inside: distanceM <= radiusM,
        radiusM,
        raw: item,
      });
    }).filter(Boolean);
  }

  function specificCandidates(point, accuracy) {
    const motion = String(context.value('motion.status') || '');
    const speedKmh = Math.max(0, finite(context.value('motion.speedKmh')) ?? 0);
    const baseThreshold = Math.min(motion === 'moving' ? 80 : 140, Math.max(motion === 'moving' ? 28 : 40, accuracy * (motion === 'moving' ? 1.15 : 1.65)));

    return allPOIs().map((item) => {
      if (isContainer(item)) return null;
      const lat = finite(item?.location?.lat);
      const lng = finite(item?.location?.lng);
      if (lat === null || lng === null) return null;
      const distanceM = distanceMeters(point, { lat, lng });
      const thresholdM = String(item.id) === String(currentLeafId) ? baseThreshold * 1.35 : baseThreshold;
      if (distanceM > thresholdM) return null;
      if (motion === 'moving' && speedKmh > 45 && distanceM > 35) return null;
      return makeCandidate({
        id: item.id,
        name: item.name,
        kind: 'specific',
        source: primarySource(item),
        confidence: finite(item.confidence) ?? 0.7,
        location: { lat, lng },
        distanceM,
        thresholdM,
        inside: false,
        categories: clone(item.categories || []),
        raw: item,
      });
    }).filter(Boolean);
  }

  function containerCandidates(point) {
    const candidates = [];
    const addCurrent = (item, sourceHint) => {
      if (!item?.id || !item?.name) return;
      candidates.push(makeCandidate({
        id: item.id,
        name: item.name,
        kind: 'container',
        source: item.source || sourceHint,
        confidence: finite(item.confidence) ?? 0.97,
        location: item.location || null,
        distanceM: 0,
        thresholdM: 1,
        inside: true,
        categories: clone(item.categories || []),
        raw: item,
      }));
    };

    addCurrent(context.value('container.current'), 'openstreetmap');
    addCurrent(context.value('currentPOI.container'), 'openstreetmap');

    for (const item of allPOIs()) {
      if (!isContainer(item)) continue;
      const geometry = containmentGeometry(item);
      if (!isInsideGeometry(point, geometry)) continue;
      addCurrent(item, primarySource(item));
    }

    return dedupe(candidates);
  }

  function makeCandidate(input) {
    const source = String(input.source || 'nearby');
    const confidence = Math.max(0, Math.min(1, finite(input.confidence) ?? 0.5));
    const thresholdM = Math.max(1, finite(input.thresholdM) ?? 1);
    const distanceM = Math.max(0, finite(input.distanceM) ?? 0);
    const tierBase = input.kind === 'personal' ? 52 : input.kind === 'specific' ? 35 : 25;
    const distanceScore = input.inside ? 24 : Math.max(0, 24 * (1 - distanceM / thresholdM));
    const confidenceScore = confidence * 14;
    const sourceScore = SOURCE_BONUS[source] ?? 2;
    const continuityScore = String(input.id) === String(currentLeafId) ? 10 : 0;
    const total = Math.max(0, Math.min(100, tierBase + distanceScore + confidenceScore + sourceScore + continuityScore));

    return {
      id: String(input.id),
      name: shortName(input.name) || 'Lugar',
      kind: input.kind,
      source,
      sources: sourceIds(input.raw || input),
      confidence,
      location: clone(input.location || null),
      distanceM: Math.round(distanceM * 10) / 10,
      thresholdM: Math.round(thresholdM * 10) / 10,
      radiusM: finite(input.radiusM),
      inside: Boolean(input.inside),
      categories: clone(input.categories || []),
      score: Math.round(total * 10) / 10,
      scoreBreakdown: {
        tier: tierBase,
        distance: Math.round(distanceScore * 10) / 10,
        confidence: Math.round(confidenceScore * 10) / 10,
        source: sourceScore,
        continuity: continuityScore,
      },
      raw: clone(input.raw || null),
    };
  }

  function rank(candidates) {
    return [...candidates].sort((left, right) => right.score - left.score || left.distanceM - right.distanceM || right.confidence - left.confidence);
  }

  function keepCurrentWhenClose(ranked) {
    const best = ranked[0] || null;
    if (!best || !currentLeafId || best.id === currentLeafId) return { selected: best, reason: best ? 'highest_score' : 'no_candidate' };
    const current = ranked.find((candidate) => candidate.id === currentLeafId);
    if (current && best.score < current.score + SWITCH_MARGIN) return { selected: current, reason: 'continuity_margin' };
    return { selected: best, reason: 'challenger_exceeded_margin' };
  }

  function publicCandidate(candidate) {
    if (!candidate) return null;
    return {
      id: candidate.id,
      name: candidate.name,
      label: candidate.name,
      kind: candidate.kind,
      source: candidate.source,
      sources: [...candidate.sources],
      confidence: Math.round(Math.min(1, candidate.score / 100) * 100) / 100,
      sourceConfidence: candidate.confidence,
      location: clone(candidate.location),
      distanceM: Math.round(candidate.distanceM),
      radiusM: candidate.radiusM,
      inside: candidate.inside,
      categories: clone(candidate.categories),
      score: candidate.score,
      detectedAt: new Date().toISOString(),
    };
  }

  function publish(hierarchy, diagnostics) {
    const options = {
      source: 'place-hierarchy-engine',
      kind: 'inferred',
      ttlMs: 90000,
      confidence: hierarchy.confidence,
    };

    context.set('placeHierarchy.current', hierarchy, options);
    context.set('placeHierarchy.status', hierarchy.status, options);
    context.set('placeHierarchy.confidence', hierarchy.confidence, options);
    context.set('placeHierarchy.source', hierarchy.source, options);
    context.set('placeHierarchy.path', hierarchy.path, options);
    context.set('placeHierarchy.diagnostics', diagnostics, { ...options, ttlMs: 5 * 60 * 1000 });

    for (const key of ['personal', 'specific', 'container', 'zone', 'city', 'country']) {
      if (hierarchy[key]) context.set(`placeHierarchy.${key}`, hierarchy[key], options);
      else context.remove(`placeHierarchy.${key}`);
    }

    const leaf = hierarchy.personal || hierarchy.specific || hierarchy.container;
    if (leaf) {
      const legacy = {
        ...leaf,
        primaryType: leaf.kind,
        detectionMode: leaf.inside ? 'inside_area' : 'hierarchical_score',
        container: hierarchy.container,
      };
      context.set('currentPOI.current', legacy, options);
      context.set('currentPOI.value', legacy, options);
      context.set('currentPOI.distanceM', legacy.distanceM || 0, options);
      context.set('currentPOI.status', leaf.kind === 'container' ? 'inside_container' : 'detected', options);
      if (hierarchy.container) context.set('currentPOI.container', hierarchy.container, options);
    }

    const signature = JSON.stringify([
      hierarchy.current?.id || null,
      hierarchy.specific?.id || null,
      hierarchy.container?.id || null,
      hierarchy.zone?.id || null,
      hierarchy.city?.id || null,
      hierarchy.country?.id || null,
    ]);
    if (signature !== lastSignature) {
      lastSignature = signature;
      queueMicrotask(() => window.WanderSituationEngine?.evaluate?.());
    }
  }

  function clear() {
    currentLeafId = null;
    for (const key of ['current', 'status', 'confidence', 'source', 'path', 'diagnostics', 'personal', 'specific', 'container', 'zone', 'city', 'country']) {
      context.remove(`placeHierarchy.${key}`);
    }
  }

  function evaluate() {
    const location = context.getEffectiveLocation?.();
    const lat = finite(location?.lat);
    const lng = finite(location?.lng);
    if (lat === null || lng === null) {
      clear();
      return null;
    }

    const point = { lat, lng };
    const accuracy = Math.max(5, finite(location.accuracy) ?? 50);
    const personalRanked = rank(personalCandidates(point, accuracy));
    const specificRanked = rank(specificCandidates(point, accuracy));
    const containerRanked = rank(containerCandidates(point));
    const leafRanked = rank([...personalRanked, ...specificRanked, ...containerRanked]);
    const selection = keepCurrentWhenClose(leafRanked);
    const selectedLeaf = selection.selected;
    currentLeafId = selectedLeaf?.id || null;

    const personal = publicCandidate(personalRanked[0]);
    const specific = publicCandidate(specificRanked[0]);
    const container = publicCandidate(containerRanked[0]);
    const zone = compactAdministrative(context.value('place.zone'), 'zone');
    const city = compactAdministrative(context.value('place.city'), 'city');
    const country = compactAdministrative(context.value('place.country'), 'country');
    const current = publicCandidate(selectedLeaf) || zone || city || country;
    const path = [personal, specific, container, zone, city, country]
      .filter(Boolean)
      .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);
    const confidence = current ? Math.max(0.35, Math.min(1, finite(current.confidence) ?? 0.7)) : 0;
    const hierarchy = {
      status: current ? (selectedLeaf ? 'selected' : 'administrative_only') : 'pending',
      current,
      personal,
      specific,
      container,
      zone,
      city,
      country,
      path,
      confidence,
      source: current?.source || 'none',
      accuracyM: Math.round(accuracy),
      evaluatedAt: new Date().toISOString(),
    };

    const diagnostics = {
      evaluatedAt: hierarchy.evaluatedAt,
      location: { lat, lng, accuracyM: Math.round(accuracy), source: location.source || 'unknown' },
      selectionReason: selection.reason,
      switchMargin: SWITCH_MARGIN,
      selectedId: current?.id || null,
      selectedKind: current?.kind || null,
      candidates: leafRanked.slice(0, MAX_DIAGNOSTIC_CANDIDATES).map((candidate, index) => ({
        rank: index + 1,
        id: candidate.id,
        name: candidate.name,
        kind: candidate.kind,
        source: candidate.source,
        score: candidate.score,
        distanceM: candidate.distanceM,
        thresholdM: candidate.thresholdM,
        inside: candidate.inside,
        confidence: candidate.confidence,
        selected: candidate.id === selectedLeaf?.id,
        scoreBreakdown: candidate.scoreBreakdown,
      })),
      administrative: { zone, city, country },
    };

    publish(hierarchy, diagnostics);
    return hierarchy;
  }

  function schedule() {
    if (evaluationQueued) return;
    evaluationQueued = true;
    queueMicrotask(() => {
      evaluationQueued = false;
      evaluate();
    });
  }

  context.subscribe((key) => {
    if (typeof key !== 'string') return;
    if (
      key === 'nearby.items' ||
      key === 'personalPOI.items' ||
      key === 'container.current' ||
      key === 'currentPOI.container' ||
      key === 'location.effective' ||
      key.startsWith('location.effective.') ||
      key === 'motion.status' ||
      key === 'motion.speedKmh' ||
      key === 'place.zone' ||
      key === 'place.city' ||
      key === 'place.country'
    ) schedule();
  });

  window.addEventListener('wander:personal-poi-created', schedule);
  window.addEventListener('wander:personal-poi-updated', schedule);
  window.addEventListener('wander:personal-poi-removed', schedule);

  window.WanderPlaceHierarchy = Object.freeze({
    evaluate,
    clear,
    getCurrent: () => clone(context.value('placeHierarchy.current')),
    getDiagnostics: () => clone(context.value('placeHierarchy.diagnostics')),
    scoreMargin: SWITCH_MARGIN,
  });

  evaluate();
})();
