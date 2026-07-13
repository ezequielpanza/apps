(() => {
  const engine = window.WanderPOIEngine;
  const normalized = window.WanderNormalizedPOI;
  if (!engine || !normalized) return;

  const SOURCE_ID = 'google-places';
  const SOURCE_VERSION = 'places-api-new-v1';

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function categoryLabel(value) {
    return String(value || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function parseAddress(label) {
    if (!label) return null;
    return { label: String(label) };
  }

  function normalizePlace(place, request) {
    const latitude = finite(place?.location?.latitude);
    const longitude = finite(place?.location?.longitude);
    const name = String(place?.displayName?.text || '').trim();
    if (!place?.id || !name || latitude === null || longitude === null) return null;

    const types = Array.from(new Set([
      place.primaryType,
      ...(Array.isArray(place.types) ? place.types : []),
    ].filter(Boolean).map(String)));

    const source = {
      id: SOURCE_ID,
      version: SOURCE_VERSION,
      ref: String(place.id),
      url: `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.id)}`,
      strategy: 'nearby-search-distance',
    };

    return normalized.create({
      name,
      categories: types.map((type) => ({ id: type, label: categoryLabel(type), sourceRef: type })),
      identifiers: [{ namespace: 'google-place-id', value: String(place.id) }],
      location: {
        lat: latitude,
        lng: longitude,
        method: 'google-places-api',
        accuracyRadiusM: 8,
        geometryType: 'point',
      },
      address: parseAddress(place.formattedAddress),
      source,
      confidence: 0.98,
      observedAt: request.observedAt || Date.now(),
      destination: request.destination || null,
      tags: {
        primaryType: place.primaryType || null,
        types,
      },
      attributes: {
        formattedAddress: place.formattedAddress || null,
        languageCode: place.displayName?.languageCode || null,
      },
      metadata: {
        validatedBy: 'Google Places API (New)',
        queryCenter: { lat: request.lat, lng: request.lng },
        queryRadiusM: request.radiusM,
      },
      evidence: [{
        type: 'api_place_record',
        value: { placeId: String(place.id), primaryType: place.primaryType || null },
        location: { lat: latitude, lng: longitude, method: 'google-places-api', accuracyRadiusM: 8 },
        confidence: 0.98,
        source,
      }],
    });
  }

  async function search(request = {}) {
    const lat = finite(request.lat);
    const lng = finite(request.lng);
    if (lat === null || lng === null) throw new Error('Google Places requires valid coordinates');

    const radiusM = Math.max(25, Math.min(50000, finite(request.radiusM) || 300));
    const url = new URL('/api/places/nearby', window.location.origin);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lng', String(lng));
    url.searchParams.set('radius', String(radiusM));

    const response = await fetch(url.toString(), {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      const error = new Error(payload.error || `Google Places returned HTTP ${response.status}`);
      error.code = payload.upstreamStatus ? `GOOGLE_PLACES_${payload.upstreamStatus}` : 'GOOGLE_PLACES_UNAVAILABLE';
      throw error;
    }

    const pois = (Array.isArray(payload.places) ? payload.places : [])
      .map((place) => normalizePlace(place, { ...request, lat, lng, radiusM }))
      .filter(Boolean);

    return {
      pois,
      diagnostics: {
        endpoint: '/api/places/nearby',
        requestedRadiusM: radiusM,
        returnedCount: pois.length,
        validated: true,
      },
    };
  }

  engine.register(Object.freeze({
    id: SOURCE_ID,
    version: SOURCE_VERSION,
    capabilities: Object.freeze(['nearby-search', 'validated-pois']),
    search,
  }));
})();