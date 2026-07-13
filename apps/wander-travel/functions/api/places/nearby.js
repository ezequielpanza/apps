const GOOGLE_NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
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

  const googleResponse = await fetch(GOOGLE_NEARBY_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
      'x-goog-fieldmask': 'places.id,places.displayName,places.primaryType,places.types,places.location,places.formattedAddress',
    },
    body: JSON.stringify({
      maxResultCount: 20,
      rankPreference: 'DISTANCE',
      locationRestriction: {
        circle: {
          center: { latitude, longitude },
          radius,
        },
      },
    }),
  });

  const payload = await googleResponse.json().catch(() => ({}));
  if (!googleResponse.ok) {
    return json({
      ok: false,
      upstreamStatus: googleResponse.status,
      error: payload?.error?.message || 'Google Places request failed.',
      details: payload?.error?.details || null,
    }, googleResponse.status);
  }

  return json({
    ok: true,
    query: { latitude, longitude, radius },
    count: Array.isArray(payload.places) ? payload.places.length : 0,
    places: payload.places || [],
  });
}
