import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const values = new Map([
  ['mobility.provider.mode', 'stationary'],
  ['mobility.provider.confidence', 0.95],
  ['mobility.provider.speedKmh', 0],
]);
let effective = {
  lat: 18.6404,
  lng: -68.3455,
  accuracy: 8,
  speedMps: 40 / 3.6,
  heading: 148,
  source: 'simulator',
  updatedAt: 100_000,
};

const context = {
  value(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
  getEffectiveLocation() { return { ...effective }; },
};

const sandbox = {
  console,
  Date,
  Math,
  CustomEvent: class CustomEvent {},
  setTimeout: () => 1,
  clearTimeout() {},
  dispatchEvent() {},
  WanderContext: context,
  WanderEngine: { run() {} },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const vmContext = vm.createContext(sandbox);
for (const file of ['runtime-engine-inference.js', 'runtime-pedestrian-motion.js']) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  new vm.Script(source, { filename: file }).runInContext(vmContext);
}

const simulated = vmContext.WanderEngineInference.inferSituation(context);
assert.equal(simulated.source, 'simulator');
assert.equal(Math.round(simulated.speedKmh), 40);
assert.equal(simulated.motion.status, 'moving');
assert.notEqual(simulated.mobility.mode, 'stationary');
assert.deepEqual(Array.from(simulated.motionEvidence.filterEvidence), ['simulator_override_authoritative']);

effective = { ...effective, source: 'gps' };
const real = vmContext.WanderEngineInference.inferSituation(context);
assert.equal(real.speedKmh, 0);
assert.notEqual(real.motion.status, 'moving');

console.log('PASS simulator movement overrides stationary real-GPS mobility');
