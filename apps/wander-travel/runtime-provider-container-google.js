(() => {
  const context = window.WanderContext;
  const store = window.WanderPOIStore;
  if (!context || !store) return;

  const TYPES = new Set(['hotel','resort_hotel','lodging','shopping_mall','airport','hospital','university','college','school','stadium','sports_complex','amusement_park','theme_park','marina']);

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

  function radiusFor(member) {
    const values = types(member);
    if (values.has('airport')) return 3500;
    if (values.has('university') || values.has('college') || values.has('theme_park') || values.has('amusement_park')) return 1200;
    if (values.has('marina')) return 900;
    if (values.has('stadium') || values.has('sports_complex')) return 750;
    if (values.has('resort_hotel')) return 700;
    if (values.has('shopping_mall')) return 550;
    if (values.has('hospital')) return 500;
    if (values.has('hotel') || values.has('lodging')) return 450;
    return 300;
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

  function members(items) {
    const result = [];
    const seen = new Set();
    for (const item of Array.isArray(items) ? items : []) {
      for (const id of Array.isArray(item?.memberIds) ? item.memberIds : []) {
        if (seen.has(id)) continue;
        seen.add(id);
        const member = store.getNormalized?.(id);
        if (!member || member.source?.id !== 'google-places') continue;
        if (![...types(member)].some((type) => TYPES.has(type))) continue;
        result.push({ item, member });
      }
    }
    return result;
  }

  function apply() {
    const location = context.getEffectiveLocation?.();
    const point = { lat: number(location?.lat), lng: number(location?.lng) };
    if (point.lat === null || point.lng === null) return null;
    const existing = context.value('container.current');
    if (existing?.source === 'openstreetmap') return existing;

    const candidates = members(context.value('nearby.items')).map(({ item, member }) => {
      const viewport = member.attributes?.viewport || null;
      const distanceM = member.location ? distance(point, member.location) : Infinity;
      const radiusM = radiusFor(member);
      return { item, member, viewport, distanceM, radiusM, insideViewport: inside(point, viewport) };
    }).filter((candidate) => candidate.insideViewport || candidate.distanceM <= candidate.radiusM);

    candidates.sort((a, b) => Number(b.insideViewport) - Number(a.insideViewport) || a.distanceM / a.radiusM - b.distanceM / b.radiusM);
    const match = candidates[0];
    if (!match) return null;

    const value = {
      id: match.item.id,
      name: match.item.name || match.member.name || 'Establecimiento',
      location: match.item.location || match.member.location || null,
      address: match.item.address || match.member.address || null,
      tags: match.member.tags || {},
      detectionMode: match.insideViewport ? 'google_viewport' : 'google_large_place_radius',
      source: 'google-places',
      distanceM: Math.round(match.distanceM),
      viewport: match.viewport,
      detectedAt: new Date().toISOString(),
    };
    const options = { source: 'google-container-provider', kind: 'inferred', ttlMs: 600000, confidence: match.insideViewport ? 0.96 : 0.78 };
    context.set('container.current', value, options);
    context.set('container.status', 'inside', options);
    return value;
  }

  context.subscribe((key) => {
    if (key === 'nearby.items' || key === 'location.effective' || key.startsWith('location.effective.')) queueMicrotask(apply);
  });

  const providers = window.WanderProviders || (window.WanderProviders = {});
  providers.googleContainer = Object.freeze({ apply });
  apply();
})();