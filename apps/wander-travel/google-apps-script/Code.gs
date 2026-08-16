const WANDER_SPREADSHEET_ID = '11hQDPp2nKDyaI8SHvRwPujIgGSN15Mt1_AlbQ6WxRCU';
const WANDER_TRACKS_FOLDER_ID = '1LlNCtOA5vLlxyP-ltiL8GRwerTtNES1W';
const WANDER_MAX_ROWS = 500;
const WANDER_MAX_GPX_BYTES = 10 * 1024 * 1024;

const WANDER_TABLES = Object.freeze({
  Waypoints: Object.freeze({
    columns: ['id', 'name', 'lat', 'lng', 'type', 'radiusM', 'notes', 'overnight', 'vehicle', 'vehicleState', 'createdAt', 'updatedAt', 'deletedAt', 'deviceId'],
    key: row => String(row && row.id || ''),
  }),
  Bitacora: Object.freeze({
    columns: ['id', 'at', 'type', 'title', 'summary', 'sessionId', 'waypointId', 'lat', 'lng', 'source', 'confidence', 'rawRef', 'createdAt', 'updatedAt', 'deletedAt', 'deviceId'],
    key: row => String(row && row.id || ''),
  }),
  Sesiones: Object.freeze({
    columns: ['id', 'name', 'status', 'startedAt', 'endedAt', 'distanceM', 'activity', 'method', 'pointCount', 'createdAt', 'updatedAt', 'deletedAt', 'deviceId', 'metadataJson'],
    key: row => String(row && row.id || ''),
  }),
  TrackPoints: Object.freeze({
    columns: ['id', 'sessionId', 'segmentId', 'seq', 'at', 'lat', 'lng', 'accuracy', 'speedKmh', 'heading', 'altitude', 'source', 'raw', 'relevant', 'inconsistencyReason', 'updatedAt', 'deviceId'],
    key: row => String(row && (row.id || `${row.sessionId || ''}:${row.segmentId || ''}:${row.seq == null ? '' : row.seq}`) || ''),
  }),
  Ajustes: Object.freeze({
    columns: ['key', 'valueJson', 'updatedAt', 'deviceId'],
    key: row => String(row && row.key || ''),
  }),
  HUD: Object.freeze({
    columns: ['fieldId', 'enabled', 'orientation', 'x', 'y', 'width', 'height', 'order', 'configJson', 'updatedAt', 'deviceId'],
    key: row => `${row && row.fieldId || ''}|${row && row.orientation || ''}`,
  }),
});

function doGet() {
  try {
    recordDeployment_();
    return json_({
      ok: true,
      provider: 'google-apps-script',
      spreadsheetId: WANDER_SPREADSHEET_ID,
      tracksFolderId: WANDER_TRACKS_FOLDER_ID,
      deploymentUrl: ScriptApp.getService().getUrl() || '',
      tables: Object.keys(WANDER_TABLES),
    });
  } catch (error) {
    return jsonError_(error);
  }
}

function doPost(event) {
  try {
    recordDeployment_();
    const body = parseBody_(event);
    validateTargets_(body);
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      if (body.action === 'upsert') {
        const rows = Array.isArray(body.rows) ? body.rows : [];
        if (rows.length > WANDER_MAX_ROWS) throw wanderError_(`Maximum ${WANDER_MAX_ROWS} rows per request.`, 'too_many_rows');
        const result = upsertRows_(String(body.table || ''), rows);
        return json_({ ok: true, action: 'upsert', ...result });
      }
      if (body.action === 'upload-gpx') {
        const result = uploadGpx_({
          folderId: String(body.folderId || WANDER_TRACKS_FOLDER_ID),
          sessionId: String(body.sessionId || ''),
          filename: String(body.filename || ''),
          content: String(body.content || ''),
          deviceId: String(body.deviceId || ''),
        });
        return json_({ ok: true, action: 'upload-gpx', ...result });
      }
      throw wanderError_(`Unsupported persistence action: ${body.action || ''}`, 'invalid_action');
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return jsonError_(error);
  }
}

function parseBody_(event) {
  const raw = event && event.postData && event.postData.contents || '';
  if (!raw) throw wanderError_('Request body must be JSON.', 'invalid_json');
  try {
    return JSON.parse(raw);
  } catch (_) {
    throw wanderError_('Request body must be JSON.', 'invalid_json');
  }
}

function validateTargets_(body) {
  if (String(body && body.spreadsheetId || '') !== WANDER_SPREADSHEET_ID) {
    throw wanderError_('Unexpected spreadsheetId.', 'unexpected_spreadsheet');
  }
  if (body && body.folderId != null && String(body.folderId) !== WANDER_TRACKS_FOLDER_ID) {
    throw wanderError_('Unexpected folderId.', 'unexpected_folder');
  }
}

