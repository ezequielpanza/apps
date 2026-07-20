import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'runtime-native-location-source.js'), 'utf8');

class MemoryStorage {
  constructor() { this.values = new Map(); }
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

const windowTarget = new EventTarget();
const documentTarget = new EventTarget();
documentTarget.visibilityState = 'visible';
const listeners = new Map();
const acknowledged = [];
let pendingCalls = 0;
let startedWith = null;

const pendingLocations = [
  {
    journalId: 101,
    latitude: 18.505,
    longitude: -68.381,
    accuracy: 8,
    speed: 5,
    provider: 'gps',
    permissionPrecision: 'precise',
    timestamp: 1000,
    replayed: true,
  },
  {
    journalId: 102,
    latitude: 18.506,
    longitude: -68.380,
    accuracy: 9,
    speed: 6,
    provider: 'gps',
    permissionPrecision: 'precise',
    timestamp: 6000,
    replayed: true,
  },
];

const plugin = {
  async addListener(name, callback) {
    listeners.set(name, callback);
    return { remove() {} };
  },
  async start(options) {
    startedWith = options;
  },
  async stop() {},
  async getBackgroundStatus() {
    return { watching: true, pendingCount: pendingLocations.length, latestRecordedAt: 6000, nativeJournal: true };
  },
  async getPendingLocations() {
    pendingCalls += 1;
    if (pendingCalls === 1) return { watching: true, pendingCount: 2, latestRecordedAt: 6000, locations: pendingLocations };
    return { watching: true, pendingCount: 0, latestRecordedAt: 6000, locations: [] };
  },
  async acknowledgeLocations({ ids }) {
    acknowledged.push(...ids);
    return { acknowledged: ids.length, pendingCount: 0 };
  },
};

const contextValues = new Map();
const wanderContext = {
  set(key, value) { contextValues.set(key, value); },
};

const sandbox = Object.assign(windowTarget, {
  console,
  Date,
  Math,
  JSON,
  Promise,
  Set,
  CustomEvent: CustomEventPolyfill,
  Event,
  EventTarget,
  localStorage: new MemoryStorage(),
  document: documentTarget,
  WanderContext: wanderContext,
  Capacitor: {
    isNativePlatform: () => true,
    Plugins: { WanderLocation: plugin },
  },
});
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.runInNewContext(source, sandbox, { filename: 'runtime-native-location-source.js' });

const received = [];
const errors = [];
const nativeSource = sandbox.WanderNativeLocationSource;
assert.ok(nativeSource, 'Native location source must initialize');
assert.equal(nativeSource.capabilities.nativeJournal, true);
assert.equal(nativeSource.capabilities.replaysMissedLocations, true);

assert.equal(nativeSource.start({
  onPosition(position) { received.push(position); },
  onError(error) { errors.push(error); },
  options: { enableHighAccuracy: true },
}), true);

await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(errors.length, 0);
assert.equal(received.length, 2);
assert.deepEqual(received.map((position) => position.journalId), [101, 102]);
assert.deepEqual(acknowledged.slice(0, 2), [101, 102]);
assert.equal(startedWith.minimumIntervalMs, 5000);
assert.equal(startedWith.minimumDistanceM, 5);
assert.equal(contextValues.get('location.background.lastSyncedCount'), 2);

listeners.get('location')?.({
  journalId: 103,
  latitude: 18.507,
  longitude: -68.379,
  accuracy: 7,
  speed: 4,
  provider: 'gps',
  permissionPrecision: 'precise',
  timestamp: 11000,
  replayed: false,
});
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(received.length, 3);
assert.equal(received[2].journalId, 103);
assert.ok(acknowledged.includes(103));

listeners.get('location')?.({
  journalId: 103,
  latitude: 18.507,
  longitude: -68.379,
  accuracy: 7,
  speed: 4,
  provider: 'gps',
  permissionPrecision: 'precise',
  timestamp: 11000,
  replayed: true,
});
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(received.length, 3, 'A journaled location must not be applied twice');

console.log('PASS native background locations are persisted, replayed and acknowledged exactly once');
