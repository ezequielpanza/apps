import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'runtime-provider-location.js'), 'utf8');

class CustomEventPolyfill extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
}

const contextValues = new Map([
  ['motion.status', 'stationary'],
  ['context.status', 'detenido'],
]);
const accepted = [];
let callbacks = null;
let watching = false;

const context = {
  value(key, fallback = null) { return contextValues.has(key) ? contextValues.get(key) : fallback; },
  set(key, value) { contextValues.set(key, value); return value; },
  setRealLocation(payload) { accepted.push(payload); return true; },
  setRealLocationStatus(status) { contextValues.set('location.real.status', status); },
};

const sourceAdapter = {
  id: 'test-location',
  isSupported: () => true,
  isWatching: () => watching,
  start(options) { callbacks = options; watching = true; return true; },
  stop() { watching = false; },
};

const windowTarget = new EventTarget();
Object.assign(windowTarget, {
  WanderContext: context,
  WanderLocationSources: { resolve: () => sourceAdapter },
  WanderProviders: {},
});

const sandbox = {
  window: windowTarget,
  globalThis: null,
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
  setTimeout,
  clearTimeout,
};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'runtime-provider-location.js' });
assert.ok(callbacks?.onPosition, 'Location provider must start and expose onPosition');

function position({ lat, lng, at, accuracy = 8, speedMps = 0, heading = 0 }) {
  return {
    coords: { latitude: lat, longitude: lng, accuracy, speed: speedMps, heading, altitude: null },
    provider: 'gps',
    permissionPrecision: 'precise',
    timestamp: at,
  };
}

const baseAt = Date.now();
callbacks.onPosition(position({ lat: 18.3500000, lng: -68.8300000, at: baseAt }));
assert.equal(accepted.length, 1);

callbacks.onPosition(position({ lat: 18.3530000, lng: -68.8270000, at: baseAt + 5000, speedMps: 0, accuracy: 10 }));
assert.equal(accepted.length, 1, 'A single stationary jump must not replace the accepted position');
assert.equal(windowTarget.WanderProviders.location.getValidationState().rejectedJumpCount, 1);
assert.equal(contextValues.get('location.validation.status'), 'rejected');

callbacks.onPosition(position({ lat: 18.3500150, lng: -68.8299900, at: baseAt + 10000, speedMps: 0.4, accuracy: 9 }));
assert.equal(accepted.length, 2, 'Returning to the original cluster must be accepted');
assert.ok(Math.abs(accepted.at(-1).lat - 18.3500150) < 1e-9);

callbacks.onPosition(position({ lat: 18.3500600, lng: -68.8299900, at: baseAt + 15000, speedMps: 1.1, accuracy: 8, heading: 4 }));
assert.equal(accepted.length, 3, 'Normal walking movement must remain accepted');

callbacks.onPosition(position({ lat: 18.3560000, lng: -68.8240000, at: baseAt + 20000, speedMps: 0, accuracy: 9 }));
assert.equal(accepted.length, 3);
callbacks.onPosition(position({ lat: 18.3560100, lng: -68.8240100, at: baseAt + 25000, speedMps: 0, accuracy: 8 }));
assert.equal(accepted.length, 4, 'A second consistent fix may confirm a genuine relocation');
assert.equal(contextValues.get('location.validation.status'), 'relocated');

console.log('PASS isolated GPS jumps are quarantined while real movement and confirmed relocations are accepted');
