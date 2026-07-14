(() => {
  const context = window.WanderContext;
  if (!context) return;

  let lastRequest = null;
  let activePromise = null;
  let refreshTimer = null;

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

  function currentLocation() {
    const location = context.getEffectiveLocation?.();
    const lat = finite(location?.lat);
    const lng = finite(location?.lng);
    if (lat === null || lng === null) return null;
    return { lat, lng, accuracy: finite(location?.accuracy), source: location?.source || 'unknown' };
  }

  function shouldRefresh(location, force = false) {
    if (force || !lastRequest) return true;
    const movedM = distanceMeters(lastRequest.location, location);
    const ageMs = Date.now() - lastRequest.at;
    return movedM >= 80 || ageMs >= 10 * 60 * 1000;
  }

  function scheduleRefresh(delayMs = 500) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refresh(false);
    }, delayMs);
  }

  function writeContainer(container, payload, confidence = 0.97) {
    const options = {
      source: 'container-provider',
      kind: 'observed',
      ttlMs: 15 * 60 * 1000,
      confidence,
    };

    if (container) {
      const value = {
        id: container.id,
        name: container.name || 'Establecimiento',
        location: container.location || null,
        tags: container.tags || {},
        osmRef: container.osmRef || null,
        detectionMode: 'osm_is_in',
        source: 'openstreetmap',
        detectedAt: new Date().toISOString(),
      };
      context.set('container.current', value, options);
      context.set('container.status', 'inside', options);
    } else {
      context.remove('container.current');
      context.set('container.status', 'none', options);
    }

    context.set('container.diagnostics', {
      count: payload?.count || 0,
      source: payload?.source || null,
      query: payload?.query || null,
      updatedAt: new Date().toISOString(),
    }, { ...options, ttlMs: 30 * 60 * 1000 });
  }

  async function refresh(force = false) {
    const location = currentLocation();
    if (!location || !shouldRefresh(location, force)) return null;
    if (activePromise) return activePromise;

    lastRequest = { location: { lat: location.lat, lng: location.lng }, at: Date.now() };
    context.set('container.status', 'searching', {
      source: 'container-provider',
      kind: 'derived',
      ttlMs: 2 * 60 * 1000,
      confidence: 0.7,
    });

    const endpoint = `/api/osm/container?lat=${encodeURIComponent(location.lat)}&lng=${encodeURIComponent(location.lng)}`;
    activePromise = fetch(endpoint, { headers: { accept: 'application/json' }, cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Container lookup failed with HTTP ${response.status}`);
        writeContainer(payload.current || null, payload);
        return payload.current || null;
      })
      .catch((error) => {
        context.set('container.status', 'unavailable', {
          source: 'container-provider',
          kind: 'derived',
          ttlMs: 5 * 60 * 1000,
          confidence: 0.4,
        });
        context.set('container.diagnostics', {
          error: error?.message || String(error),
          updatedAt: new Date().toISOString(),
        }, {
          source: 'container-provider',
          kind: 'derived',
          ttlMs: 10 * 60 * 1000,
          confidence: 0.4,
        });
        return null;
      })
      .finally(() => { activePromise = null; });

    return activePromise;
  }

  context.subscribe((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) scheduleRefresh(400);
  });

  const providers = window.WanderProviders || (window.WanderProviders = {});
  providers.container = Object.freeze({
    refresh,
    getCurrent: () => context.value('container.current') || null,
  });

  refresh(false);
})();
