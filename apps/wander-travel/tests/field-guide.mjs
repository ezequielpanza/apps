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
  const told = new Set();
  const remembered = [];
  const context = {
    value(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
    set(key, value) {
      values.set(key, value);
      listeners.forEach((listener) => listener(key));
      return value;
    },
    remove(key) {
      const existed = values.delete(key);
      if (existed) listeners.forEach((listener) => listener(key));
      return existed;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };

  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    localStorage: new MemoryStorage(),
    setTimeout: () => 1,
    clearTimeout: () => {},
    WanderContext: context,
    WanderEngine: {
      hasToldContent(contentId) { return told.has(contentId); },
      rememberContent(input) {
        told.add(input.contentId);
        remembered.push({ ...input });
        return { ...input };
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const vmContext = vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(ROOT, 'runtime-field-guide.js'), 'utf8');
  new vm.Script(source, { filename: 'runtime-field-guide.js' }).runInContext(vmContext);
  return { api: vmContext.WanderFieldGuide, context, told, remembered };
}

function current(items, mode = 'walking', speedKmh = 4) {
  return { items, mobility: { mode, speedKmh }, updatedAt: '2026-07-10T12:00:00.000Z' };
}

function item({ id, name, category, distanceM, score = 0.8, sources = 1, bearingDeg = null, notes = [] }) {
  return {
    id,
    name,
    categories: [{ id: category, label: category }],
    distanceM,
    bearingDeg,
    relevanceScore: score,
    confidence: 0.9,
    sources: Array.from({ length: sources }, (_, index) => ({ id: `source-${index}` })),
    notes,
  };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('guideworthy historic POI becomes a context candidate without touching UI', () => {
  const rt = createRuntime();
  rt.api.clearMemory();
  const fort = item({ id: 'fort', name: 'Fortaleza', category: 'historic=fort', distanceM: 180, sources: 2 });
  const result = rt.api.consider(current([fort]));

  assert.ok(result);
  assert.equal(result.poiId, 'fort');
  assert.equal(result.type, 'poi_nearby');
  assert.match(result.presentation.message, /lugar histórico/i);
  assert.match(result.presentation.message, /Varias fuentes/i);
  assert.equal(rt.context.value('fieldGuide.candidate').poiId, 'fort');
  assert.equal(rt.context.value('fieldGuide.lastSuggestion'), null);
});

test('utility POIs do not create spontaneous candidates', () => {
  const rt = createRuntime();
  rt.api.clearMemory();
  const pharmacy = item({ id: 'pharmacy', name: 'Farmacia', category: 'amenity=pharmacy', distanceM: 50, score: 0.95 });
  assert.equal(rt.api.selectCandidate(current([pharmacy]), Date.now()), null);
  assert.equal(rt.api.consider(current([pharmacy])), null);
});

test('cooldown and Content Memory begin only after presentation', () => {
  const rt = createRuntime();
  rt.api.clearMemory();
  const museum = item({ id: 'museum', name: 'Museo', category: 'tourism=museum', distanceM: 100 });
  const nearby = current([museum]);

  const candidate = rt.api.consider(nearby);
  assert.ok(candidate);
  assert.ok(rt.api.consider(nearby));

  const record = rt.api.markPresented(candidate);
  assert.equal(record.poiId, 'museum');
  assert.equal(rt.context.value('fieldGuide.candidate'), null);
  assert.equal(rt.remembered.length, 1);
  assert.equal(rt.remembered[0].contentId, 'field-guide:poi:museum:proximity-v1');
  assert.equal(rt.api.selectCandidate(nearby, Date.now()), null);
});

test('walking and car modes use different interruption distances', () => {
  const rt = createRuntime();
  rt.api.clearMemory();
  const park = item({ id: 'park', name: 'Parque', category: 'leisure=park', distanceM: 1200 });
  assert.equal(rt.api.selectCandidate(current([park], 'walking', 4), Date.now()), null);
  assert.ok(rt.api.selectCandidate(current([park], 'car', 45), Date.now()));
});

test('already told proximity content is suppressed even without local cooldown memory', () => {
  const rt = createRuntime();
  rt.api.clearMemory();
  const beach = item({ id: 'beach', name: 'Playa', category: 'natural=beach', distanceM: 150 });
  rt.told.add(rt.api.contentIdFor(beach));
  assert.equal(rt.api.selectCandidate(current([beach]), Date.now()), null);
});

test('presentation can use relative direction and consolidated notes', () => {
  const rt = createRuntime();
  rt.api.clearMemory();
  rt.context.set('motion.heading', 0);
  const fort = item({
    id: 'fort-note',
    name: 'Fortaleza',
    category: 'historic=fort',
    distanceM: 180,
    bearingDeg: 90,
    sources: 2,
    notes: [{ text: 'Fue construida para proteger la entrada de la bahía.', confidence: 0.9 }],
  });

  const presentation = rt.api.formatSuggestion(fort, current([fort]));
  assert.match(presentation.message, /a tu derecha/i);
  assert.match(presentation.message, /proteger la entrada de la bahía/i);
  assert.match(presentation.message, /Varias fuentes/i);
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
