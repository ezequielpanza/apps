const SPREADSHEET_ID = '11hQDPp2nKDyaI8SHvRwPujIgGSN15Mt1_AlbQ6WxRCU';
const TRACKS_FOLDER_ID = '1LlNCtOA5vLlxyP-ltiL8GRwerTtNES1W';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive';
const MAX_ROWS = 500;
const MAX_GPX_BYTES = 10 * 1024 * 1024;

const TABLES = Object.freeze({
  Waypoints: Object.freeze({
    columns: ['id', 'name', 'lat', 'lng', 'type', 'radiusM', 'notes', 'overnight', 'vehicle', 'vehicleState', 'createdAt', 'updatedAt', 'deletedAt', 'deviceId'],
    key: (row) => String(row?.id || ''),
  }),
  Bitacora: Object.freeze({
    columns: ['id', 'at', 'type', 'title', 'summary', 'sessionId', 'waypointId', 'lat', 'lng', 'source', 'confidence', 'rawRef', 'createdAt', 'updatedAt', 'deletedAt', 'deviceId'],
    key: (row) => String(row?.id || ''),
  }),
  Sesiones: Object.freeze({
    columns: ['id', 'name', 'status', 'startedAt', 'endedAt', 'distanceM', 'activity', 'method', 'pointCount', 'createdAt', 'updatedAt', 'deletedAt', 'deviceId', 'metadataJson'],
    key: (row) => String(row?.id || ''),
  }),
  TrackPoints: Object.freeze({
    columns: ['id', 'sessionId', 'segmentId', 'seq', 'at', 'lat', 'lng', 'accuracy', 'speedKmh', 'heading', 'altitude', 'source', 'raw', 'relevant', 'inconsistencyReason', 'updatedAt', 'deviceId'],
    key: (row) => String(row?.id || `${row?.sessionId || ''}:${row?.segmentId || ''}:${row?.seq ?? ''}`),
  }),
  Ajustes: Object.freeze({
    columns: ['key', 'valueJson', 'updatedAt', 'deviceId'],
    key: (row) => String(row?.key || ''),
  }),
  HUD: Object.freeze({
    columns: ['fieldId', 'enabled', 'orientation', 'x', 'y', 'width', 'height', 'order', 'configJson', 'updatedAt', 'deviceId'],
    key: (row) => `${row?.fieldId || ''}|${row?.orientation || ''}`,
  }),
});

let tokenCache = null;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function base64Url(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunk)));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function encodeJson(value) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemBytes(pem) {
  const normalized = String(pem || '').replaceAll('\\n', '\n').trim();
  const base64 = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!base64) throw new Error('Google service account private key is empty.');
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function serviceAccountToken(env) {
  const email = String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  const privateKey = String(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').trim();
  if (!email || !privateKey) {
    const error = new Error('Google persistence credentials are not configured.');
    error.code = 'google_auth_not_configured';
    error.status = 503;
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  if (tokenCache?.accessToken && Number(tokenCache.expiresAt || 0) > now + 90) return tokenCache.accessToken;

  const header = encodeJson({ alg: 'RS256', typ: 'JWT' });
  const claims = encodeJson({
    iss: email,
    scope: GOOGLE_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  });
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemBytes(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  ));
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const error = new Error(payload.error_description || payload.error || 'Google OAuth token request failed.');
    error.code = 'google_auth_failed';
    error.status = response.status || 502;
    throw error;
  }

  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: now + Math.max(120, Number(payload.expires_in) || 3600),
  };
  return tokenCache.accessToken;
}

async function googleFetch(env, url, options = {}) {
  const accessToken = await serviceAccountToken(env);
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : {}; }
  catch { payload = { raw: text }; }
  if (!response.ok) {
    const error = new Error(payload?.error?.message || payload?.error_description || `Google API HTTP ${response.status}`);
    error.code = 'google_api_failed';
    error.status = response.status;
    error.details = payload;
    throw error;
  }
  return payload;
}

function quoteSheet(name) {
  return `'${String(name).replaceAll("'", "''")}'`;
}

