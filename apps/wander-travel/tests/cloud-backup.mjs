import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeSource = fs.readFileSync(path.join(ROOT, 'backup/runtime.js'), 'utf8');
const endpointModule = await import(pathToFileURL(path.join(ROOT, 'functions/api/backup.js')).href + `?test=${Date.now()}`);

class MemoryStorage {
  constructor(initial = {}) { this.values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)])); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

class CustomEventPolyfill extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
}

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function settle(turns = 8) {
  for (let index = 0; index < turns; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

function runtimeHarness({ local = {}, session = {}, fetchImpl }) {
  const target = new EventTarget();
  const localStorage = new MemoryStorage(local);
  const sessionStorage = new MemoryStorage(session);
  let reloads = 0;
  const contextValues = new Map();
  const windowObject = Object.assign(target, {
    Capacitor: { isNativePlatform: () => true },
    WanderBackupConfig: {
      enabled: true,
      endpoint: 'https://wander-travel.pages.dev/api/backup',
      token: 'test-token',
      channel: 'shared-test-v1',
    },
    WanderContext: {
      set(key, value) { contextValues.set(key, value); },
      value(key) { return contextValues.get(key) ?? null; },
    },
    WanderWebVersion: 'v0.109.0',
    WanderVersion: 'v0.109.0',
    location: { reload() { reloads += 1; } },
    setInterval() { return 1; },
  });
  const sandbox = {
    window: windowObject,
    document: { querySelector() { return null; }, createElement() { throw new Error('Settings UI should not be created in this test'); } },
    localStorage,
    sessionStorage,
    fetch: fetchImpl,
    Response,
    Event,
    EventTarget,
    CustomEvent: CustomEventPolyfill,
    Date,
    Math,
    JSON,
    String,
    Number,
    Boolean,
    Object,
    Array,
    Map,
    Set,
    Error,
    Promise,
    console,
    queueMicrotask,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(runtimeSource, sandbox, { filename: 'backup/runtime.js' });
  return {
    api: windowObject.WanderCloudBackup,
    localStorage,
    sessionStorage,
    reloads: () => reloads,
  };
}

{
  const cloudPoint = { id: 'personal-poi-cloud', name: 'Casa', lat: 18.4, lng: -69.9, updatedAt: 100 };
  const cloudSession = { id: 'session-cloud', name: 'Recorrido', updatedAt: 100, segments: [] };
  const calls = [];
  const harness = runtimeHarness({
    fetchImpl: async (_url, options = {}) => {
      calls.push(options.method || 'GET');
      return response({
        ok: true,
        exists: true,
        schemaVersion: 1,
        revision: 'revision-cloud',
        updatedAt: '2026-07-27T23:00:00.000Z',
        data: {
          'wander.personalPOIs.v1': [cloudPoint],
          'wander.sessions.v1': [cloudSession],
          'wander.travelLog.entries.v1': [{ id: 'log-cloud', at: '2026-07-27T22:00:00.000Z', title: 'Llegada' }],
          'wander.travelLog.plans.v1': [],
        },
      });
    },
  });
  await settle();
  assert.deepEqual(JSON.parse(harness.localStorage.getItem('wander.personalPOIs.v1')), [cloudPoint]);
  assert.deepEqual(JSON.parse(harness.localStorage.getItem('wander.sessions.v1')), [cloudSession]);
  assert.equal(harness.reloads(), 1, 'Fresh installation must reload after restoring cloud data');
  assert.deepEqual(calls, ['GET'], 'Fresh installation must restore before any upload');
}

{
  const localPoint = { id: 'personal-poi-local', name: 'Auto', lat: 18.5, lng: -69.8, updatedAt: 200 };
  const cloudPoint = { id: 'personal-poi-cloud', name: 'Casa', lat: 18.4, lng: -69.9, updatedAt: 100 };
  let putCalls = 0;
  const harness = runtimeHarness({
    local: {
      'wander.personalPOIs.v1': JSON.stringify([localPoint]),
      'wander.sessions.v1': '[]',
      'wander.travelLog.entries.v1': '[]',
      'wander.travelLog.plans.v1': '[]',
      'wander.cloudBackup.meta.v1': JSON.stringify({ revision: 'revision-old' }),
    },
    fetchImpl: async (_url, options = {}) => {
      const method = options.method || 'GET';
      if (method === 'GET') {
        return response({
          ok: true,
          exists: true,
          schemaVersion: 1,
          revision: 'revision-old',
          updatedAt: '2026-07-27T23:00:00.000Z',
          data: {
            'wander.personalPOIs.v1': [localPoint],
            'wander.sessions.v1': [],
            'wander.travelLog.entries.v1': [],
            'wander.travelLog.plans.v1': [],
          },
        });
      }
      putCalls += 1;
      assert.equal(options.headers['if-match'], 'revision-old');
      return response({
        ok: false,
        exists: true,
        conflict: true,
        error: 'Backup changed in another installation.',
        revision: 'revision-new',
        updatedAt: '2026-07-27T23:05:00.000Z',
        data: {
          'wander.personalPOIs.v1': [cloudPoint],
          'wander.sessions.v1': [],
          'wander.travelLog.entries.v1': [],
          'wander.travelLog.plans.v1': [],
        },
      }, 409);
    },
  });
  await settle();
  await harness.api.syncNow();
  await settle();
  const restored = JSON.parse(harness.localStorage.getItem('wander.personalPOIs.v1'));
  assert.deepEqual(new Set(restored.map((point) => point.id)), new Set([localPoint.id, cloudPoint.id]));
  assert.equal(putCalls, 1);
  assert.equal(harness.reloads(), 1, 'Conflict merge must reload before retrying the upload');
  assert.equal(JSON.parse(harness.localStorage.getItem('wander.cloudBackup.meta.v1')).revision, 'revision-new');
  assert.equal(harness.sessionStorage.getItem('wander.cloudBackup.uploadAfterReload.v1'), 'true');
}

class FakeR2Object {
  constructor(record) {
    this.record = record;
    this.customMetadata = record.customMetadata || {};
    this.httpEtag = record.httpEtag;
  }
  async text() { return this.record.body; }
}

class FakeR2Bucket {
  constructor() { this.objects = new Map(); this.counter = 0; }
  async get(key) {
    const record = this.objects.get(key);
    return record ? new FakeR2Object(record) : null;
  }
  async put(key, body, options = {}) {
    const text = typeof body === 'string' ? body : await new Response(body).text();
    const record = {
      body: text,
      customMetadata: options.customMetadata || {},
      httpEtag: `etag-${++this.counter}`,
    };
    this.objects.set(key, record);
    return new FakeR2Object(record);
  }
}

function endpointContext(bucket, method, payload = null, revision = null) {
  return {
    request: new Request('https://wander-travel.pages.dev/api/backup', {
      method,
      headers: {
        authorization: 'Bearer test-token',
        ...(payload ? { 'content-type': 'application/json' } : {}),
        ...(revision ? { 'if-match': revision } : {}),
      },
      body: payload ? JSON.stringify(payload) : null,
    }),
    env: {
      WANDER_BACKUP_SPACE_TOKEN: 'test-token',
      WANDER_BACKUP_BUCKET: bucket,
    },
  };
}

{
  const bucket = new FakeR2Bucket();
  const firstSnapshot = {
    schemaVersion: 1,
    appVersion: 'v0.109.0',
    apkVersion: '0.11.0',
    source: { platform: 'android' },
    data: {
      'wander.personalPOIs.v1': [{ id: 'point-1', updatedAt: 1 }],
      'wander.sessions.v1': [],
      'wander.travelLog.entries.v1': [],
      'wander.travelLog.plans.v1': [],
    },
  };
  const firstResponse = await endpointModule.onRequestPut(endpointContext(bucket, 'PUT', firstSnapshot));
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.ok(first.revision);

  const staleResponse = await endpointModule.onRequestPut(endpointContext(bucket, 'PUT', firstSnapshot));
  assert.equal(staleResponse.status, 409, 'Existing backup must require its current revision');
  const stale = await staleResponse.json();
  assert.equal(stale.conflict, true);
  assert.equal(stale.revision, first.revision);

  const secondSnapshot = {
    ...firstSnapshot,
    data: {
      ...firstSnapshot.data,
      'wander.personalPOIs.v1': [{ id: 'point-1', updatedAt: 2 }, { id: 'point-2', updatedAt: 2 }],
    },
  };
  const secondResponse = await endpointModule.onRequestPut(endpointContext(bucket, 'PUT', secondSnapshot, first.revision));
  assert.equal(secondResponse.status, 200);
  const second = await secondResponse.json();
  assert.notEqual(second.revision, first.revision);
  assert.ok(bucket.objects.has('wander-test/shared/previous-v1.json'), 'Endpoint must retain the previous snapshot');

  const getResponse = await endpointModule.onRequestGet(endpointContext(bucket, 'GET'));
  assert.equal(getResponse.status, 200);
  const latest = await getResponse.json();
  assert.equal(latest.revision, second.revision);
  assert.equal(latest.counts.points, 2);
}

console.log('PASS cloud backup restores before upload, merges conflicts, and preserves the previous R2 snapshot');
