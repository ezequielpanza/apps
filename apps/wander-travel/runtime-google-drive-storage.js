(() => {
  if (window.WanderGoogleDriveStorage) return;

  const STATE_KEY = 'wander.googleDrive.storage.v2';
  const ENDPOINT_PATH = '/__wander_google_drive_persistence__';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
  const SCHEMA_VERSION = 2;
  const APP_ROOT_NAME = 'Wander';
  const DATA_FOLDER_NAME = 'Data';
  const TRACKS_FOLDER_NAME = 'Tracks';
  const SPREADSHEET_NAME = 'Wander';
  const nativeFetch = window.fetch.bind(window);

  // One-time compatibility hint for the manually-created structure used before
  // the OAuth storage flow existed. These IDs are never used as the normal
  // storage configuration and are discarded once the installation is linked.
  const LEGACY_MIGRATION = Object.freeze({
    rootFolderId: '1L0cZoovdzh5__KV6Ql1If9sUZ-oKEJ3I',
    dataFolderId: '1qwnmYAuAnnCsj9kjCun_FteI2fmAzXhP',
    tracksFolderId: '1LlNCtOA5vLlxyP-ltiL8GRwerTtNES1W',
    spreadsheetId: '11hQDPp2nKDyaI8SHvRwPujIgGSN15Mt1_AlbQ6WxRCU',
  });

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

  let memoryToken = null;
  let memoryAccount = null;
  let state = readState();

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch { return value; }
  }

  function readState() {
    try {
      const value = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch { return null; }
  }

  function writeState(next) {
    state = next && typeof next === 'object' ? { ...next } : null;
    try {
      if (state) localStorage.setItem(STATE_KEY, JSON.stringify(state));
      else localStorage.removeItem(STATE_KEY);
    } catch {}
    publish();
    window.dispatchEvent(new CustomEvent('wander:google-drive-storage', { detail: getState() }));
    return getState();
  }

  function getState() {
    return state ? clone(state) : null;
  }

  function plugin() {
    return window.Capacitor?.Plugins?.WanderGoogleDrive || null;
  }

  function isNativeAvailable() {
    return window.Capacitor?.isNativePlatform?.() === true && Boolean(plugin());
  }

  function contextSet(key, value, extra = {}) {
    window.WanderContext?.set?.(key, value, {
      source: 'google-drive-oauth', kind: 'observed', confidence: 1, ttlMs: Infinity, ...extra,
    });
  }

  function publish(extra = {}) {
    contextSet('persistence.provider', 'google-drive-oauth');
    contextSet('persistence.google.scope', 'drive.file');
    contextSet('persistence.google.connected', Boolean(state?.spreadsheetId && state?.tracksFolderId));
    contextSet('persistence.remote.spreadsheetId', state?.spreadsheetId || null);
    contextSet('persistence.remote.tracksFolderId', state?.tracksFolderId || null);
    contextSet('persistence.google.rootFolderId', state?.rootFolderId || null);
    contextSet('persistence.google.dataFolderId', state?.dataFolderId || null);
    contextSet('persistence.google.parentFolderId', state?.parentFolderId || null);
    contextSet('persistence.google.account', state?.accountEmail || state?.accountName || null);
    if (extra.status) contextSet('persistence.remote.status', extra.status, { ttlMs: 10 * 60 * 1000 });
    if (extra.error !== undefined) contextSet('persistence.remote.lastError', extra.error || null, { ttlMs: 10 * 60 * 1000 });
  }

  function rememberAuthorization(result) {
    if (!result?.accessToken) return null;
    memoryToken = String(result.accessToken);
    memoryAccount = {
      accountId: result.accountId || memoryAccount?.accountId || state?.accountId || null,
      accountEmail: result.accountEmail || memoryAccount?.accountEmail || state?.accountEmail || null,
      accountName: result.accountName || memoryAccount?.accountName || state?.accountName || null,
    };
    return memoryToken;
  }

  async function getAccessToken({ interactive = false } = {}) {
    if (memoryToken) return memoryToken;
    const nativePlugin = plugin();
    if (!isNativeAvailable() || typeof nativePlugin?.getAccessToken !== 'function') {
      const error = new Error('Google Drive authorization is only available in the Android app.');
      error.code = 'NATIVE_GOOGLE_DRIVE_REQUIRED';
      throw error;
    }
    try {
      const result = await nativePlugin.getAccessToken();
      return rememberAuthorization(result);
    } catch (error) {
      if (!interactive) throw error;
      throw error;
    }
  }

  async function googleRequest(token, url, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('authorization', `Bearer ${token}`);
    if (options.json !== undefined) headers.set('content-type', 'application/json');
    const response = await nativeFetch(url, {
      ...options,
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : {}; } catch { body = text; }
    if (!response.ok) {
      const error = new Error(body?.error?.message || body?.message || `Google API HTTP ${response.status}`);
      error.status = response.status;
      error.details = body;
      if (response.status === 401) memoryToken = null;
      throw error;
    }
    return body || {};
  }

  function escapeQuery(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  async function driveGet(token, id) {
    if (!id) return null;
    const fields = 'id,name,mimeType,parents,webViewLink,createdTime,modifiedTime,appProperties';
    return googleRequest(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`);
  }

  async function tryDriveGet(token, id) {
    try { return await driveGet(token, id); }
    catch (error) {
      if ([403, 404].includes(Number(error?.status))) return null;
      throw error;
    }
  }

  async function driveList(token, query, pageSize = 100) {
    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name,mimeType,parents,webViewLink,createdTime,modifiedTime,appProperties)',
      pageSize: String(pageSize),
      spaces: 'drive',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    const result = await googleRequest(token, `https://www.googleapis.com/drive/v3/files?${params}`);
    return Array.isArray(result.files) ? result.files : [];
  }

  async function findChild(token, parentId, name, mimeType) {
    const query = [
      `'${escapeQuery(parentId)}' in parents`,
      `name = '${escapeQuery(name)}'`,
      `mimeType = '${escapeQuery(mimeType)}'`,
      'trashed = false',
    ].join(' and ');
    const files = await driveList(token, query, 20);
    return files[0] || null;
  }

  async function listChildrenByMime(token, parentId, mimeType) {
    const query = [
      `'${escapeQuery(parentId)}' in parents`,
      `mimeType = '${escapeQuery(mimeType)}'`,
      'trashed = false',
    ].join(' and ');
    return driveList(token, query, 100);
  }

  async function createDriveFile(token, metadata) {
    return googleRequest(token, 'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents,webViewLink,createdTime,modifiedTime,appProperties&supportsAllDrives=true', {
      method: 'POST',
      json: metadata,
    });
  }

  async function createFolder(token, parentId, name, role) {
    return createDriveFile(token, {
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
      appProperties: { wanderRole: role, wanderSchema: String(SCHEMA_VERSION) },
    });
  }

  async function createSpreadsheet(token, dataFolderId) {
    return createDriveFile(token, {
      name: SPREADSHEET_NAME,
      mimeType: SHEET_MIME,
      parents: [dataFolderId],
      appProperties: { wanderRole: 'database', wanderSchema: String(SCHEMA_VERSION) },
    });
  }

  async function sheetMetadata(token, spreadsheetId) {
    return googleRequest(token, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(sheetId,title,gridProperties))`);
  }

  async function getValues(token, spreadsheetId, range) {
    const result = await googleRequest(token, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`);
    return Array.isArray(result.values) ? result.values : [];
  }

  async function putValues(token, spreadsheetId, range, values) {
    return googleRequest(token, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: 'PUT',
      json: { range, majorDimension: 'ROWS', values },
    });
  }

  async function appendValues(token, spreadsheetId, range, values) {
    return googleRequest(token, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      json: { range, majorDimension: 'ROWS', values },
    });
  }

  async function batchValues(token, spreadsheetId, data) {
    if (!data.length) return {};
    return googleRequest(token, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
      method: 'POST',
      json: { valueInputOption: 'RAW', data },
    });
  }

  async function sheetsBatchUpdate(token, spreadsheetId, requests) {
    if (!requests.length) return {};
    return googleRequest(token, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      method: 'POST',
      json: { requests },
    });
  }

  function colName(number) {
    let n = Math.max(1, Number(number) || 1);
    let out = '';
    while (n > 0) {
      n -= 1;
      out = String.fromCharCode(65 + (n % 26)) + out;
      n = Math.floor(n / 26);
    }
    return out;
  }

  function quotedSheet(name) {
    return `'${String(name).replace(/'/g, "''")}'`;
  }

  function normalizeCell(value) {
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
  }

  async function readMeta(token, spreadsheetId) {
    try {
      const rows = await getValues(token, spreadsheetId, `${quotedSheet('_Meta')}!A:B`);
      const meta = {};
      rows.slice(1).forEach((row) => {
        const key = String(row?.[0] || '').trim();
        if (key) meta[key] = row?.[1] ?? '';
      });
      return meta;
    } catch (error) {
      if (Number(error?.status) === 400) return null;
      throw error;
    }
  }

  async function validWanderSpreadsheet(token, file) {
    if (!file?.id || file.mimeType !== SHEET_MIME) return false;
    try {
      const meta = await readMeta(token, file.id);
      return Boolean(meta && String(meta.database || '') === 'Wander' && Number(meta.schemaVersion || 0) >= 1);
    } catch (error) {
      if ([403, 404].includes(Number(error?.status))) return false;
      throw error;
    }
  }

  async function findWanderSpreadsheet(token, dataFolderId) {
    const candidates = await listChildrenByMime(token, dataFolderId, SHEET_MIME);
    const preferred = [...candidates].sort((a, b) => Number(b.name === SPREADSHEET_NAME) - Number(a.name === SPREADSHEET_NAME));
    for (const file of preferred) {
      if (await validWanderSpreadsheet(token, file)) return file;
    }
    return null;
  }

  async function ensureSheetTabs(token, spreadsheetId) {
    let metadata = await sheetMetadata(token, spreadsheetId);
    let sheets = Array.isArray(metadata.sheets) ? metadata.sheets : [];
    const titles = new Set(sheets.map((sheet) => String(sheet?.properties?.title || '')));
    const required = ['_Meta', ...Object.keys(TABLES)];
    const requests = [];

    if (!titles.has('_Meta') && sheets.length === 1) {
      const only = sheets[0]?.properties;
      if (only?.sheetId != null && /^Sheet\d*$|^Hoja\d*$/i.test(String(only.title || ''))) {
        requests.push({ updateSheetProperties: { properties: { sheetId: only.sheetId, title: '_Meta' }, fields: 'title' } });
        titles.delete(String(only.title || ''));
        titles.add('_Meta');
      }
    }
    required.forEach((title) => {
      if (!titles.has(title)) requests.push({ addSheet: { properties: { title } } });
    });
    if (requests.length) {
      await sheetsBatchUpdate(token, spreadsheetId, requests);
      metadata = await sheetMetadata(token, spreadsheetId);
      sheets = Array.isArray(metadata.sheets) ? metadata.sheets : [];
    }

    await ensureHeaders(token, spreadsheetId, '_Meta', ['key', 'value']);
    for (const [name, schema] of Object.entries(TABLES)) {
      await ensureHeaders(token, spreadsheetId, name, schema.columns);
    }
    return sheets;
  }

  async function ensureHeaders(token, spreadsheetId, sheetName, expected) {
    const range = `${quotedSheet(sheetName)}!1:1`;
    const rows = await getValues(token, spreadsheetId, range).catch(() => []);
    const current = Array.isArray(rows[0]) ? rows[0].map((value) => String(value || '')) : [];
    if (!current.some(Boolean)) {
      await putValues(token, spreadsheetId, `${quotedSheet(sheetName)}!A1:${colName(expected.length)}1`, [expected]);
      return expected.slice();
    }
    const missing = expected.filter((column) => !current.includes(column));
    if (missing.length) {
      const next = [...current, ...missing];
      await putValues(token, spreadsheetId, `${quotedSheet(sheetName)}!A1:${colName(next.length)}1`, [next]);
      return next;
    }
    return current;
  }

  async function updateMeta(token, storage) {
    const spreadsheetId = storage.spreadsheetId;
    const rows = await getValues(token, spreadsheetId, `${quotedSheet('_Meta')}!A:B`).catch(() => []);
    const keyRows = new Map();
    rows.slice(1).forEach((row, index) => {
      const key = String(row?.[0] || '').trim();
      if (key) keyRows.set(key, index + 2);
    });
    const now = new Date().toISOString();
    const values = {
      schemaVersion: String(SCHEMA_VERSION),
      database: 'Wander',
      storageModel: 'offline-first + Google Drive OAuth',
      persistenceProvider: 'google-drive-oauth',
      rootFolderId: storage.rootFolderId,
      dataFolderId: storage.dataFolderId,
      tracksFolderId: storage.tracksFolderId,
      spreadsheetId: storage.spreadsheetId,
      updatedAt: now,
      appsScriptStatus: 'retired',
    };
    if (!keyRows.has('createdByAppVersion')) values.createdByAppVersion = window.WanderVersion || 'unknown';
    if (!keyRows.has('createdAt')) values.createdAt = now;

    const updates = [];
    const appends = [];
    Object.entries(values).forEach(([key, value]) => {
      const rowNumber = keyRows.get(key);
      if (rowNumber) updates.push({ range: `${quotedSheet('_Meta')}!A${rowNumber}:B${rowNumber}`, majorDimension: 'ROWS', values: [[key, value]] });
      else appends.push([key, value]);
    });
    await batchValues(token, spreadsheetId, updates);
    if (appends.length) await appendValues(token, spreadsheetId, `${quotedSheet('_Meta')}!A:B`, appends);
  }

  async function inspect(parentId, token = memoryToken) {
    if (!token) token = await getAccessToken();
    const parent = await driveGet(token, parentId);
    if (parent.mimeType !== FOLDER_MIME) throw new Error('La ubicación elegida no es una carpeta de Google Drive.');

    let root = parent.name === APP_ROOT_NAME ? parent : await findChild(token, parent.id, APP_ROOT_NAME, FOLDER_MIME);
    let data = root ? await findChild(token, root.id, DATA_FOLDER_NAME, FOLDER_MIME) : null;
    let tracks = root ? await findChild(token, root.id, TRACKS_FOLDER_NAME, FOLDER_MIME) : null;
    let spreadsheet = data ? await findWanderSpreadsheet(token, data.id) : null;
    let legacyNeedsAuthorization = false;

    if (root?.id === LEGACY_MIGRATION.rootFolderId) {
      if (!data) data = await tryDriveGet(token, LEGACY_MIGRATION.dataFolderId);
      if (!tracks) tracks = await tryDriveGet(token, LEGACY_MIGRATION.tracksFolderId);
      if (!spreadsheet) {
        const legacySheet = await tryDriveGet(token, LEGACY_MIGRATION.spreadsheetId);
        if (legacySheet && await validWanderSpreadsheet(token, legacySheet)) spreadsheet = legacySheet;
      }
      legacyNeedsAuthorization = !data || !tracks || !spreadsheet;
    }

    return {
      parent,
      root,
      data,
      tracks,
      spreadsheet,
      legacyNeedsAuthorization,
      found: {
        root: Boolean(root),
        data: Boolean(data),
        tracks: Boolean(tracks),
        spreadsheet: Boolean(spreadsheet),
      },
    };
  }

  async function authorizeLegacyStructure() {
    const nativePlugin = plugin();
    if (typeof nativePlugin?.pickExistingStorageItems !== 'function') return null;
    const result = await nativePlugin.pickExistingStorageItems({
      fileIds: [LEGACY_MIGRATION.dataFolderId, LEGACY_MIGRATION.tracksFolderId, LEGACY_MIGRATION.spreadsheetId].join(','),
    });
    if (result?.cancelled) return null;
    rememberAuthorization(result);
    return result;
  }

  async function provision(parentId, token = memoryToken, inspection = null) {
    if (!token) token = await getAccessToken();
    let current = inspection || await inspect(parentId, token);

    if (current.legacyNeedsAuthorization) {
      const authorized = await authorizeLegacyStructure();
      if (authorized?.accessToken) {
        token = String(authorized.accessToken);
        current = await inspect(parentId, token);
      }
    }

    let root = current.root;
    const created = { root: false, data: false, tracks: false, spreadsheet: false };
    if (!root) {
      root = await createFolder(token, current.parent.id, APP_ROOT_NAME, 'root');
      created.root = true;
    }

    let data = current.data;
    if (!data || !Array.isArray(data.parents) || !data.parents.includes(root.id)) {
      data = await findChild(token, root.id, DATA_FOLDER_NAME, FOLDER_MIME);
    }
    if (!data) {
      data = await createFolder(token, root.id, DATA_FOLDER_NAME, 'data');
      created.data = true;
    }

    let tracks = current.tracks;
    if (!tracks || !Array.isArray(tracks.parents) || !tracks.parents.includes(root.id)) {
      tracks = await findChild(token, root.id, TRACKS_FOLDER_NAME, FOLDER_MIME);
    }
    if (!tracks) {
      tracks = await createFolder(token, root.id, TRACKS_FOLDER_NAME, 'tracks');
      created.tracks = true;
    }

    let spreadsheet = current.spreadsheet;
    if (!spreadsheet || !Array.isArray(spreadsheet.parents) || !spreadsheet.parents.includes(data.id)) {
      spreadsheet = await findWanderSpreadsheet(token, data.id);
    }
    if (!spreadsheet) {
      spreadsheet = await createSpreadsheet(token, data.id);
      created.spreadsheet = true;
    }

    await ensureSheetTabs(token, spreadsheet.id);
    const next = {
      schemaVersion: SCHEMA_VERSION,
      provider: 'google-drive-oauth',
      parentFolderId: current.parent.id,
      parentFolderName: current.parent.name || '',
      rootFolderId: root.id,
      dataFolderId: data.id,
      tracksFolderId: tracks.id,
      spreadsheetId: spreadsheet.id,
      accountId: memoryAccount?.accountId || state?.accountId || null,
      accountEmail: memoryAccount?.accountEmail || state?.accountEmail || null,
      accountName: memoryAccount?.accountName || state?.accountName || null,
      linkedAt: state?.linkedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await updateMeta(token, next);
    writeState(next);
    publish({ status: 'synced', error: null });
    setTimeout(() => window.WanderPersistence?.flush?.(), 100);
    return { state: getState(), created, reused: Object.fromEntries(Object.entries(created).map(([key, value]) => [key, !value])) };
  }

  async function connect() {
    const nativePlugin = plugin();
    if (!isNativeAvailable() || typeof nativePlugin?.pickStorageFolder !== 'function') {
      const error = new Error('La conexión con Google Drive está disponible desde la APK de Wander.');
      error.code = 'NATIVE_GOOGLE_DRIVE_REQUIRED';
      throw error;
    }
    const selected = await nativePlugin.pickStorageFolder();
    if (selected?.cancelled) return { cancelled: true };
    const token = rememberAuthorization(selected);
    const parentId = String(selected?.folderId || '').trim();
    if (!token || !parentId) throw new Error('Google Drive no devolvió una carpeta válida.');
    const inspection = await inspect(parentId, token);
    const result = await provision(parentId, token, inspection);
    return { ...result, inspection };
  }

  async function reconfigure() {
    if (!state?.parentFolderId) return connect();
    const token = await getAccessToken();
    return provision(state.parentFolderId, token);
  }

  async function disconnect() {
    try { await plugin()?.disconnect?.(); } catch {}
    memoryToken = null;
    memoryAccount = null;
    const previous = getState();
    writeState(null);
    publish({ status: 'local-only', error: null });
    return { disconnected: true, previous };
  }

  async function upsertRows(token, payload) {
    const storage = state;
    if (!storage?.spreadsheetId) throw storageError('google_drive_not_configured', 503);
    const table = String(payload?.table || '');
    const schema = TABLES[table];
    if (!schema) throw storageError('invalid_table', 400);
    const incoming = Array.isArray(payload?.rows) ? payload.rows.filter(Boolean) : [];
    if (!incoming.length) return { ok: true, action: 'upsert', table, updated: 0, appended: 0 };

    const headerRows = await getValues(token, storage.spreadsheetId, `${quotedSheet(table)}!1:1`);
    const headers = Array.isArray(headerRows[0]) ? headerRows[0].map((value) => String(value || '')) : [];
    const completeHeaders = await ensureHeaders(token, storage.spreadsheetId, table, schema.columns);
    const activeHeaders = completeHeaders.length ? completeHeaders : headers;
    const width = activeHeaders.length;
    const existingRows = await getValues(token, storage.spreadsheetId, `${quotedSheet(table)}!A1:${colName(width)}`);
    const keyRows = new Map();
    existingRows.slice(1).forEach((values, index) => {
      const row = {};
      activeHeaders.forEach((column, columnIndex) => { row[column] = values?.[columnIndex] ?? ''; });
      const key = schema.key(row);
      if (key) keyRows.set(key, index + 2);
    });

    const updates = [];
    const appends = [];
    incoming.forEach((row) => {
      const key = schema.key(row);
      if (!key) return;
      const values = activeHeaders.map((column) => normalizeCell(row?.[column]));
      const rowNumber = keyRows.get(key);
      if (rowNumber) {
        updates.push({ range: `${quotedSheet(table)}!A${rowNumber}:${colName(width)}${rowNumber}`, majorDimension: 'ROWS', values: [values] });
      } else {
        appends.push(values);
      }
    });
    await batchValues(token, storage.spreadsheetId, updates);
    if (appends.length) await appendValues(token, storage.spreadsheetId, `${quotedSheet(table)}!A:${colName(width)}`, appends);
    return { ok: true, action: 'upsert', table, updated: updates.length, appended: appends.length };
  }

  async function uploadGpx(token, payload) {
    const storage = state;
    if (!storage?.tracksFolderId) throw storageError('google_drive_not_configured', 503);
    const filename = String(payload?.filename || '').trim();
    const content = String(payload?.content || '');
    if (!filename || !content) throw storageError('invalid_gpx_payload', 400);

    const query = [
      `'${escapeQuery(storage.tracksFolderId)}' in parents`,
      `name = '${escapeQuery(filename)}'`,
      'trashed = false',
    ].join(' and ');
    const matches = await driveList(token, query, 10);
    let file = matches[0] || null;
    const replaced = Boolean(file);
    if (!file) {
      file = await createDriveFile(token, {
        name: filename,
        mimeType: 'application/gpx+xml',
        parents: [storage.tracksFolderId],
        appProperties: {
          wanderRole: 'track',
          wanderSessionId: String(payload?.sessionId || ''),
          wanderDeviceId: String(payload?.deviceId || ''),
        },
      });
    }
    const headers = new Headers({
      authorization: `Bearer ${token}`,
      'content-type': 'application/gpx+xml; charset=utf-8',
    });
    const response = await nativeFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file.id)}?uploadType=media&fields=id,name,webViewLink,modifiedTime`, {
      method: 'PATCH', headers, body: content,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw storageError(result?.error?.message || `GPX upload HTTP ${response.status}`, response.status);
    return {
      ok: true,
      action: 'upload-gpx',
      replaced,
      file: {
        id: result.id || file.id,
        name: result.name || filename,
        webViewLink: result.webViewLink || file.webViewLink || null,
        modifiedTime: result.modifiedTime || new Date().toISOString(),
      },
    };
  }

  function storageError(message, status = 500) {
    const error = new Error(message);
    error.status = status;
    return error;
  }

  function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  async function handlePersistenceRequest(input, init = {}) {
    if (!isNativeAvailable()) return jsonResponse({ ok: false, error: 'native_google_drive_required', retryable: false }, 503);
    if (!state?.spreadsheetId || !state?.tracksFolderId) return jsonResponse({ ok: false, error: 'google_drive_not_configured', retryable: false }, 503);
    let payload = {};
    try {
      const raw = init?.body == null ? '{}' : String(init.body);
      payload = JSON.parse(raw);
    } catch {
      return jsonResponse({ ok: false, error: 'invalid_json', retryable: false }, 400);
    }
    try {
      const token = await getAccessToken();
      if (payload.action === 'upsert') return jsonResponse(await upsertRows(token, payload));
      if (payload.action === 'upload-gpx') return jsonResponse(await uploadGpx(token, payload));
      return jsonResponse({ ok: false, error: 'invalid_action', retryable: false }, 400);
    } catch (error) {
      const status = Number(error?.status) || (String(error?.code || '').includes('AUTH') ? 401 : 500);
      publish({ status: status === 401 ? 'authorization-required' : 'waiting', error: error?.message || 'sync_failed' });
      return jsonResponse({
        ok: false,
        error: status === 401 ? 'google_authorization_required' : (error?.message || 'google_drive_sync_failed'),
        retryable: ![400, 401, 403].includes(status),
      }, status);
    }
  }

  window.fetch = function wanderPersistenceFetch(input, init) {
    try {
      const rawUrl = typeof input === 'string' ? input : input?.url;
      const url = new URL(rawUrl, window.location.href);
      if (url.pathname === ENDPOINT_PATH) return handlePersistenceRequest(input, init || {});
    } catch {}
    return nativeFetch(input, init);
  };

  window.WanderGoogleDriveStorage = Object.freeze({
    stateKey: STATE_KEY,
    endpointPath: ENDPOINT_PATH,
    scope: 'https://www.googleapis.com/auth/drive.file',
    schemaVersion: SCHEMA_VERSION,
    tables: TABLES,
    migration: LEGACY_MIGRATION,
    isAvailable: isNativeAvailable,
    getState,
    inspect,
    provision,
    connect,
    reconfigure,
    disconnect,
    getAccessToken,
    flush: () => window.WanderPersistence?.flush?.(),
  });

  publish({ status: state ? 'idle' : 'local-only' });
})();
