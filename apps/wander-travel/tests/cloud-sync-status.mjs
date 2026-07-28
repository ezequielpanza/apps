import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'runtime-cloud-backup.js'), 'utf8');
const DEVICE_KEY = 'c'.repeat(64);

class MemoryStorage {
  constructor(initial = {}) { this.values = new Map(Object.entries(initial)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  snapshot() { return Object.fromEntries(this.values); }
}

class CustomEventPolyfill extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
}

function harness({ local = {}, remote = null, online = true } = {}) {
  const storage = new MemoryStorage(local);
  const calls = [];
  let storedRemote = remote;
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  documentTarget.visibilityState = 'visible';
  documentTarget.querySelector = () => null;
  documentTarget.createElement = () => ({ innerHTML: '', querySelector: () => null });

  const fetchMock = async (_url, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ method, body: options.body || null });
    if (method === 'PUT') {
      const incoming = JSON.parse(options.body);
      storedRemote = { ...incoming, storedAt: '2026-07-28T20:30:00.000Z' };
      return Response.json({
        ok: true,
        storedAt: storedRemote.storedAt,
        clientUpdatedAt: storedRemote.clientUpdatedAt,
        contentHash: storedRemote.contentHash,
      });
    }
    return Response.json({ ok: true, exists: Boolean(storedRemote), backup: storedRemote });
  };

  const shortTimeout = (callback, delay = 0) => {
    if (delay < 100) queueMicrotask(callback);
    return 1;
  };

  Object.assign(windowTarget, {
    Capacitor: {
      Plugins: {
        WanderCloudIdentity: {
          async getIdentity() {
            return { deviceKey: DEVICE_KEY, deviceLabel: 'CCCCCCCC', recoverableAfterReinstall: true };
          },
        },
      },
    },
    WanderVersion: 'v0.109.5',
    WanderWebVersion: 'v0.109.5',
    WanderContext: { set() {}, remove() {}, value() { return null; } },
    WanderPlatform: { apiUrl: (value) => value },
    WanderNativeAppVersion: { getVersion: () => '0.11.6' },
    location: { reload() {} },
    setTimeout: shortTimeout,
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
  });

  const sandbox = {
    window: windowTarget,
    globalThis: null,
    document: documentTarget,
    localStorage: storage,
    navigator: { onLine: online },
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
    setTimeout: shortTimeout,
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    queueMicrotask,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'runtime-cloud-backup.js' });

  return {
    api: windowTarget.WanderCloudBackup,
    storage,
    calls,
    windowTarget,
    get remote() { return storedRemote; },
  };
}

const localData = {
  'wander.personalPOIs.v1': JSON.stringify([{ id: 'poi-1', name: 'Barco', lat: 1, lng: 2 }]),
  'wander.sessions.v1': JSON.stringify([{ id: 'session-1', segments: [] }]),
  'wander.travelLog.entries.v1': JSON.stringify([{ id: 'entry-1', title: 'Llegada', at: '2026-07-28T20:00:00.000Z' }]),
  'wander.travelLog.plans.v1': JSON.stringify([]),
};

{
  const test = harness({ local: localData });
  const result = await test.api.bootstrap();
  assert.equal(result.uploaded, true);
  assert.ok(test.storage.getItem('wander.cloudBackup.lastSuccessAt.v1'), 'Successful cloud timestamp must persist locally');
  assert.ok(test.storage.getItem('wander.cloudBackup.lastAttemptAt.v1'), 'Last attempt timestamp must persist locally');
  assert.equal(test.storage.getItem('wander.cloudBackup.pendingSince.v1'), null, 'Confirmed backup must clear pending changes');
  assert.equal(test.api.getState().lastSyncAt, '2026-07-28T20:30:00.000Z');
  assert.deepEqual(JSON.parse(JSON.stringify(test.api.dataCounts())), { pois: 1, sessions: 1, entries: 1, plans: 0 });

  const before = test.calls.filter((call) => call.method === 'PUT').length;
  await test.api.synchronize({ force: true, reason: 'manual' });
  assert.equal(test.calls.filter((call) => call.method === 'PUT').length, before + 1, 'Manual backup must upload even when data is unchanged');
}

{
  const first = harness({ local: localData });
  await first.api.bootstrap();
  const restarted = harness({ local: first.storage.snapshot(), remote: first.remote });
  assert.equal(restarted.api.getState().lastSyncAt, '2026-07-28T20:30:00.000Z', 'Last confirmed backup must survive an app restart');
  const result = await restarted.api.bootstrap();
  assert.equal(result.synced, true);
  assert.equal(restarted.calls.filter((call) => call.method === 'PUT').length, 0, 'Identical remote data must not be uploaded automatically');
}

{
  const test = harness({ local: localData, online: false });
  test.api.start();
  test.windowTarget.dispatchEvent(new CustomEventPolyfill('wander:travel-log-change', { detail: { type: 'entry-added' } }));
  const state = test.api.getState();
  assert.equal(state.pending, true);
  assert.ok(state.pendingSince);
  assert.equal(test.storage.getItem('wander.cloudBackup.pendingSince.v1'), state.pendingSince);
}

assert.match(source, /Último backup confirmado/);
assert.match(source, /Cambios pendientes/);
assert.match(source, /Último intento/);
assert.match(source, /Crear backup ahora/);
assert.match(source, /result\.contentHash && result\.contentHash !== backup\.contentHash/);

console.log('PASS cloud sync persists confirmation timestamps, exposes pending state and supports forced backups');
