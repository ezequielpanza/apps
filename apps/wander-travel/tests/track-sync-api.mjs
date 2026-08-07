import assert from 'node:assert/strict';
import {
  onRequestGet,
  onRequestPost,
  onRequestPut,
} from '../functions/api/track-sync.js';

class MemoryKV {
  constructor() {
    this.values = new Map();
    this.metadata = new Map();
  }
  async get(key, options = {}) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return options.type === 'json' ? JSON.parse(value) : value;
  }
  async put(key, value, options = {}) {
    this.values.set(key, String(value));
    this.metadata.set(key, options.metadata || null);
  }
  async list(options = {}) {
    const keys = [...this.values.keys()]
      .filter((key) => !options.prefix || key.startsWith(options.prefix))
      .sort()
      .map((name) => ({ name, metadata: this.metadata.get(name) || null }));
    return { keys, list_complete: true, cursor: '' };
  }
}

const DEVICE_KEY = 'c'.repeat(64);
const endpoint = 'https://wander.test/api/track-sync';
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
  const payload = await (await onRequestGet(context(request('GET')))).json();
  assert.equal(payload.ok, true);
  assert.equal(payload.count, 0);
}

const startedAt = Date.parse('2026-08-07T12:31:00.000Z');
const track = {
  schemaVersion: 1,
  id: 'movement-20260807-083100',
  name: '2026-08-07 · 08:31',
  day: '2026-08-07',
  sessionId: 'session-1',
  startedAt,
  endedAt: startedAt + 600000,
  durationMs: 600000,
  distanceM: 1220,
  activity: 'driving',
  relevance: 'valid',
  status: 'closed',
  updatedAt: startedAt + 600000,
  points: [
    { lat: 18.03, lng: -71.10, at: startedAt },
    { lat: 18.04, lng: -71.09, at: startedAt + 600000 },
  ],
};

{
  const response = await onRequestPut(context(request('PUT', { schemaVersion: 1, tracks: [track] })));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.accepted, 1);
  assert.equal(payload.skipped, 0);
}

{
  const payload = await (await onRequestGet(context(request('GET')))).json();
  assert.equal(payload.count, 1);
  assert.equal(payload.tracks[0].id, track.id);
  assert.equal(payload.tracks[0].name, '2026-08-07 · 08:31');
  assert.equal(payload.tracks[0].pointCount, 2);
}

{
  const response = await onRequestPost(context(request('POST', { schemaVersion: 1, ids: [track.id] })));
  const payload = await response.json();
  assert.equal(payload.tracks.length, 1);
  assert.equal(payload.tracks[0].points.length, 2);
  assert.equal(payload.tracks[0].distanceM, 1220);
}

{
  const older = { ...track, distanceM: 10, updatedAt: track.updatedAt - 1000 };
  const payload = await (await onRequestPut(context(request('PUT', { schemaVersion: 1, tracks: [older] })))).json();
  assert.equal(payload.accepted, 0);
  assert.equal(payload.skipped, 1);
  const fetched = await (await onRequestPost(context(request('POST', { schemaVersion: 1, ids: [track.id] })))).json();
  assert.equal(fetched.tracks[0].distanceM, 1220, 'An older local copy must not overwrite newer cloud history.');
}

{
  const newer = { ...track, distanceM: 1400, updatedAt: track.updatedAt + 1000 };
  const payload = await (await onRequestPut(context(request('PUT', { schemaVersion: 1, tracks: [newer] })))).json();
  assert.equal(payload.accepted, 1);
  const fetched = await (await onRequestPost(context(request('POST', { schemaVersion: 1, ids: [track.id] })))).json();
  assert.equal(fetched.tracks[0].distanceM, 1400);
}

console.log('PASS track history API stores named routes, exposes a manifest, fetches full points and resolves versions bidirectionally');
