(() => {
  const context = window.WanderContext;
  if (!context) return;

  let lastId = null;

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
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

  function clear() {
    if (lastId === null && !context.value('currentPOI.current')) return;
    context.remove('currentPOI.current');
    context.remove('currentPOI.value');
    context.remove('currentPOI.distanceM');
    context.remove('currentPOI.status');
    lastId = null;
  }

  function detect() {
    const location = context.getEffectiveLocation?.();
    const items = context.value('nearby.items');
    if (!location || !Array.isArray(items) || !items.length) {
      clear();
      return null;
    }

    const lat = finite(location.lat);
    const lng = finite(location.lng);
    if (lat === null || lng === null) {
      clear();
      return null;
    }

    const accuracy = Math.max(5, finite(location.accuracy) ?? 50);
    const speedKmh = Math.max(0, finite(context.value('motion.speedKmh')) ?? 0);
    const moving = context.value('motion.status') === 'moving';
    const enterRadius = Math.min(moving ? 75 : 120, Math.max(moving ? 28 : 35, accuracy * (moving ? 1.15 : 1.5)));
    const exitRadius = enterRadius * 1.45;

    const candidates = items
      .filter((item) => item?.location && finite(item.location.lat) !== null && finite(item.location.lng) !== null)
      .map((item) => ({
        item,
        distanceM: distanceMeters({ lat, lng }, { lat: Number(item.location.lat), lng: Number(item.location.lng) }),
      }))
      .sort((a, b) => a.distanceM - b.distanceM);

    const nearest = candidates[0];
    if (!nearest) {
      clear();
      return null;
    }

    const sameAsCurrent = lastId && String(nearest.item.id) === String(lastId);
    const threshold = sameAsCurrent ? exitRadius : enterRadius;
    if (nearest.distanceM > threshold || (moving && speedKmh > 45 && nearest.distanceM > 35)) {
      clear();
      return null;
    }

    const confidence = Math.max(0.35, Math.min(0.98, 1 - nearest.distanceM / Math.max(threshold, 1)));
    const value = {
      id: nearest.item.id,
      name: nearest.item.name || 'POI actual',
      categories: nearest.item.categories || [],
      location: nearest.item.location,
      address: nearest.item.address || null,
      distanceM: Math.round(nearest.distanceM),
      accuracyM: Math.round(accuracy),
      detectedAt: new Date().toISOString(),
    };

    const options = {
      source: 'current-poi-provider',
      kind: 'inferred',
      ttlMs: 60000,
      confidence,
    };
    context.set('currentPOI.current', value, options);
    context.set('currentPOI.value', value, options);
    context.set('currentPOI.distanceM', value.distanceM, options);
    context.set('currentPOI.status', 'detected', options);
    lastId = value.id;
    return value;
  }

  context.subscribe((key) => {
    if (
      key === 'nearby.items' ||
      key === 'location.effective' ||
      key.startsWith('location.effective.') ||
      key === 'motion.status' ||
      key === 'motion.speedKmh'
    ) detect();
  });

  const providers = window.WanderProviders || (window.WanderProviders = {});
  providers.currentPOI = Object.freeze({ detect, clear, getCurrent: () => context.value('currentPOI.current') || null });
  detect();
})();