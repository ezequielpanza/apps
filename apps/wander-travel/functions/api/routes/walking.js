const GOOGLE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const FIELD_MASK = [
  'routes.distanceMeters',
  'routes.duration',
  'routes.polyline.encodedPolyline',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.navigationInstruction',
  'routes.legs.steps.polyline.encodedPolyline',
].join(',');

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function coordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function seconds(value) {
  const match = String(value || '').match(/^([\d.]+)s$/);
  return match ? Math.round(Number(match[1])) : null;
}

function normalizeRoute(route) {
  const steps = (route?.legs || []).flatMap((leg) => Array.isArray(leg?.steps) ? leg.steps : []).map((step) => ({
    distanceM: Number.isFinite(Number(step?.distanceMeters)) ? Number(step.distanceMeters) : null,
    durationSeconds: seconds(step?.staticDuration),
    maneuver: step?.navigationInstruction?.maneuver || null,
    instruction: step?.navigationInstruction?.instructions || null,
    encodedPolyline: step?.polyline?.encodedPolyline || null,
  }));
  return {
    distanceM: Number(route?.distanceMeters) || 0,
    durationSeconds: seconds(route?.duration) || 0,
    encodedPolyline: route?.polyline?.encodedPolyline || null,
    steps,
  };
}

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  const originLat = coordinate(body?.origin?.lat, -90, 90);
  const originLng = coordinate(body?.origin?.lng, -180, 180);
  const destinationLat = coordinate(body?.destination?.lat, -90, 90);
  const destinationLng = coordinate(body?.destination?.lng, -180, 180);
  if ([originLat, originLng, destinationLat, destinationLng].some((value) => value === null)) {
    return json({ ok: false, error: 'origin and destination must contain valid coordinates.' }, 400);
  }

  const apiKey = context.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return json({ ok: false, error: 'GOOGLE_MAPS_API_KEY is not configured in Cloudflare.' }, 500);

  const upstream = await fetch(GOOGLE_ROUTES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
      'x-goog-fieldmask': FIELD_MASK,
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: originLat, longitude: originLng } } },
      destination: { location: { latLng: { latitude: destinationLat, longitude: destinationLng } } },
      travelMode: 'WALK',
      languageCode: 'es',
      units: 'METRIC',
      polylineQuality: 'OVERVIEW',
      computeAlternativeRoutes: false,
    }),
  });
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return json({
      ok: false,
      upstreamStatus: upstream.status,
      error: payload?.error?.message || 'Google Routes request failed.',
    }, upstream.status);
  }

  const route = payload?.routes?.[0];
  if (!route?.polyline?.encodedPolyline) return json({ ok: false, error: 'No walking route was found.' }, 404);
  return json({ ok: true, mode: 'walking', route: normalizeRoute(route) });
}
