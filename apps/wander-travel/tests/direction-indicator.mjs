import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'runtime-direction-indicator.js'), 'utf8');

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

class CustomEventPolyfill extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
}

function createHarness(location = {}) {
  const values = new Map();
  const listeners = new Set();
  const nativeListeners = new Map();
  let currentLocation = { lat: -34.6, lng: -58.4, accuracy: 8, updatedAt: new Date().toISOString(), ...location };

  const context = {
    set(key, value) { values.set(key, value); return value; },
    value(key, fallback = null) {
      if (key === 'location.effective.speedMps') return currentLocation.speedMps ?? fallback;
      return values.has(key) ? values.get(key) : fallback;
    },
    getEffectiveLocation() { return currentLocation; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };

  const arrow = { style: {} };
  const markerElement = { dataset: {}, querySelector: () => arrow };
  const map = {
    layers: [],
    removeLayer(layer) { this.layers = this.layers.filter((item) => item !== layer); },
  };
  const L = {
    divIcon(options) { return options; },
    latLng(lat, lng) { return { lat, lng }; },
    marker(point, options) {
      const marker = {
        point,
        options,
        addTo(target) { target.layers.push(marker); return marker; },
        setLatLng(next) { marker.point = next; },
        getElement() { return markerElement; },
      };
      return marker;
    },
  };

  const directionPlugin = {
    async addListener(name, callback) {
      nativeListeners.set(name, callback);
      return { remove() { nativeListeners.delete(name); } };
    },
    async setSensorEnabled({ enabled }) { return { available: true, enabled, running: enabled }; },
    async getStatus() { return { available: true, running: false }; },
  };

  const documentTarget = new EventTarget();
  documentTarget.visibilityState = 'visible';
  const windowTarget = new EventTarget();
  Object.assign(windowTarget, {
    WanderContext: context,
    WanderMapCore: { map },
    L,
    Capacitor: { Plugins: { WanderDirection: directionPlugin } },
  });

  const sandbox = {
    window: windowTarget,
    globalThis: null,
    document: documentTarget,
    localStorage: new MemoryStorage(),
    L,
    CustomEvent: CustomEventPolyfill,
    Event,
    EventTarget,
    Date,
    Math,
    Number,
    Object,
    Array,
    Set,
    Map,
    Promise,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'runtime-direction-indicator.js' });

  return {
    api: windowTarget.WanderDirectionIndicator,
    context,
    values,
    map,
    arrow,
    async compass(heading, confidence = 'high') {
      await Promise.resolve();
      nativeListeners.get('direction')?.({ heading, confidence, timestamp: Date.now() });
      await Promise.resolve();
    },
    updateLocation(patch) {
      currentLocation = { ...currentLocation, ...patch, updatedAt: patch.updatedAt || new Date().toISOString() };
      listeners.forEach((listener) => listener('location.effective', {}, {}));
    },
  };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('threshold zero uses compass only while stopped and GPS during movement', async () => {
  const harness = createHarness({ heading: 82, speedMps: 0 });
  await harness.compass(210);
  assert.equal(harness.api.getConfig().thresholdKmh, 0);
  assert.equal(harness.api.getState().source, 'compass');
  assert.ok(Math.abs(harness.api.getState().heading - 210) < 1);

  harness.updateLocation({ heading: 84, speedMps: 1, updatedAt: new Date(Date.now() + 1000).toISOString() });
  assert.equal(harness.api.getState().source, 'gps');
  assert.ok(Math.abs(harness.api.getState().heading - 84) < 1);
});

test('configurable threshold keeps compass below threshold and GPS above it', async () => {
  const harness = createHarness({ heading: 45, speedMps: 1 });
  harness.api.setConfig({ thresholdKmh: 5 });
  await harness.compass(120);
  assert.equal(harness.api.getState().source, 'compass');

  harness.updateLocation({ heading: 50, speedMps: 2, updatedAt: new Date(Date.now() + 1000).toISOString() });
  assert.equal(harness.api.getState().source, 'gps');
});

test('magnetic mode can be disabled independently', async () => {
  const harness = createHarness({ heading: 70, speedMps: 0 });
  await harness.compass(190);
  harness.api.setConfig({ magneticEnabled: false });
  assert.equal(harness.api.getState().source, 'none');

  harness.updateLocation({ heading: 72, speedMps: 1.2, updatedAt: new Date(Date.now() + 1000).toISOString() });
  assert.equal(harness.api.getState().source, 'gps');
});

test('indicator can be disabled without changing location data', async () => {
  const harness = createHarness({ heading: 135, speedMps: 2 });
  harness.api.setConfig({ enabled: false });
  assert.equal(harness.api.getState().source, 'none');
  assert.equal(harness.map.layers.length, 0);
  assert.equal(harness.context.getEffectiveLocation().heading, 135);
});

let passed = 0;
for (const current of tests) {
  try {
    await current.run();
    passed += 1;
    console.log('PASS', current.name);
  } catch (error) {
    console.error('FAIL', current.name);
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} direction indicator tests passed`);
