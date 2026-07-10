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
  const shown = [];
  const context = {
    value(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
    set(key, value) {
      values.set(key, value);
      listeners.forEach((listener) => listener(key));
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };

  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    localStorage: new MemoryStorage(),
    setTimeout,
    clearTimeout,
    WanderContext: context,
    WanderUI: {
      showWander(title, message) { shown.push({ title, message }); },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const vmContext = vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(ROOT, 'runtime-field-guide.js'), 'utf8');
  new vm.Script(source, { filename: 'runtime-field-guide.js' }).runInContext(vmContext);
  return { api: vmContext.WanderFieldGuide, context, shown };
}

function current(items, mode = 'walking', speedKmh = 4) {
  return { items, mobility: { mode, speedKmh } };
}

function item({ id, name, category, distanceM, score = 0.8, sources = 1 }) {
  return {
    id,
    name,
    categories: [{ id: category, label: category }],
    distanceM,
    relevanceScore: score,
    confidence: 0.9,
    sources: Array.from({ length: sources }, (_, index) => ({ id: `source-${index}` })),
  };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('guideworthy historic POI is selected and shown', () => {
  const rt = createRuntime();
  const fort = item({ id: 'fort', name: 'Fortaleza', category: 'historic=fort', distanceM: 180, sources: 2 });
  rt.context.set('nearby.current', current([fort]));
  rt.api.clearMemory();
  const result = rt.api.consider();
  assert.ok(result);
  assert.equal(result.item.id, 'fort');
  assert.match(result.message.message, /lugar histórico/i);
  assert.match(result.message.message, /Varias fuentes/i);
  assert.equal(rt.shown.at(-1).title, 'Fortaleza');
});

test('utility POIs do not interrupt the user', () => {
  const rt = createRuntime();
  rt.api.clearMemory();
  const pharmacy = item({ id: 'pharmacy', name: 'Farmacia', category: 'amenity=pharmacy', distanceM: 50, score: 0.95 });
  assert.equal(rt.api.selectCandidate(current([pharmacy]), Date.now()), null);
});

test('same POI is not repeated inside per-POI cooldown', () => {
  const rt = createRuntime();
  rt.api.clearMemory();
  const museum = item({ id: 'museum', name: 'Museo', category: 'tourism=museum', distanceM: 100 });
  rt.context.set('nearby.current', current([museum]));
  assert.ok(rt.api.consider());
  assert.equal(rt.api.consider(), null);
});

test('walking and car modes use different interruption distances', () => {
  const rt = createRuntime();
  rt.api.clearMemory();
  const park = item({ id: 'park', name: 'Parque', category: 'leisure=park', distanceM: 1200 });
  assert.equal(rt.api.selectCandidate(current([park], 'walking', 4), Date.now()), null);
  assert.ok(rt.api.selectCandidate(current([park], 'car', 45), Date.now()));
});

let passed = 0;
for (const currentTest of tests) {
  try {
    await currentTest.run();
    passed += 1;
    console.log('PASS', currentTest.name);
  } catch (error) {
    console.error('FAIL', currentTest.name);
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} field guide tests passed`);
