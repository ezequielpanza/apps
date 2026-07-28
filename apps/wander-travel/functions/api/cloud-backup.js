const DEVICE_KEY_PATTERN = /^[a-f0-9]{64}$/;
const STORAGE_PREFIX = 'wander-device-backup:v1:';
const MAX_BODY_BYTES = 20 * 1024 * 1024;
const ALLOWED_KEYS = new Set([
  'wander.personalPOIs.v1',
  'wander.sessions.v1',
  'wander.session.active.v1',
  'wander.sessions.settings.v1',
  'wander.recording.profile.v1',
  'wander.travelLog.entries.v1',
  'wander.travelLog.plans.v1',
]);

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

function storageKey(key) {
  return `${STORAGE_PREFIX}${key}`;
}

function validateBackup(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Backup payload must be an object.');
  if (Number(raw.schemaVersion) !== 1) throw new Error('Unsupported backup schema.');
  const clientUpdatedAt = String(raw.clientUpdatedAt || '');
  if (!Number.isFinite(Date.parse(clientUpdatedAt))) throw new Error('clientUpdatedAt must be a valid timestamp.');
  if (!raw.data || typeof raw.data !== 'object' || Array.isArray(raw.data)) throw new Error('Backup data must be an object.');

  const data = {};
  for (const [key, value] of Object.entries(raw.data)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (value !== null && typeof value !== 'string') throw new Error(`Invalid backup value for ${key}.`);
    if (typeof value === 'string') JSON.parse(value);
    data[key] = value;
  }
  for (const key of ALLOWED_KEYS) if (!Object.prototype.hasOwnProperty.call(data, key)) data[key] = null;

  return {
    schemaVersion: 1,
    clientUpdatedAt: new Date(clientUpdatedAt).toISOString(),
    webVersion: String(raw.webVersion || ''),
    apkVersion: String(raw.apkVersion || ''),
    contentHash: String(raw.contentHash || ''),
    data,
  };
}

function requireStore(context) {
  const store = context.env.WANDER_BACKUPS;
  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function') {
    throw new Error('WANDER_BACKUPS is not configured.');
  }
  return store;
}

export async function onRequestGet(context) {
  const key = deviceKey(context.request);
  if (!key) return response({ ok: false, error: 'Invalid device key.' }, 400);

  try {
    const store = requireStore(context);
    const backup = await store.get(storageKey(key), { type: 'json' });
    if (!backup) return response({ ok: true, exists: false, backup: null });
    return response({ ok: true, exists: true, backup });
  } catch (error) {
    return response({ ok: false, error: error?.message || 'Cloud backup read failed.' }, 503);
  }
}

export async function onRequestPut(context) {
  const key = deviceKey(context.request);
  if (!key) return response({ ok: false, error: 'Invalid device key.' }, 400);

  const declaredLength = Number(context.request.headers.get('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) return response({ ok: false, error: 'Backup is too large.' }, 413);

  try {
    const text = await context.request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return response({ ok: false, error: 'Backup is too large.' }, 413);
    }
    const backup = validateBackup(JSON.parse(text));
    const storedAt = new Date().toISOString();
    const stored = { ...backup, storedAt };
    const store = requireStore(context);
    await store.put(storageKey(key), JSON.stringify(stored), {
      metadata: {
        schemaVersion: 1,
        clientUpdatedAt: stored.clientUpdatedAt,
        storedAt,
        webVersion: stored.webVersion,
        apkVersion: stored.apkVersion,
      },
    });
    return response({
      ok: true,
      storedAt,
      clientUpdatedAt: stored.clientUpdatedAt,
      contentHash: stored.contentHash,
    });
  } catch (error) {
    const message = error?.message || 'Cloud backup write failed.';
    const status = /payload|schema|timestamp|backup value|JSON/i.test(message) ? 400 : 503;
    return response({ ok: false, error: message }, status);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'allow': 'GET, PUT, OPTIONS',
      'cache-control': 'no-store',
    },
  });
}
