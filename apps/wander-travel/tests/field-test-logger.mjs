import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
}

function createRuntime() {
  const values = new Map();
  const listeners = new Set();
  let location = { lat: 19.89, lng: -70.96, accuracy: 8, speedMps: 0, source: 'simulator' };

  const context = {
    value(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
    set(key, value) { values.set(key, value); listeners.forEach((listener) => listener(key)); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getEffectiveLocation() { return location; },
    snapshot() { return Object.fromEntries(Array.from(values, ([key, value]) => [key, { value }])); },
  };

  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Blob,
    navigator: { userAgent: 'Wander Test' },
    document: { querySelector() { return null; }, body: { appendChild() {} }, createElement() { return {}; } },
    URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
    localStorage: new MemoryStorage(),
    setTimeout,
    clearTimeout,
    WanderContext: context,
    WanderVersion: 'v-test',
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const vmContext = vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(ROOT, 'runtime-field-test.js'), 'utf8');
  new vm.Script(source, { filename: 'runtime-field-test.js' }).runInContext(vmContext);

  return {
    api: vmContext.WanderFieldTest,
    context,
    setLocation(next) { location = next; },
  };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('logger starts a field session and captures app metadata', () => {
  const rt = createRuntime();
  const snapshot = rt.api.snapshot();
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.appVersion, 'v-test');
  assert.equal(snapshot.events.some((event) => event.type === 'field_test_started'), true);
});

test('nearby results are summarized to top ten items', () => {
  const rt = createRuntime();
  const items = Array.from({ length: 15 }, (_, index) => ({
    id: `poi-${index}`,
    name: `POI ${index}`,
    distanceM: index * 10,
    bearingDeg: 90,
    relevanceScore: 0.9,
    confidence: 0.8,
    sources: [{ id: 'openstreetmap', ref: `node/${index}` }],
    categories: [{ id: 'test', label: 'test' }],
  }));
  rt.context.set('nearby.current', {
    status: 'available',
    center: { lat: 19.89, lng: -70.96 },
    radiusM: 3000,
    mobility: { mode: 'walking', speedKmh: 4 },
    diagnostics: { normalizedCount: 15 },
    items,
  });

  const event = rt.api.snapshot().events.filter((item) => item.type === 'nearby_result').at(-1);
  assert.ok(event);
  assert.equal(event.payload.topItems.length, 10);
  assert.equal(event.payload.diagnostics.normalizedCount, 15);
});

test('field guide suggestion becomes a diagnostic event', () => {
  const rt = createRuntime();
  rt.context.set('fieldGuide.lastSuggestion', { poiId: 'poi-1', name: 'Fortaleza' });
  const event = rt.api.snapshot().events.filter((item) => item.type === 'field_guide_suggestion').at(-1);
  assert.ok(event);
  assert.equal(event.payload.poiId, 'poi-1');
});

test('clear creates a new session with a clear marker', () => {
  const rt = createRuntime();
  const before = rt.api.snapshot().sessionId;
  rt.api.clear();
  const after = rt.api.snapshot();
  assert.notEqual(after.sessionId, before);
  assert.equal(after.events.some((event) => event.type === 'field_test_cleared'), true);
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
console.log(`\n${passed}/${tests.length} field test logger tests passed`);
