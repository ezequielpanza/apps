import assert from 'node:assert/strict';
import {
  onRequestGet,
  onRequestPut,
} from '../functions/api/cloud-backup.js';

class MemoryKV {
  constructor() { this.values = new Map(); }
  async get(key, options = {}) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return options.type === 'json' ? JSON.parse(value) : value;
  }
  async put(key, value) { this.values.set(key, String(value)); }
}

const DEVICE_KEY = 'a'.repeat(64);
const endpoint = 'https://wander.test/api/cloud-backup';
const store = new MemoryKV();

function context(request) {
  return { request, env: { WANDER_BACKUPS: store } };
}

function request(method, body = null, key = DEVICE_KEY) {
  return new Request(endpoint, {
    method,
    headers: {
      'x-wander-device-key': key,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : null,
  });
}

{
  const response = await onRequestGet(context(request('GET', null, 'bad')));
  assert.equal(response.status, 400);
}

{
  const response = await onRequestGet(context(request('GET')));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true, exists: false, backup: null });
}

const backup = {
  schemaVersion: 1,
  clientUpdatedAt: '2026-07-27T12:00:00.000Z',
  webVersion: 'v0.109.0',
  apkVersion: '0.11.0',
  contentHash: 'hash-1',
  data: {
    'wander.personalPOIs.v1': JSON.stringify([{ id: 'poi-1', name: 'Casa', lat: 1, lng: 2 }]),
    'wander.sessions.v1': JSON.stringify([{ id: 'session-1', segments: [] }]),
    'wander.session.active.v1': null,
    'wander.sessions.settings.v1': JSON.stringify({ autoEnabled: true }),
    'wander.recording.profile.v1': JSON.stringify({ profileId: 'balanced' }),
    'wander.travelLog.entries.v1': JSON.stringify([{ id: 'entry-1', title: 'Llegada' }]),
    'wander.travelLog.plans.v1': JSON.stringify([]),
    'ignored.secret': JSON.stringify({ shouldNotPersist: true }),
  },
};

{
  const response = await onRequestPut(context(request('PUT', backup)));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.clientUpdatedAt, backup.clientUpdatedAt);
}

{
  const response = await onRequestGet(context(request('GET')));
  const payload = await response.json();
  assert.equal(payload.exists, true);
  assert.equal(payload.backup.webVersion, 'v0.109.0');
  assert.equal(payload.backup.apkVersion, '0.11.0');
  assert.equal(payload.backup.data['ignored.secret'], undefined);
  assert.equal(JSON.parse(payload.backup.data['wander.personalPOIs.v1'])[0].name, 'Casa');
}

{
  const invalid = structuredClone(backup);
  invalid.data['wander.sessions.v1'] = '{invalid';
  const response = await onRequestPut(context(request('PUT', invalid)));
  assert.equal(response.status, 400);
}

{
  const response = await onRequestGet({ request: request('GET'), env: {} });
  assert.equal(response.status, 503);
}

console.log('PASS Cloudflare backup API validates, stores and restores per-device snapshots');
