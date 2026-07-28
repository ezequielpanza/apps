import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'runtime-cloud-backup.js'), 'utf8');
const DEVICE_KEY = 'b'.repeat(64);

class MemoryStorage {
  constructor(initial = {}) { this.values = new Map(Object.entries(initial)); }
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

function remoteBackup(data, timestamp = '2026-07-27T10:00:00.000Z') {
  return {
    schemaVersion: 1,
    clientUpdatedAt: timestamp,
    storedAt: timestamp,
    webVersion: 'v0.109.0',
    apkVersion: '0.11.0',
    contentHash: 'remote-hash',
    data: {
      'wander.personalPOIs.v1': null,
      'wander.sessions.v1': null,
      'wander.session.active.v1': null,
      'wander.sessions.settings.v1': null,
      'wander.recording.profile.v1': null,
      'wander.travelLog.entries.v1': null,
      'wander.travelLog.plans.v1': null,
      ...data,
    },
  };
}

function harness({ local = {}, remote = null } = {}) {
  const storage = new MemoryStorage(local);
  const calls = [];
  let reloaded = false;
  let storedRemote = remote;
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  documentTarget.querySelector = () => null;
  documentTarget.createElement = () => ({ innerHTML: '', querySelector: () => null });

  const fetchMock = async (_url, options = {}) => {
    calls.push({ method: options.method || 'GET', body: options.body || null, headers: options.headers || {} });
    if ((options.method || 'GET') === 'PUT') {
      storedRemote = { ...JSON.parse(options.body), storedAt: '2026-07-27T11:00:00.000Z' };
      return Response.json({ ok: true, storedAt: storedRemote.storedAt, clientUpdatedAt: storedRemote.clientUpdatedAt, contentHash: storedRemote.contentHash });
    }
    return Response.json({ ok: true, exists: Boolean(storedRemote), backup: storedRemote });
  };

  Object.assign(windowTarget, {
    Capacitor: {
      Plugins: {
        WanderCloudIdentity: {
          async getIdentity() {
            return { deviceKey: DEVICE_KEY, deviceLabel: 'BBBBBBBB', recoverableAfterReinstall: true };
          },
        },
      },
    },
    WanderVersion: 'v0.109.0',
    WanderWebVersion: 'v0.109.0',
    WanderContext: { set() {}, remove() {}, value() { return null; } },
    WanderPlatform: { apiUrl: (value) => value },
    WanderNativeAppVersion: { getVersion: () => '0.11.0' },
    location: { reload() { reloaded = true; } },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  });

  const sandbox = {
    window: windowTarget,
    globalThis: null,
    document: documentTarget,
    localStorage: storage,
    navigator: { onLine: true },
    fetch: fetchMock,
    Response,
    Request,
    Headers,
    crypto: webcrypto,
    TextEncoder,
    CustomEvent: CustomEventPolyfill,
    Event,
    EventTarget,
    Date,
    Math,
    JSON,
    Object,
    Array,
    Set,
    Map,
    Promise,
    Number,
    String,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'runtime-cloud-backup.js' });

  return {
    api: windowTarget.WanderCloudBackup,
    storage,
    calls,
    get remote() { return storedRemote; },
    get reloaded() { return reloaded; },
  };
}

{
  const remote = remoteBackup({
    'wander.personalPOIs.v1': JSON.stringify([{ id: 'poi-1', name: 'Casa', lat: 1, lng: 2 }]),
    'wander.sessions.v1': JSON.stringify([{ id: 'session-1', segments: [] }]),
    'wander.travelLog.entries.v1': JSON.stringify([{ id: 'entry-1', title: 'Llegada' }]),
  });
  const test = harness({ remote });
  const result = await test.api.bootstrap();
  assert.equal(result.reloading, true);
  assert.equal(result.restored, true);
  assert.equal(JSON.parse(test.storage.getItem('wander.personalPOIs.v1'))[0].name, 'Casa');
  assert.equal(JSON.parse(test.storage.getItem('wander.sessions.v1'))[0].id, 'session-1');
  assert.equal(test.calls.filter((call) => call.method === 'PUT').length, 0, 'Empty reinstall must never overwrite remote backup');
}

{
  const test = harness({
    local: {
      'wander.personalPOIs.v1': JSON.stringify([{ id: 'local-poi', name: 'Barco', lat: 3, lng: 4, updatedAt: 1785150000000 }]),
      'wander.sessions.v1': JSON.stringify([]),
      'wander.travelLog.entries.v1': JSON.stringify([]),
    },
  });
  const result = await test.api.bootstrap();
  assert.equal(result.uploaded, true);
  const put = test.calls.find((call) => call.method === 'PUT');
  assert.ok(put, 'Existing local field-test data must seed the first cloud backup');
  const payload = JSON.parse(put.body);
  assert.equal(JSON.parse(payload.data['wander.personalPOIs.v1'])[0].name, 'Barco');
  assert.equal(payload.webVersion, 'v0.109.0');
  assert.equal(payload.apkVersion, '0.11.0');
}

{
  const remote = remoteBackup({
    'wander.travelLog.entries.v1': JSON.stringify([{ id: 'remote-entry', title: 'Remoto' }]),
  }, '2026-07-27T12:00:00.000Z');
  const test = harness({
    local: {
      'wander.personalPOIs.v1': JSON.stringify([]),
      'wander.sessions.v1': JSON.stringify([]),
      'wander.travelLog.entries.v1': JSON.stringify([{ id: 'old-entry', title: 'Viejo', at: '2026-07-26T10:00:00.000Z' }]),
      'wander.cloudBackup.localUpdatedAt.v1': '2026-07-26T10:00:00.000Z',
    },
    remote,
  });
  const result = await test.api.bootstrap();
  assert.equal(result.restored, true);
  assert.equal(JSON.parse(test.storage.getItem('wander.travelLog.entries.v1'))[0].title, 'Remoto');
}

console.log('PASS cloud backup restores after reinstall, seeds first backup and resolves newer remote snapshots');