function upsertRows_(table, rows) {
  const schema = WANDER_TABLES[table];
  if (!schema) throw wanderError_(`Unsupported persistence table: ${table}`, 'invalid_table');
  if (!rows.length) return { table, updated: 0, appended: 0 };

  const invalid = rows.find(row => !schema.key(row));
  if (invalid) throw wanderError_(`A ${table} row is missing its primary key.`, 'missing_row_key');

  const sheet = SpreadsheetApp.openById(WANDER_SPREADSHEET_ID).getSheetByName(table);
  if (!sheet) throw wanderError_(`Missing sheet: ${table}`, 'missing_sheet');
  const width = schema.columns.length;
  const lastRow = Math.max(1, sheet.getLastRow());
  const values = sheet.getRange(1, 1, lastRow, width).getValues();
  const header = values[0] || [];
  const headerMatches = schema.columns.every((column, index) => String(header[index] || '') === column);
  if (!headerMatches) throw wanderError_(`Unexpected header schema in ${table}.`, 'sheet_schema_mismatch');

  const keyToRow = new Map();
  for (let index = 1; index < values.length; index += 1) {
    const object = {};
    schema.columns.forEach((column, columnIndex) => { object[column] = values[index][columnIndex]; });
    const key = schema.key(object);
    if (key) keyToRow.set(key, index + 1);
  }

  let updated = 0;
  const appendedValues = [];
  rows.forEach(row => {
    const key = schema.key(row);
    const rowNumber = keyToRow.get(key);
    const valuesForRow = schema.columns.map(column => cellValue_(row && row[column]));
    if (rowNumber) {
      sheet.getRange(rowNumber, 1, 1, width).setValues([valuesForRow]);
      updated += 1;
    } else {
      appendedValues.push(valuesForRow);
    }
  });

  if (appendedValues.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, appendedValues.length, width).setValues(appendedValues);
  }
  SpreadsheetApp.flush();
  return { table, updated, appended: appendedValues.length };
}

function uploadGpx_({ folderId, sessionId, filename, content, deviceId }) {
  if (!sessionId || !filename || !content) {
    throw wanderError_('sessionId, filename and content are required for GPX upload.', 'invalid_gpx_payload');
  }
  if (Utilities.newBlob(content).getBytes().length > WANDER_MAX_GPX_BYTES) {
    throw wanderError_('GPX payload is larger than the current 10 MB limit.', 'gpx_too_large');
  }

  const folder = DriveApp.getFolderById(folderId);
  const matches = folder.getFilesByName(filename);
  let file = matches.hasNext() ? matches.next() : null;
  const replaced = Boolean(file);
  if (file) {
    file.setContent(content);
  } else {
    file = folder.createFile(Utilities.newBlob(content, 'application/gpx+xml', filename));
  }
  file.setDescription(JSON.stringify({ source: 'Wander', sessionId, deviceId }));
  return {
    replaced,
    file: {
      id: file.getId(),
      name: file.getName(),
      webViewLink: file.getUrl(),
      modifiedTime: file.getLastUpdated().toISOString(),
    },
  };
}

function recordDeployment_() {
  const url = ScriptApp.getService().getUrl();
  if (!url) return;
  const sheet = SpreadsheetApp.openById(WANDER_SPREADSHEET_ID).getSheetByName('_Meta');
  if (!sheet) return;
  const lastRow = Math.max(1, sheet.getLastRow());
  const values = sheet.getRange(1, 1, lastRow, 2).getValues();
  const meta = new Map();
  for (let index = 1; index < values.length; index += 1) {
    const key = String(values[index][0] || '');
    if (key) meta.set(key, String(values[index][1] || ''));
  }

  if (meta.get('persistenceProvider') !== 'google-apps-script') upsertMeta_(sheet, 'persistenceProvider', 'google-apps-script');
  if (meta.get('tracksFolderId') !== WANDER_TRACKS_FOLDER_ID) upsertMeta_(sheet, 'tracksFolderId', WANDER_TRACKS_FOLDER_ID);
  if (meta.get('appsScriptUrl') !== url) {
    upsertMeta_(sheet, 'appsScriptUrl', url);
    upsertMeta_(sheet, 'appsScriptUpdatedAt', new Date().toISOString());
    upsertMeta_(sheet, 'appsScriptStatus', 'active');
  }
}

function upsertMeta_(sheet, key, value) {
  const lastRow = Math.max(1, sheet.getLastRow());
  const values = sheet.getRange(1, 1, lastRow, 2).getValues();
  for (let index = 1; index < values.length; index += 1) {
    if (String(values[index][0] || '') === key) {
      sheet.getRange(index + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function cellValue_(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function wanderError_(message, code) {
  const error = new Error(message);
  error.code = code || 'wander_error';
  return error;
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function jsonError_(error) {
  return json_({
    ok: false,
    error: error && error.code || 'apps_script_error',
    message: error && error.message || 'Apps Script persistence failed.',
    retryable: !['invalid_json', 'unexpected_spreadsheet', 'unexpected_folder', 'invalid_table', 'missing_row_key', 'sheet_schema_mismatch', 'invalid_gpx_payload', 'gpx_too_large', 'invalid_action'].includes(error && error.code),
  });
}
