const GOOGLE_NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const GOOGLE_FIELD_MASK = 'places.id,places.displayName,places.primaryType,places.types,places.location,places.viewport,places.formattedAddress';
const CONTAINER_TYPES = Object.freeze([
  'hotel',
  'resort_hotel',
  'lodging',
  'extended_stay_hotel',
  'guest_house',
  'hostel',
  'motel',
  'apartment_building',
  'apartment_complex',
  'condominium_complex',
  'housing_complex',
  'marina',
  'shopping_mall',
  'airport',
  'hospital',
  'university',
  'college',
  'school',
  'stadium',
  'sports_complex',
  'amusement_park',
  'theme_park',
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function requestNearby(apiKey, { latitude, longitude, radius, includedTypes = null }) {
  const body = {
    languageCode: 'es',
    regionCode: 'DO',
    maxResultCount: 20,
    rankPreference: 'DISTANCE',
    locationRestriction: {
      circle: {
        center: { latitude, longitude },
        radius,
      },
    },
  };
  if (Array.isArray(includedTypes) && includedTypes.length) body.includedTypes = includedTypes;

  const response = await fetch(GOOGLE_NEARBY_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
      'x-goog-fieldmask': GOOGLE_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Google Places request failed.');
    error.status = response.status;
    error.details = payload?.error?.details || null;
    throw error;
  }
  return Array.isArray(payload.places) ? payload.places : [];
}

function mergePlaces(...groups) {
  const places = new Map();
  groups.flat().forEach((place) => {
    if (!place?.id) return;
    const existing = places.get(place.id);
    if (!existing) {
      places.set(place.id, place);
      return;
    }
    places.set(place.id, {
      ...existing,
      ...place,
      types: Array.from(new Set([...(existing.types || []), ...(place.types || [])])),
      viewport: place.viewport || existing.viewport || null,
    });
  });
  return [...places.values()];
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const latitude = Number(requestUrl.searchParams.get('lat'));
  const longitude = Number(requestUrl.searchParams.get('lng'));
  const requestedRadius = Number(requestUrl.searchParams.get('radius') || 250);
  const radius = Math.min(50000, Math.max(1, requestedRadius));

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return json({ ok: false, error: 'lat must be a valid latitude.' }, 400);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return json({ ok: false, error: 'lng must be a valid longitude.' }, 400);
  }
  if (!Number.isFinite(requestedRadius)) {
    return json({ ok: false, error: 'radius must be a valid number.' }, 400);
  }

  const apiKey = context.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return json({ ok: false, error: 'GOOGLE_MAPS_API_KEY is not configured in Cloudflare.' }, 500);
  }

  let genericPlaces;
  try {
    genericPlaces = await requestNearby(apiKey, { latitude, longitude, radius });
  } catch (error) {
    return json({
      ok: false,
      upstreamStatus: error.status || 502,
      error: error.message || 'Google Places request failed.',
      details: error.details || null,
    }, error.status || 502);
  }

  let containerPlaces = [];
  let containerError = null;
  try {
    containerPlaces = await requestNearby(apiKey, {
      latitude,
      longitude,
      radius: Math.min(radius, 2500),
      includedTypes: CONTAINER_TYPES,
    });
  } catch (error) {
    containerError = {
      status: error.status || 502,
      message: error.message || 'Google container search failed.',
    };
  }

  const places = mergePlaces(genericPlaces, containerPlaces);
  return json({
    ok: true,
    query: { latitude, longitude, radius },
    count: places.length,
    places,
    diagnostics: {
      genericCount: genericPlaces.length,
      containerCount: containerPlaces.length,
      containerSearchRadiusM: Math.min(radius, 2500),
      containerError,
    },
  });
}
