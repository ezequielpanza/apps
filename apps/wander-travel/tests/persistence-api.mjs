import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from '../functions/api/persistence.js';

const SPREADSHEET_ID = '11hQDPp2nKDyaI8SHvRwPujIgGSN15Mt1_AlbQ6WxRCU';
const FOLDER_ID = '1LlNCtOA5vLlxyP-ltiL8GRwerTtNES1W';

const statusResponse = await onRequestGet({ env: {} });
assert.equal(statusResponse.status, 200);
const status = await statusResponse.json();
assert.equal(status.ok, true);
assert.equal(status.spreadsheetId, SPREADSHEET_ID);
assert.equal(status.tracksFolderId, FOLDER_ID);
assert.equal(status.authConfigured, false);
assert.ok(status.tables.includes('Waypoints'));
assert.ok(status.tables.includes('HUD'));

const wrongTargetResponse = await onRequestPost({
  env: {},
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

const missingAuthResponse = await onRequestPost({
  env: {},
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
assert.equal(missingAuthResponse.status, 503);
const missingAuth = await missingAuthResponse.json();
assert.equal(missingAuth.ok, false);
assert.equal(missingAuth.error, 'google_auth_not_configured');
assert.equal(missingAuth.retryable, true);

console.log('PASS Google persistence API locks targets and queues safely when credentials are not configured');
