const DEVICE_KEY_PATTERN = /^[a-f0-9]{64}$/;
const TRACK_PREFIX = 'wander-device-track:v1:';
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_BATCH = 40;

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function deviceKey(request) {
  const value = String(request.headers.get('x-wander-device-key') || '').trim().toLowerCase();
  return DEVICE_KEY_PATTERN.test(value) ? value : null;
}

function requireStore(context) {
  const store = context.env.WANDER_BACKUPS;
  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function' || typeof store.list !== 'function') {
    throw new Error('WANDER_BACKUPS is not configured for track history.');
  }
  return store;
}

function prefix(key) {
  return `${TRACK_PREFIX}${key}:`;
}

function storageKey(key, trackId) {
  return `${prefix(key)}${encodeURIComponent(trackId)}`;
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function validatePoint(raw) {
  const lat = finite(raw?.lat);
  const lng = finite(raw?.lng);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error('Track point has invalid coordinates.');
  return {
    lat,
    lng,
    at: finite(raw?.at),
    accuracy: finite(raw?.accuracy),
    speedKmh: finite(raw?.speedKmh),
    heading: finite(raw?.heading),
    altitude: finite(raw?.altitude),
  };
}

function validateTrack(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Track must be an object.');
  const id = String(raw.id || '').trim();
  if (!id || id.length > 180) throw new Error('Track id is invalid.');
  const startedAt = finite(raw.startedAt);
  const endedAt = finite(raw.endedAt, startedAt);
  if (startedAt === null || endedAt === null || endedAt < startedAt) throw new Error('Track timestamps are invalid.');
  const points = Array.isArray(raw.points) ? raw.points.map(validatePoint) : [];
  const status = raw.status === 'deleted' ? 'deleted' : 'closed';
  const name = String(raw.name || '').trim().slice(0, 120);
  return {
    schemaVersion: 1,
    id,
    name,
    day: String(raw.day || '').slice(0, 16),
    sessionId: raw.sessionId ? String(raw.sessionId).slice(0, 180) : null,
    startedAt,
    endedAt,
    durationMs: Math.max(0, finite(raw.durationMs, endedAt - startedAt)),
    distanceM: Math.max(0, finite(raw.distanceM, 0)),
    activity: String(raw.activity || 'unknown').slice(0, 64),
    relevance: String(raw.relevance || 'valid').slice(0, 32),
    status,
    pointCount: points.length,
    points,
    source: String(raw.source || 'wander').slice(0, 64),
    updatedAt: Math.max(startedAt, finite(raw.updatedAt, endedAt)),
    deletedAt: raw.deletedAt == null ? null : finite(raw.deletedAt),
  };
}

function versionOf(track) {
  return finite(track?.updatedAt, finite(track?.deletedAt, finite(track?.endedAt, finite(track?.startedAt, 0)))) || 0;
}

async function readBody(request) {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) throw Object.assign(new Error('Track sync payload is too large.'), { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw Object.assign(new Error('Track sync payload is too large.'), { status: 413 });
  return JSON.parse(text || '{}');
}

async function manifest(store, key) {
  const result = [];
  let cursor = undefined;
  do {
    const page = await store.list({ prefix: prefix(key), limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const entry of page.keys || []) {
      const metadata = entry.metadata || {};
      result.push({
        id: String(metadata.id || decodeURIComponent(entry.name.slice(prefix(key).length))),
        name: String(metadata.name || ''),
        startedAt: finite(metadata.startedAt, 0),
        endedAt: finite(metadata.endedAt, 0),
        updatedAt: finite(metadata.updatedAt, 0),
        status: String(metadata.status || 'closed'),
        pointCount: Math.max(0, finite(metadata.pointCount, 0)),
      });
    }
    cursor = page.list_complete === false ? page.cursor : null;
  } while (cursor);
  return result.sort((a, b) => a.startedAt - b.startedAt);
}

export async function onRequestGet(context) {
  const key = deviceKey(context.request);
  if (!key) return response({ ok: false, error: 'Invalid device key.' }, 400);
  try {
    const store = requireStore(context);
    const tracks = await manifest(store, key);
    return response({ ok: true, schemaVersion: 1, count: tracks.length, tracks });
  } catch (error) {
    return response({ ok: false, error: error?.message || 'Track manifest read failed.' }, 503);
  }
}

export async function onRequestPost(context) {
  const key = deviceKey(context.request);
  if (!key) return response({ ok: false, error: 'Invalid device key.' }, 400);
  try {
    const body = await readBody(context.request);
    if (Number(body.schemaVersion) !== 1 || !Array.isArray(body.ids)) throw new Error('Invalid track fetch request.');
    if (body.ids.length > MAX_BATCH) throw new Error(`At most ${MAX_BATCH} tracks can be fetched at once.`);
    const store = requireStore(context);
    const tracks = [];
    for (const rawId of body.ids) {
      const id = String(rawId || '').trim();
      if (!id || id.length > 180) continue;
      const track = await store.get(storageKey(key, id), { type: 'json' });
      if (track) tracks.push(track);
    }
    return response({ ok: true, schemaVersion: 1, tracks });
  } catch (error) {
    const status = error?.status || (/invalid|at most/i.test(error?.message || '') ? 400 : 503);
    return response({ ok: false, error: error?.message || 'Track fetch failed.' }, status);
  }
}

export async function onRequestPut(context) {
  const key = deviceKey(context.request);
  if (!key) return response({ ok: false, error: 'Invalid device key.' }, 400);
  try {
    const body = await readBody(context.request);
    if (Number(body.schemaVersion) !== 1 || !Array.isArray(body.tracks)) throw new Error('Invalid track sync payload.');
    if (body.tracks.length > MAX_BATCH) throw new Error(`At most ${MAX_BATCH} tracks can be uploaded at once.`);
    const store = requireStore(context);
    let accepted = 0;
    let skipped = 0;
    for (const raw of body.tracks) {
      const track = validateTrack(raw);
      const keyName = storageKey(key, track.id);
      const existing = await store.get(keyName, { type: 'json' });
      const incomingNewer = !existing
        || versionOf(track) > versionOf(existing)
        || (versionOf(track) === versionOf(existing) && Number(track.pointCount || 0) > Number(existing.pointCount || 0))
        || (!existing?.name && track.name);
      if (!incomingNewer) {
        skipped += 1;
        continue;
      }
      await store.put(keyName, JSON.stringify(track), {
        metadata: {
          id: track.id,
          name: track.name,
          startedAt: track.startedAt,
          endedAt: track.endedAt,
          updatedAt: track.updatedAt,
          status: track.status,
          pointCount: track.pointCount,
        },
      });
      accepted += 1;
    }
    return response({ ok: true, schemaVersion: 1, accepted, skipped });
  } catch (error) {
    const status = error?.status || (/invalid|at most|coordinates|timestamp|track id|payload/i.test(error?.message || '') ? 400 : 503);
    return response({ ok: false, error: error?.message || 'Track sync write failed.' }, status);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      allow: 'GET, POST, PUT, OPTIONS',
      'cache-control': 'no-store',
    },
  });
}
