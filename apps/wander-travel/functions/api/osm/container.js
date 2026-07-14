const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': status === 200 ? 'public, max-age=300' : 'no-store',
    },
  });
}

function isContainer(tags = {}) {
  const tourism = String(tags.tourism || '');
  const amenity = String(tags.amenity || '');
  const leisure = String(tags.leisure || '');
  const shop = String(tags.shop || '');
  const aeroway = String(tags.aeroway || '');
  const building = String(tags.building || '');
  const landuse = String(tags.landuse || '');

  return /^(hotel|resort|hostel|guest_house|motel|camp_site|theme_park|attraction)$/.test(tourism) ||
    /^(hospital|university|college|school|marketplace)$/.test(amenity) ||
    /^(marina|sports_centre|stadium|resort|water_park|golf_course)$/.test(leisure) ||
    shop === 'mall' ||
    /^(aerodrome|terminal)$/.test(aeroway) ||
    /^(retail|commercial|hotel|hospital|university|school|civic)$/.test(building) ||
    /^(commercial|retail|recreation_ground|resort)$/.test(landuse);
}

function priority(tags = {}) {
  if (/^(hotel|resort|hostel|guest_house|motel)$/.test(String(tags.tourism || ''))) return 100;
  if (String(tags.shop || '') === 'mall') return 95;
  if (/^(aerodrome|terminal)$/.test(String(tags.aeroway || ''))) return 90;
  if (/^(hospital|university|college|school)$/.test(String(tags.amenity || ''))) return 85;
  if (/^(marina|sports_centre|stadium|water_park|golf_course)$/.test(String(tags.leisure || ''))) return 80;
  if (/^(retail|commercial|hotel|hospital|university|school|civic)$/.test(String(tags.building || ''))) return 70;
  return 50;
}

function nameFromTags(tags = {}) {
  return String(tags.name || tags['name:es'] || tags.brand || tags.operator || '').trim();
}

async function queryOverpass(latitude, longitude) {
  const query = `[out:json][timeout:15];\nis_in(${latitude},${longitude});\nout tags center;`;
  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
      return { endpoint, payload: await response.json() };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Overpass request failed');
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const latitude = Number(url.searchParams.get('lat'));
  const longitude = Number(url.searchParams.get('lng'));

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return json({ ok: false, error: 'lat must be a valid latitude.' }, 400);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return json({ ok: false, error: 'lng must be a valid longitude.' }, 400);
  }

  try {
    const { endpoint, payload } = await queryOverpass(latitude, longitude);
    const containers = (Array.isArray(payload?.elements) ? payload.elements : [])
      .filter((element) => element?.tags && isContainer(element.tags))
      .map((element) => ({
        id: `openstreetmap:${element.type}/${element.id}`,
        osmRef: `${element.type}/${element.id}`,
        name: nameFromTags(element.tags) || 'Establecimiento',
        tags: element.tags,
        location: Number.isFinite(Number(element?.center?.lat)) && Number.isFinite(Number(element?.center?.lon))
          ? { lat: Number(element.center.lat), lng: Number(element.center.lon) }
          : null,
        priority: priority(element.tags),
      }))
      .sort((left, right) => right.priority - left.priority || Number(Boolean(right.name)) - Number(Boolean(left.name)));

    return json({
      ok: true,
      query: { latitude, longitude },
      count: containers.length,
      current: containers[0] || null,
      containers,
      source: { id: 'openstreetmap', endpoint },
    });
  } catch (error) {
    return json({ ok: false, error: error?.message || String(error) }, 502);
  }
}