function columnLetter(index) {
  let value = Math.max(1, Number(index) || 1);
  let output = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function cellValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function rowValues(schema, row) {
  return schema.columns.map((column) => cellValue(row?.[column]));
}

async function upsertRows(env, table, rows) {
  const schema = TABLES[table];
  if (!schema) {
    const error = new Error(`Unsupported persistence table: ${table}`);
    error.status = 400;
    error.code = 'invalid_table';
    throw error;
  }

  const normalizedRows = (Array.isArray(rows) ? rows : []).slice(0, MAX_ROWS);
  if (!normalizedRows.length) return { table, updated: 0, appended: 0 };
  const invalid = normalizedRows.find((row) => !schema.key(row));
  if (invalid) {
    const error = new Error(`A ${table} row is missing its primary key.`);
    error.status = 400;
    error.code = 'missing_row_key';
    throw error;
  }

  const lastColumn = columnLetter(schema.columns.length);
  const sheetRange = `${quoteSheet(table)}!A1:${lastColumn}`;
  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}/values/${encodeURIComponent(sheetRange)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`;
  const existingPayload = await googleFetch(env, valuesUrl);
  const existing = Array.isArray(existingPayload.values) ? existingPayload.values : [];
  const header = existing[0] || [];
  const headerMatches = schema.columns.every((column, index) => String(header[index] || '') === column);
  if (!headerMatches) {
    const error = new Error(`Unexpected header schema in ${table}.`);
    error.status = 409;
    error.code = 'sheet_schema_mismatch';
    throw error;
  }

  const keyIndex = new Map();
  for (let index = 1; index < existing.length; index += 1) {
    const rowObject = Object.fromEntries(schema.columns.map((column, columnIndex) => [column, existing[index]?.[columnIndex] ?? '']));
    const key = schema.key(rowObject);
    if (key) keyIndex.set(key, index + 1);
  }

  const updates = [];
  const appends = [];
  normalizedRows.forEach((row) => {
    const key = schema.key(row);
    const rowNumber = keyIndex.get(key);
    if (rowNumber) {
      updates.push({
        range: `${quoteSheet(table)}!A${rowNumber}:${lastColumn}${rowNumber}`,
        majorDimension: 'ROWS',
        values: [rowValues(schema, row)],
      });
    } else {
      appends.push(rowValues(schema, row));
    }
  });

  if (updates.length) {
    await googleFetch(env, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}/values:batchUpdate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'RAW', data: updates }),
    });
  }

  if (appends.length) {
    const appendRange = `${quoteSheet(table)}!A:${lastColumn}`;
    await googleFetch(env, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}/values/${encodeURIComponent(appendRange)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ majorDimension: 'ROWS', values: appends }),
    });
  }

  return { table, updated: updates.length, appended: appends.length };
}

function driveEscape(value) {
  return String(value || '').replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

async function findSessionGpx(env, folderId, sessionId) {
  const q = `'${driveEscape(folderId)}' in parents and trashed = false and appProperties has { key='wanderSessionId' and value='${driveEscape(sessionId)}' }`;
  const params = new URLSearchParams({
    q,
    spaces: 'drive',
    pageSize: '10',
    fields: 'files(id,name,webViewLink,modifiedTime,appProperties)',
  });
  const payload = await googleFetch(env, `https://www.googleapis.com/drive/v3/files?${params}`);
  return Array.isArray(payload.files) ? payload.files[0] || null : null;
}

function multipartBody(metadata, content, boundary) {
  return [
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    '\r\n',
    `--${boundary}\r\n`,
    'Content-Type: application/gpx+xml; charset=UTF-8\r\n\r\n',
    content,
    '\r\n',
    `--${boundary}--`,
  ].join('');
}

async function uploadGpx(env, { folderId, sessionId, filename, content, deviceId }) {
  if (!sessionId || !filename || !content) {
    const error = new Error('sessionId, filename and content are required for GPX upload.');
    error.status = 400;
    error.code = 'invalid_gpx_payload';
    throw error;
  }
  const bytes = new TextEncoder().encode(String(content));
  if (bytes.byteLength > MAX_GPX_BYTES) {
    const error = new Error('GPX payload is larger than the current 10 MB limit.');
    error.status = 413;
    error.code = 'gpx_too_large';
    throw error;
  }

  const existing = await findSessionGpx(env, folderId, sessionId);
  const metadata = {
    name: String(filename).slice(0, 180),
    mimeType: 'application/gpx+xml',
    appProperties: {
      wanderSessionId: String(sessionId),
      wanderDeviceId: String(deviceId || '').slice(0, 120),
      source: 'Wander',
    },
  };
  if (!existing?.id) metadata.parents = [folderId];

  const boundary = `wander_${crypto.randomUUID().replaceAll('-', '')}`;
  const fields = encodeURIComponent('id,name,webViewLink,modifiedTime,appProperties');
  const url = existing?.id
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=multipart&fields=${fields}`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${fields}`;
  const file = await googleFetch(env, url, {
    method: existing?.id ? 'PATCH' : 'POST',
    headers: { 'content-type': `multipart/related; boundary=${boundary}` },
    body: multipartBody(metadata, String(content), boundary),
  });
  return { file, replaced: Boolean(existing?.id) };
}

function validateTargets(body) {
  if (String(body?.spreadsheetId || '') !== SPREADSHEET_ID) return 'Unexpected spreadsheetId.';
  if (body?.folderId != null && String(body.folderId) !== TRACKS_FOLDER_ID) return 'Unexpected folderId.';
  return null;
}

export async function onRequestGet(context) {
  return json({
    ok: true,
    provider: 'google-sheets-drive',
    spreadsheetId: SPREADSHEET_ID,
    tracksFolderId: TRACKS_FOLDER_ID,
    authConfigured: Boolean(context.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && context.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    tables: Object.keys(TABLES),
  });
}

export async function onRequestPost(context) {
  let body = null;
  try { body = await context.request.json(); }
  catch { return json({ ok: false, error: 'Request body must be JSON.', retryable: false }, 400); }

  const targetError = validateTargets(body);
  if (targetError) return json({ ok: false, error: targetError, retryable: false }, 400);

  try {
    if (body.action === 'upsert') {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (rows.length > MAX_ROWS) return json({ ok: false, error: `Maximum ${MAX_ROWS} rows per request.`, retryable: false }, 400);
      const result = await upsertRows(context.env, String(body.table || ''), rows);
      return json({ ok: true, action: 'upsert', ...result });
    }

    if (body.action === 'upload-gpx') {
      const result = await uploadGpx(context.env, {
        folderId: TRACKS_FOLDER_ID,
        sessionId: body.sessionId,
        filename: body.filename,
        content: body.content,
        deviceId: body.deviceId,
      });
      return json({ ok: true, action: 'upload-gpx', ...result });
    }

    return json({ ok: false, error: 'Unsupported persistence action.', retryable: false }, 400);
  } catch (error) {
    const status = Number(error?.status) || 502;
    return json({
      ok: false,
      error: error?.code || error?.message || 'persistence_failed',
      message: error?.message || 'Persistence request failed.',
      retryable: status >= 500 || status === 429,
      upstreamStatus: status,
      details: error?.details || null,
    }, status);
  }
}
