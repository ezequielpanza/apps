(() => {
  const context = window.WanderContext;
  if (!context) return;

  const providers = window.WanderProviders || (window.WanderProviders = {});
  const CACHE_KEY = 'wander.provider.place.cache.v1';
  const CACHE_VERSION = 1;
  const CACHE_CELL_M = 250;
  const CACHE_MAX_ENTRIES = 500;
  const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const DEFAULT_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
  const DEFAULT_MIN_NETWORK_INTERVAL_MS = 5000;

  let config = {
    endpoint: window.WanderPlaceConfig?.endpoint || DEFAULT_ENDPOINT,
    language: window.WanderPlaceConfig?.language || 'es,en',
    minNetworkIntervalMs: Math.max(
      1000,
      Number(window.WanderPlaceConfig?.minNetworkIntervalMs) || DEFAULT_MIN_NETWORK_INTERVAL_MS,
    ),
  };

  let cache = loadCache();
  let lastResolved = null;
  let lastNetworkAt = 0;
  let requestSequence = 0;
  let activeController = null;
  let queuedLocation = null;
  let queuedTimer = null;

  const PLACE_FIELDS = [
    'status','country','countryCode','countryId','region','regionId','city','cityId',
    'district','districtId','neighborhood','neighborhoodId','zone','zoneId','type',
    'displayName','source','sourceRef','resolvedLat','resolvedLng','updatedAt','attribution',
  ];

  function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function validCoordinate(lat, lng) {
    return lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadCache() {
    try {
      const stored = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (stored?.version === CACHE_VERSION && stored.entries && typeof stored.entries === 'object') {
        return stored;
      }
    } catch {}
    return { version: CACHE_VERSION, entries: {} };
  }

  function persistCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
  }

  function pruneCache() {
    const entries = Object.entries(cache.entries);
    const now = Date.now();
    entries.forEach(([key, entry]) => {
      if (!entry?.savedAt || now - entry.savedAt > CACHE_TTL_MS) delete cache.entries[key];
    });

    const remaining = Object.entries(cache.entries);
    if (remaining.length <= CACHE_MAX_ENTRIES) return;
    remaining
      .sort((a, b) => (a[1]?.savedAt || 0) - (b[1]?.savedAt || 0))
      .slice(0, remaining.length - CACHE_MAX_ENTRIES)
      .forEach(([key]) => delete cache.entries[key]);
  }

  function cellKey(lat, lng) {
    const radius = 6378137;
    const safeLat = Math.max(-85, Math.min(85, lat));
    const x = radius * lng * Math.PI / 180;
    const y = radius * Math.log(Math.tan(Math.PI / 4 + safeLat * Math.PI / 360));
    return Math.floor(x / CACHE_CELL_M) + ':' + Math.floor(y / CACHE_CELL_M);
  }

  function distanceMeters(a, b) {
    if (!a || !b) return Infinity;
    const radius = 6371000;
    const p1 = a.lat * Math.PI / 180;
    const p2 = b.lat * Math.PI / 180;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function slug(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown';
  }

  function identity(parentId, type, name) {
    if (!name) return null;
    const prefix = parentId ? parentId + '/' : '';
    return prefix + type + ':' + slug(name);
  }

  function adminValue(admin, levels) {
    for (const level of levels) {
      const value = admin?.['level' + level];
      if (value) return value;
    }
    return null;
  }

  function normalizeResponse(payload, requestLocation) {
    const feature = payload?.features?.[0];
    const geocoding = feature?.properties?.geocoding;
    if (!geocoding) throw new Error('place_response_empty');

    const admin = geocoding.admin || {};
    const country = geocoding.country || adminValue(admin, [2]);
    const countryCode = String(geocoding.country_code || geocoding.countryCode || '').toLowerCase() || null;
    const region = geocoding.state || geocoding.region || adminValue(admin, [4, 3]);
    const district = geocoding.district || geocoding.county || adminValue(admin, [6, 5]);
    const city = geocoding.city || geocoding.town || geocoding.village || geocoding.municipality ||
      geocoding.locality || adminValue(admin, [8, 7]);
    const neighborhood = geocoding.neighbourhood || geocoding.neighborhood || geocoding.suburb ||
      geocoding.quarter || geocoding.borough || adminValue(admin, [10, 9]);
    const zone = neighborhood || district || null;

    const countryId = countryCode ? 'country:' + slug(countryCode) : identity(null, 'country', country);
    const regionId = identity(countryId, 'region', region);
    const cityId = identity(regionId || countryId, 'city', city);
    const districtId = identity(cityId || regionId || countryId, 'district', district);
    const neighborhoodId = identity(districtId || cityId || regionId || countryId, 'neighborhood', neighborhood);
    const zoneId = neighborhoodId || districtId || null;

    const coordinates = feature?.geometry?.coordinates;
    const resolvedLng = finiteNumber(coordinates?.[0]) ?? requestLocation.lng;
    const resolvedLat = finiteNumber(coordinates?.[1]) ?? requestLocation.lat;
    const sourceRef = geocoding.osm_type && geocoding.osm_id
      ? 'osm:' + geocoding.osm_type + ':' + geocoding.osm_id
      : geocoding.place_id ? 'nominatim:' + geocoding.place_id : null;

    return {
      status: 'available',
      country: country || null,
      countryCode,
      countryId,
      region: region || null,
      regionId,
      city: city || null,
      cityId,
      district: district || null,
      districtId,
      neighborhood: neighborhood || null,
      neighborhoodId,
      zone,
      zoneId,
      type: geocoding.type || null,
      displayName: geocoding.label || null,
      source: 'nominatim',
      sourceRef,
      resolvedLat,
      resolvedLng,
      updatedAt: new Date().toISOString(),
      attribution: payload?.geocoding?.attribution || 'Data © OpenStreetMap contributors, ODbL',
    };
  }

  function writePlace(place, confidence = 0.9) {
    const options = {
      source: 'place-provider',
      kind: 'derived',
      ttlMs: 30 * 60 * 1000,
      confidence,
    };

    PLACE_FIELDS.forEach((field) => {
      const key = 'place.' + field;
      const value = place?.[field];
      if (value === null || value === undefined || value === '') context.remove(key);
      else context.set(key, value, options);
    });

    context.set('place.current', {
      country: place.country,
      countryCode: place.countryCode,
      countryId: place.countryId,
      region: place.region,
      regionId: place.regionId,
      city: place.city,
      cityId: place.cityId,
      district: place.district,
      districtId: place.districtId,
      neighborhood: place.neighborhood,
      neighborhoodId: place.neighborhoodId,
      zone: place.zone,
      zoneId: place.zoneId,
      type: place.type,
      source: place.source,
      sourceRef: place.sourceRef,
    }, options);
  }

  function writeStatus(status, confidence = 1) {
    context.set('place.status', status, {
      source: 'place-provider',
      kind: 'derived',
      ttlMs: 5 * 60 * 1000,
      confidence,
    });
  }

  function currentLocation() {
    const effective = context.getEffectiveLocation?.();
    if (!effective) return null;
    const lat = finiteNumber(effective.lat);
    const lng = finiteNumber(effective.lng);
    if (!validCoordinate(lat, lng)) return null;
    return {
      lat,
      lng,
      speedKmh: Math.max(0, (finiteNumber(effective.speedMps) || 0) * 3.6),
      source: effective.source || 'unknown',
    };
  }

  function lookupDistanceFor(speedKmh) {
    if (speedKmh >= 100) return 5000;
    if (speedKmh >= 30) return 1500;
    if (speedKmh >= 8) return 600;
    return 250;
  }

  function shouldResolve(location) {
    if (!lastResolved) return true;
    const thresholdM = lookupDistanceFor(location.speedKmh);
    const movedM = distanceMeters(lastResolved.location, location);
    const ageMs = Date.now() - lastResolved.at;
    return movedM >= thresholdM || ageMs >= 15 * 60 * 1000;
  }

  function cachedPlace(location) {
    const entry = cache.entries[cellKey(location.lat, location.lng)];
    if (!entry?.place || !entry.savedAt || Date.now() - entry.savedAt > CACHE_TTL_MS) return null;
    return clone(entry.place);
  }

  function saveCache(location, place) {
    cache.entries[cellKey(location.lat, location.lng)] = {
      savedAt: Date.now(),
      location: { lat: location.lat, lng: location.lng },
      place,
    };
    pruneCache();
    persistCache();
  }

  function buildUrl(location) {
    const url = new URL(config.endpoint, window.location.href);
    url.searchParams.set('format', 'geocodejson');
    url.searchParams.set('lat', String(location.lat));
    url.searchParams.set('lon', String(location.lng));
    url.searchParams.set('zoom', '14');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('layer', 'address');
    url.searchParams.set('accept-language', config.language);
    return url.toString();
  }

  function scheduleQueued() {
    if (queuedTimer || !queuedLocation) return;
    const delay = Math.max(50, config.minNetworkIntervalMs - (Date.now() - lastNetworkAt));
    queuedTimer = setTimeout(() => {
      queuedTimer = null;
      const location = queuedLocation;
      queuedLocation = null;
      resolveLocation(location);
    }, delay);
  }

  async function resolveNetwork(location) {
    const now = Date.now();
    if (now - lastNetworkAt < config.minNetworkIntervalMs) {
      queuedLocation = location;
      scheduleQueued();
      return;
    }

    const sequence = ++requestSequence;
    if (activeController) activeController.abort();
    activeController = new AbortController();
    lastNetworkAt = now;
    writeStatus('resolving', 0.7);

    try {
      const response = await fetch(buildUrl(location), {
        signal: activeController.signal,
        headers: { Accept: 'application/geocode+json, application/json' },
        referrerPolicy: 'strict-origin-when-cross-origin',
      });
      if (!response.ok) throw new Error('place_http_' + response.status);
      const payload = await response.json();
      if (sequence !== requestSequence) return;

      const place = normalizeResponse(payload, location);
      saveCache(location, place);
      lastResolved = { location, at: Date.now(), place };
      writePlace(place, 0.9);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      if (sequence !== requestSequence) return;
      writeStatus('unavailable', 0.4);
    } finally {
      if (sequence === requestSequence) activeController = null;
    }
  }

  function resolveLocation(location) {
    if (!location) return;
    if (!shouldResolve(location)) return;

    const cached = cachedPlace(location);
    if (cached) {
      lastResolved = { location, at: Date.now(), place: cached };
      writePlace(cached, 0.88);
      return;
    }

    resolveNetwork(location);
  }

  function refresh(force = false) {
    const location = currentLocation();
    if (!location) {
      writeStatus('pending', 0.5);
      return false;
    }
    if (force) lastResolved = null;
    resolveLocation(location);
    return true;
  }

  function configure(next = {}) {
    config = {
      ...config,
      ...next,
      minNetworkIntervalMs: Math.max(1000, Number(next.minNetworkIntervalMs ?? config.minNetworkIntervalMs)),
    };
    lastResolved = null;
    refresh(true);
    return { ...config };
  }

  function clearCache() {
    cache = { version: CACHE_VERSION, entries: {} };
    persistCache();
    lastResolved = null;
  }

  context.subscribe((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) refresh(false);
  });

  providers.place = {
    refresh,
    configure,
    clearCache,
    getConfig: () => ({ ...config }),
    getCurrent: () => lastResolved ? clone(lastResolved.place) : null,
  };

  pruneCache();
  persistCache();
  refresh(false);
})();
