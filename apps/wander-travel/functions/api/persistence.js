const SPREADSHEET_ID = '11hQDPp2nKDyaI8SHvRwPujIgGSN15Mt1_AlbQ6WxRCU';
const TRACKS_FOLDER_ID = '1LlNCtOA5vLlxyP-ltiL8GRwerTtNES1W';
const META_SHEET = '_Meta';
const APPS_SCRIPT_URL_KEY = 'appsScriptUrl';
const APPS_SCRIPT_URL_FALLBACK = '';
const MAX_ROWS = 500;
const DISCOVERY_TTL_MS = 5 * 60 * 1000;
const FAILURE_TTL_MS = 15 * 1000;
const TABLES = Object.freeze(['Waypoints', 'Bitacora', 'Sesiones', 'TrackPoints', 'Ajustes', 'HUD']);

let cachedScriptUrl = '';
let cachedUntil = 0;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function validateTargets(body) {
  if (String(body?.spreadsheetId || '') !== SPREADSHEET_ID) return 'Unexpected spreadsheetId.';
  if (body?.folderId != null && String(body.folderId) !== TRACKS_FOLDER_ID) return 'Unexpected folderId.';
  if (body?.action === 'upsert' && !TABLES.includes(String(body?.table || ''))) return 'Unsupported persistence table.';
  if (body?.action === 'upsert' && (!Array.isArray(body.rows) || body.rows.length > MAX_ROWS)) return `Maximum ${MAX_ROWS} rows per request.`;
  if (!['upsert', 'upload-gpx'].includes(String(body?.action || ''))) return 'Unsupported persistence action.';
  return null;
}

function looksLikeAppsScriptUrl(value) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:[?#].*)?$/.test(String(value || '').trim());
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

async function discoverScriptUrl(env = {}) {
  const envUrl = String(env.WANDER_APPS_SCRIPT_URL || '').trim();
  if (looksLikeAppsScriptUrl(envUrl)) return envUrl;
  if (looksLikeAppsScriptUrl(APPS_SCRIPT_URL_FALLBACK)) return APPS_SCRIPT_URL_FALLBACK;
  if (env.WANDER_DISABLE_SCRIPT_DISCOVERY === '1') return '';

  const now = Date.now();
  if (cachedUntil > now) return cachedScriptUrl;

  try {
    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(SPREADSHEET_ID)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(META_SHEET)}&cacheBust=${now}`;
    const response = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
    if (!response.ok) throw new Error(`Meta sheet HTTP ${response.status}`);
    const rows = parseCsv(await response.text());
    const match = rows.find((cells) => String(cells?.[0] || '').trim() === APPS_SCRIPT_URL_KEY);
    const value = String(match?.[1] || '').trim();
    cachedScriptUrl = looksLikeAppsScriptUrl(value) ? value : '';
    cachedUntil = now + (cachedScriptUrl ? DISCOVERY_TTL_MS : FAILURE_TTL_MS);
    return cachedScriptUrl;
  } catch {
    cachedScriptUrl = '';
    cachedUntil = now + FAILURE_TTL_MS;
    return '';
  }
}

async function callAppsScript(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : {}; }
  catch { payload = null; }

  if (!response.ok || !payload || typeof payload !== 'object') {
    return {
      ok: false,
      error: 'apps_script_invalid_response',
      message: `Apps Script returned HTTP ${response.status}.`,
      retryable: true,
      status: response.status || 502,
    };
  }
  if (payload.ok !== true) {
    return {
      ...payload,
      ok: false,
      error: payload.error || 'apps_script_failed',
      retryable: payload.retryable !== false,
      status: payload.retryable === false ? 400 : 502,
    };
  }
  return { ...payload, status: 200 };
}

export async function onRequestGet(context) {
  const scriptUrl = await discoverScriptUrl(context.env || {});
  return json({
    ok: true,
    provider: 'google-apps-script',
    spreadsheetId: SPREADSHEET_ID,
    tracksFolderId: TRACKS_FOLDER_ID,
    appsScriptConfigured: Boolean(scriptUrl),
    authConfigured: Boolean(scriptUrl),
    configurationSource: context.env?.WANDER_APPS_SCRIPT_URL ? 'environment' : scriptUrl ? 'sheet-meta' : 'pending-deployment',
    tables: TABLES,
  });
}

export async function onRequestPost(context) {
  let body = null;
  try { body = await context.request.json(); }
  catch { return json({ ok: false, error: 'Request body must be JSON.', retryable: false }, 400); }

  const targetError = validateTargets(body);
  if (targetError) return json({ ok: false, error: targetError, retryable: false }, 400);

  const scriptUrl = await discoverScriptUrl(context.env || {});
  if (!scriptUrl) {
    return json({
      ok: false,
      error: 'apps_script_not_configured',
      message: 'Deploy the Wander Apps Script web app once; it will register its URL in the _Meta sheet automatically.',
      retryable: true,
    }, 503);
  }

  try {
    const result = await callAppsScript(scriptUrl, body);
    const { status = 200, ...payload } = result;
    return json(payload, status);
  } catch (error) {
    return json({
      ok: false,
      error: 'apps_script_unreachable',
      message: error?.message || 'Apps Script persistence is unreachable.',
      retryable: true,
    }, 502);
  }
}
