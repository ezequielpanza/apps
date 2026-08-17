import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let NOW = Date.parse('2026-07-28T12:00:00.000Z');
class FakeDate extends Date {
  constructor(value = NOW) { super(value); }
  static now() { return NOW; }
}

const contextListeners = new Set();
const values = new Map();
const context = {
  value(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
  subscribe(listener) { contextListeners.add(listener); return () => contextListeners.delete(listener); },
};

let currentResult = null;
const inference = {
  inferSituation() { return structuredClone(currentResult); },
};

const sandbox = {
  window: null,
  globalThis: null,
  WanderContext: context,
  WanderEngineInference: inference,
  Date: FakeDate,
  Number,
  Math,
  Object,
  Array,
  String,
  Boolean,
  JSON,
  console,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const source = fs.readFileSync(new URL('../runtime-sensor-motion-bridge.js', import.meta.url), 'utf8');
vm.runInNewContext(source, sandbox, { filename: 'runtime-sensor-motion-bridge.js' });

function sensorSummary(active = true) {
  return {
    updatedAt: new FakeDate().toISOString(),
    sampleCount: 20,
    windowMs: 5000,
    rms: active ? .55 : .05,
    variance: active ? .05 : .001,
    peak: active ? 1.2 : .1,
    activeRatio: active ? .8 : .05,
    last: { activity: active ? .4 : .01 },
  };
}

function baseResult(status = 'stationary', evidence = {}) {
  return {
    locationAvailable: true,
    source: 'gps',
    speedKmh: status === 'moving' ? 2 : 0,
    heading: status === 'moving' ? 90 : null,
    motion: { status, activity: status === 'moving' ? 'moving' : 'paused', label: status, confidence: .8, evidence: [] },
    mobility: { mode: status === 'moving' ? 'walking' : 'stationary', confidence: .8 },
    motionEvidence: {
      adjustedDisplacementM: 0,
      displacementM: 2,
      accuracyM: 8,
      derivedSpeedKmh: 0,
      segmentMedianSpeedKmh: 0,
      segmentCount: 0,
      providerSpeedKmh: 0,
      rawSpeedMedianKmh: 0,
      stationaryWindowSpreadM: 3,
      ...evidence,
    },
  };
}

values.set('motion.sensor.status', 'available');
values.set('motion.sensor.summary', sensorSummary(true));

currentResult = baseResult('moving');
let result = inference.inferSituation(context);
assert.equal(result.motion.status, 'pending', 'startup must not begin a track from uncorroborated motion');
assert.ok(result.motion.evidence.includes('startup_guard_active'));
assert.ok(result.motion.evidence.includes('accelerometer_without_position_corroboration'));

NOW += 21000;
values.set('motion.sensor.summary', sensorSummary(true));
currentResult = baseResult('stationary');
result = inference.inferSituation(context);
assert.equal(result.motion.status, 'stationary', 'stable position after startup must settle as stationary');

NOW += 1000;
values.set('motion.sensor.summary', sensorSummary(true));
currentResult = baseResult('stationary');
result = inference.inferSituation(context);
assert.equal(result.motion.status, 'stationary', 'accelerometer activity alone must not open a movement track');

currentResult = baseResult('moving', {
  adjustedDisplacementM: 40,
  displacementM: 55,
  derivedSpeedKmh: 9,
  segmentMedianSpeedKmh: 9,
  segmentCount: 3,
  providerSpeedKmh: 8,
  rawSpeedMedianKmh: 6,
  stationaryWindowSpreadM: 35,
});
result = inference.inferSituation(context);
assert.equal(result.motion.status, 'stationary', 'movement requires sustained confirmation');
NOW += 10100;
values.set('motion.sensor.summary', sensorSummary(true));
result = inference.inferSituation(context);
assert.equal(result.motion.status, 'moving', 'strong corroborated movement becomes active after the 10-second hysteresis');

console.log('PASS startup and accelerometer noise cannot create movement without sustained positional corroboration');
