import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from '../functions/api/persistence.js';

const SPREADSHEET_ID = '11hQDPp2nKDyaI8SHvRwPujIgGSN15Mt1_AlbQ6WxRCU';
const FOLDER_ID = '1LlNCtOA5vLlxyP-ltiL8GRwerTtNES1W';
const SCRIPT_URL = 'https://script.google.com/macros/s/TEST_WANDER_DEPLOYMENT/exec';

const statusResponse = await onRequestGet({ env: { WANDER_DISABLE_SCRIPT_DISCOVERY: '1' } });
assert.equal(statusResponse.status, 200);
const status = await statusResponse.json();
assert.equal(status.ok, true);
assert.equal(status.provider, 'google-apps-script');
assert.equal(status.spreadsheetId, SPREADSHEET_ID);
assert.equal(status.tracksFolderId, FOLDER_ID);
assert.equal(status.appsScriptConfigured, false);
assert.equal(status.authConfigured, false);
assert.ok(status.tables.includes('Waypoints'));
assert.ok(status.tables.includes('HUD'));

const wrongTargetResponse = await onRequestPost({
  env: { WANDER_DISABLE_SCRIPT_DISCOVERY: '1' },
  request: new Request('https://wander.test/api/persistence', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'upsert', spreadsheetId: 'wrong', table: 'Waypoints', rows: [] }),
  }),
});
assert.equal(wrongTargetResponse.status, 400);
const wrongTarget = await wrongTargetResponse.json();
assert.equal(wrongTarget.ok, false);
assert.equal(wrongTarget.retryable, false);

const missingScriptResponse = await onRequestPost({
  env: { WANDER_DISABLE_SCRIPT_DISCOVERY: '1' },
  request: new Request('https://wander.test/api/persistence', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'upsert',
      spreadsheetId: SPREADSHEET_ID,
      folderId: FOLDER_ID,
      table: 'Waypoints',
      rows: [{ id: 'test-waypoint', name: 'Test' }],
    }),
  }),
});
assert.equal(missingScriptResponse.status, 503);
const missingScript = await missingScriptResponse.json();
assert.equal(missingScript.ok, false);
assert.equal(missingScript.error, 'apps_script_not_configured');
assert.equal(missingScript.retryable, true);

const originalFetch = globalThis.fetch;
let forwarded = null;
globalThis.fetch = async (url, options = {}) => {
  if (String(url) === SCRIPT_URL) {
    forwarded = JSON.parse(String(options.body || '{}'));
    return new Response(JSON.stringify({ ok: true, action: 'upsert', table: 'Waypoints', updated: 0, appended: 1 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return originalFetch(url, options);
};
try {
  const proxyResponse = await onRequestPost({
    env: { WANDER_APPS_SCRIPT_URL: SCRIPT_URL, WANDER_DISABLE_SCRIPT_DISCOVERY: '1' },
    request: new Request('https://wander.test/api/persistence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'upsert',
        spreadsheetId: SPREADSHEET_ID,
        folderId: FOLDER_ID,
        table: 'Waypoints',
        rows: [{ id: 'test-waypoint', name: 'Test' }],
      }),
    }),
  });
  assert.equal(proxyResponse.status, 200);
  const proxy = await proxyResponse.json();
  assert.equal(proxy.ok, true);
  assert.equal(proxy.appended, 1);
  assert.equal(forwarded.spreadsheetId, SPREADSHEET_ID);
  assert.equal(forwarded.folderId, FOLDER_ID);
  assert.equal(forwarded.table, 'Waypoints');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('PASS Apps Script persistence proxy locks targets, queues before deployment and forwards writes after setup');
