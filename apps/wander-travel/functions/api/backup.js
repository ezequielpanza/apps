const LATEST_KEY = 'wander-test/shared/latest-v1.json';
const PREVIOUS_KEY = 'wander-test/shared/previous-v1.json';
const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const ALLOWED_ORIGINS = new Set([
  'https://wander-travel.pages.dev',
  'http://localhost',
  'https://localhost',
]);
const ALLOWED_DATA_KEYS = new Set([
  'wander.personalPOIs.v1',
  'wander.sessions.v1',
  'wander.session.active.v1',
  'wander.sessions.settings.v1',
  'wander.recording.profile.v1',
  'wander.travelLog.entries.v1',
  'wander.travelLog.plans.v1',
]);

function requestOrigin(request) {
  const origin = request.headers.get('origin');
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function corsHeaders(request) {
  const origin = requestOrigin(request);
  return {
    ...(origin ? { 'access-control-allow-origin': origin } : {}),
    'access-control-allow-methods': 'GET, PUT, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, if-match',
    'access-control-expose-headers': 'etag, x-wander-backup-revision, x-wander-backup-updated-at',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function json(request, data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(request),
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

async function digest(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

async function safeEqual(left, right) {
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function authorize(context) {
  const expected = String(context.env.WANDER_BACKUP_SPACE_TOKEN || '').trim();
  if (!expected) return { ok: false, response: json(context.request, { ok: false, error: 'Backup token is not configured.' }, 503) };
  const header = String(context.request.headers.get('authorization') || '');
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!provided || !(await safeEqual(provided, expected))) {
    return { ok: false, response: json(context.request, { ok: false, error: 'Unauthorized.' }, 401) };
  }
  return { ok: true };
}

function bucket(context) {
  return context.env.WANDER_BACKUP_BUCKET || null;
}

function normalizeData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!ALLOWED_DATA_KEYS.has(key)) continue;
    data[key] = value;
  }
  return data;
}

function countArray(value) {
  return Array.isArray(value) ? value.length : 0;
}

function counts(data) {
  return {
    points: countArray(data['wander.personalPOIs.v1']),
    routes: countArray(data['wander.sessions.v1']) + (data['wander.session.active.v1']?.id ? 1 : 0),
    logEntries: countArray(data['wander.travelLog.entries.v1']),
    plans: countArray(data['wander.travelLog.plans.v1']),
  };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'Backup payload must be an object.';
  if (Number(payload.schemaVersion) !== 1) return 'Unsupported backup schema version.';
  const data = normalizeData(payload.data);
  if (!data) return 'Backup data is invalid.';
  return null;
}

function objectHeaders(object) {
  const revision = object?.customMetadata?.revision || object?.httpEtag || '';
  const updatedAt = object?.customMetadata?.updatedAt || '';
  return {
    ...(object?.httpEtag ? { etag: object.httpEtag } : {}),
    ...(revision ? { 'x-wander-backup-revision': revision } : {}),
    ...(updatedAt ? { 'x-wander-backup-updated-at': updatedAt } : {}),
  };
}

function parseStoredBackup(text, object) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return object ? {
      ok: false,
      exists: true,
      revision: object.customMetadata?.revision || object.httpEtag || null,
      updatedAt: object.customMetadata?.updatedAt || null,
      error: 'Stored backup could not be parsed.',
    } : null;
  }
}

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestGet(context) {
  const authorization = await authorize(context);
  if (!authorization.ok) return authorization.response;
  const storage = bucket(context);
  if (!storage) return json(context.request, { ok: false, error: 'R2 backup bucket is not configured.' }, 503);

  const object = await storage.get(LATEST_KEY);
  if (!object) return json(context.request, { ok: true, exists: false }, 404);
  const text = await object.text();
  return new Response(text, {
    status: 200,
    headers: {
      ...corsHeaders(context.request),
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...objectHeaders(object),
    },
  });
}

export async function onRequestPut(context) {
  const authorization = await authorize(context);
  if (!authorization.ok) return authorization.response;
  const storage = bucket(context);
  if (!storage) return json(context.request, { ok: false, error: 'R2 backup bucket is not configured.' }, 503);

  const contentLength = Number(context.request.headers.get('content-length') || 0);
  if (contentLength > MAX_BACKUP_BYTES) return json(context.request, { ok: false, error: 'Backup exceeds the size limit.' }, 413);

  const text = await context.request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    return json(context.request, { ok: false, error: 'Backup exceeds the size limit.' }, 413);
  }

  let payload;
  try { payload = JSON.parse(text); }
  catch { return json(context.request, { ok: false, error: 'Backup payload must be valid JSON.' }, 400); }

  const validationError = validatePayload(payload);
  if (validationError) return json(context.request, { ok: false, error: validationError }, 400);

  const current = await storage.get(LATEST_KEY);
  let currentText = null;
  let currentPayload = null;
  let currentRevision = null;
  if (current) {
    currentText = await current.text();
    currentPayload = parseStoredBackup(currentText, current);
    currentRevision = String(currentPayload?.revision || current.customMetadata?.revision || current.httpEtag || '');
    const expectedRevision = String(context.request.headers.get('if-match') || '').trim();
    if (!expectedRevision || expectedRevision !== currentRevision) {
      return json(context.request, {
        ...(currentPayload || {}),
        ok: false,
        exists: true,
        conflict: true,
        error: 'Backup changed in another installation.',
        revision: currentRevision || currentPayload?.revision || null,
      }, 409, objectHeaders(current));
    }
  }

  const data = normalizeData(payload.data);
  const revision = crypto.randomUUID();
  const updatedAt = new Date().toISOString();
  const canonical = {
    ok: true,
    exists: true,
    schemaVersion: 1,
    revision,
    updatedAt,
    appVersion: String(payload.appVersion || ''),
    apkVersion: String(payload.apkVersion || ''),
    source: payload.source && typeof payload.source === 'object' ? payload.source : {},
    counts: counts(data),
    data,
  };
  const body = JSON.stringify(canonical);

  if (current && currentText !== null) {
    await storage.put(PREVIOUS_KEY, currentText, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: {
        revision: currentRevision || '',
        updatedAt: current.customMetadata?.updatedAt || currentPayload?.updatedAt || '',
        replacedAt: updatedAt,
      },
    });
  }

  const object = await storage.put(LATEST_KEY, body, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: {
      revision,
      updatedAt,
      schemaVersion: '1',
      points: String(canonical.counts.points),
      routes: String(canonical.counts.routes),
      logEntries: String(canonical.counts.logEntries),
      plans: String(canonical.counts.plans),
    },
  });

  return json(context.request, canonical, 200, objectHeaders(object));
}
