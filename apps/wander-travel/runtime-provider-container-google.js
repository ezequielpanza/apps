(() => {
  const context = window.WanderContext;
  const store = window.WanderPOIStore;
  if (!context || !store) return;

  const TYPES = new Set([
    'hotel', 'resort_hotel', 'lodging', 'extended_stay_hotel', 'guest_house', 'hostel', 'motel',
    'apartment_building', 'apartment_complex', 'condominium_complex', 'housing_complex',
    'shopping_mall', 'airport', 'hospital', 'university', 'college', 'school', 'stadium',
    'sports_complex', 'amusement_park', 'theme_park', 'marina',
  ]);

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function distance(a, b) {
    const radians = (value) => value * Math.PI / 180;
    const radius = 6371008.8;
    const dLat = radians(b.lat - a.lat);
    const dLng = radians(b.lng - a.lng);
    const lat1 = radians(a.lat);
    const lat2 = radians(b.lat);
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.asin(Math.min(1, Math.sqrt(value)));
  }

  function types(member) {
    return new Set([member?.tags?.primaryType, ...(member?.tags?.types || [])].filter(Boolean));
  }

  function hasAny(values, expected) {
    return expected.some((value) => values.has(value));
  }

  function priorityFor(member) {
    const values = types(member);
    if (hasAny(values, ['resort_hotel', 'hotel', 'extended_stay_hotel', 'lodging'])) return 100;
    if (hasAny(values, ['apartment_complex', 'condominium_complex', 'housing_complex', 'apartment_building'])) return 96;
    if (values.has('airport')) return 94;
    if (values.has('shopping_mall')) return 92;
    if (hasAny(values, ['hospital', 'university', 'college', 'school'])) return 88;
    if (hasAny(values, ['theme_park', 'amusement_park', 'stadium', 'sports_complex'])) return 84;
    if (values.has('marina')) return 80;
    return 70;
  }

  function radiusFor(member) {
    const values = types(member);
    if (values.has('airport')) return 3500;
    if (hasAny(values, ['university', 'college', 'theme_park', 'amusement_park'])) return 1200;
    if (values.has('marina')) return 1000;
    if (hasAny(values, ['stadium', 'sports_complex'])) return 800;
    if (values.has('resort_hotel')) return 900;
    if (hasAny(values, ['apartment_complex', 'condominium_complex', 'housing_complex'])) return 750;
    if (values.has('shopping_mall')) return 600;
    if (values.has('hospital')) return 550;
    if (hasAny(values, ['hotel', 'lodging', 'extended_stay_hotel', 'apartment_building'])) return 500;
    return 350;
  }

  function inside(point, viewport) {
    if (!viewport) return false;
    const south = number(viewport.south);
    const west = number(viewport.west);
    const north = number(viewport.north);
    const east = number(viewport.east);
    if ([south, west, north, east].some((value) => value === null)) return false;
    return point.lat >= south && point.lat <= north && point.lng >= west && point.lng <= east;
  }

  function viewportArea(viewport) {
    if (!viewport) return Infinity;
    const south = number(viewport.south);
    const west = number(viewport.west);
    const north = number(viewport.north);
    const east = number(viewport.east);
    if ([south, west, north, east].some((value) => value === null)) return Infinity;
    return Math.max(0, north - south) * Math.max(0, east - west);
  }

  function members(items) {
    const result = [];
    const seenMembers = new Set();
    const consolidated = new Map();
    for (const item of Array.isArray(items) ? items : []) if (item?.id) consolidated.set(String(item.id), item);
    for (const item of store.listConsolidated?.() || []) if (item?.id && !consolidated.has(String(item.id))) consolidated.set(String(item.id), item);

    for (const item of consolidated.values()) {
      for (const id of Array.isArray(item?.memberIds) ? item.memberIds : []) {
        if (seenMembers.has(id)) continue;
        seenMembers.add(id);
        const member = store.getNormalized?.(id);
        if (!member || member.source?.id !== 'google-places') continue;
        if (![...types(member)].some((type) => TYPES.has(type))) continue;
        result.push({ item, member });
      }
    }
    return result;
  }

  function candidateScore(candidate) {
    const proximity = Math.max(0, 1 - candidate.distanceM / Math.max(candidate.radiusM, 1));
    const containment = candidate.insideViewport ? 2 : 0;
    const specificity = Number.isFinite(candidate.viewportArea)
      ? 1 / (1 + candidate.viewportArea * 1000000)
      : 0;
    return containment + proximity + candidate.priority / 200 + specificity * 0.2;
  }

  function writeDiagnostics(payload) {
    context.set('container.googleDiagnostics', payload, {
      source: 'google-container-provider',
      kind: 'derived',
      ttlMs: 15 * 60 * 1000,
      confidence: payload.selected ? 0.9 : 0.65,
    });
  }

  function apply() {
    const location = context.getEffectiveLocation?.();
    const point = { lat: number(location?.lat), lng: number(location?.lng) };
    if (point.lat === null || point.lng === null) return null;
    const existing = context.value('container.current');
    if (existing?.source === 'openstreetmap') return existing;

    const allMembers = members(context.value('nearby.items'));
    const candidates = allMembers.map(({ item, member }) => {
      const viewport = member.attributes?.viewport || null;
      const distanceM = member.location ? distance(point, member.location) : Infinity;
      const radiusM = radiusFor(member);
      const candidate = {
        item,
        member,
        viewport,
        distanceM,
        radiusM,
        insideViewport: inside(point, viewport),
        viewportArea: viewportArea(viewport),
        priority: priorityFor(member),
      };
      candidate.score = candidateScore(candidate);
      return candidate;
    }).filter((candidate) => candidate.insideViewport || candidate.distanceM <= candidate.radiusM);

    candidates.sort((a, b) => b.score - a.score || a.distanceM - b.distanceM);
    const match = candidates[0];
    writeDiagnostics({
      evaluatedAt: new Date().toISOString(),
      googleMembers: allMembers.length,
      eligibleCandidates: candidates.length,
      selected: match ? {
        id: match.item.id,
        name: match.item.name || match.member.name || null,
        distanceM: Math.round(match.distanceM),
        radiusM: match.radiusM,
        insideViewport: match.insideViewport,
        primaryType: match.member.tags?.primaryType || null,
        score: Math.round(match.score * 1000) / 1000,
      } : null,
      candidates: candidates.slice(0, 8).map((candidate) => ({
        name: candidate.item.name || candidate.member.name || null,
        distanceM: Math.round(candidate.distanceM),
        radiusM: candidate.radiusM,
        insideViewport: candidate.insideViewport,
        primaryType: candidate.member.tags?.primaryType || null,
        score: Math.round(candidate.score * 1000) / 1000,
      })),
    });
    if (!match) return null;

    const value = {
      id: match.item.id,
      name: match.item.name || match.member.name || 'Establecimiento',
      location: match.item.location || match.member.location || null,
      address: match.item.address || match.member.address || null,
      tags: match.member.tags || {},
      primaryType: match.member.tags?.primaryType || null,
      detectionMode: match.insideViewport ? 'google_viewport' : 'google_large_place_radius',
      source: 'google-places',
      distanceM: Math.round(match.distanceM),
      radiusM: match.radiusM,
      viewport: match.viewport,
      detectedAt: new Date().toISOString(),
    };
    const options = { source: 'google-container-provider', kind: 'inferred', ttlMs: 600000, confidence: match.insideViewport ? 0.96 : 0.84 };
    context.set('container.current', value, options);
    context.set('container.status', 'inside', options);
    return value;
  }

  context.subscribe((key) => {
    if (
      key === 'nearby.items' ||
      key === 'nearby.status' ||
      key === 'location.effective' ||
      key.startsWith('location.effective.') ||
      key === 'container.status'
    ) queueMicrotask(apply);
  });

  const providers = window.WanderProviders || (window.WanderProviders = {});
  providers.googleContainer = Object.freeze({ apply, radiusFor, priorityFor });
  apply();
})();
