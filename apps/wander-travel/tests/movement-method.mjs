import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let now = 100_000;

class FakeDate extends Date {
  constructor(value = now) { super(value); }
  static now() { return now; }
}

const values = new Map();
const context = {
  value(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
  set(key, value) { values.set(key, value); },
  setContext(input) { values.set('context.status', input.status); },
};

let evaluation = {
  situation: {
    locationAvailable: true,
    speedKmh: 5,
    mobility: { mode: 'unknown' },
    motion: { status: 'moving', label: 'En movimiento', evidence: ['gps'] },
  },
};
let evaluationListener = null;
const engine = {
  subscribeEvaluation(listener) { evaluationListener = listener; },
  getLastEvaluation() { return evaluation; },
  evaluate() { return evaluation; },
  inferSituation() { return evaluation.situation; },
};

const sandbox = {
  console,
  Date: FakeDate,
  Math,
  WanderContext: context,
  WanderEngine: engine,
  CustomEvent: class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  },
  dispatchEvent() {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const vmContext = vm.createContext(sandbox);
const source = fs.readFileSync(path.join(ROOT, 'runtime-situation-engine.js'), 'utf8');
new vm.Script(source, { filename: 'runtime-situation-engine.js' }).runInContext(vmContext);

assert.equal(typeof evaluationListener, 'function');
assert.equal(values.get('mobility.method').id, 'unknown');
assert.equal(values.get('mobility.methodDetectionReady'), false);
assert.equal(vmContext.WanderSituationEngine.getCurrent().selectedState.label, 'En movimiento');

now += 61_000;
vmContext.WanderSituationEngine.evaluate();
assert.equal(values.get('mobility.method').id, 'walking');
assert.equal(values.get('mobility.methodDetectionReady'), true);
assert.equal(vmContext.WanderSituationEngine.getCurrent().selectedState.label, 'Caminando');

evaluation = {
  situation: {
    locationAvailable: true,
    speedKmh: 0,
    mobility: { mode: 'unknown' },
    motion: { status: 'stationary', label: 'Detenido', evidence: ['gps'] },
  },
};
now += 1_000;
vmContext.WanderSituationEngine.evaluate();
assert.equal(values.get('mobility.method').id, 'stationary');
assert.equal(vmContext.WanderSituationEngine.getCurrent().selectedState.label, 'Detenido');

console.log('PASS movement method waits for evidence and resets when stationary');
