import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class MemoryStorage {
  constructor(shared = new Map()) { this.shared = shared; }
  getItem(key) { return this.shared.has(String(key)) ? this.shared.get(String(key)) : null; }
  setItem(key, value) { this.shared.set(String(key), String(value)); }
  removeItem(key) { this.shared.delete(String(key)); }
}

function load(context, file) {
  new vm.Script(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file }).runInContext(context);
}

function runtime(storage = new MemoryStorage()) {
  let timer = 0;
  const sandbox = {
    console,
    Date,
    Math,
    URL,
    localStorage: storage,
    setTimeout: () => ++timer,
    clearTimeout: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  [
    'runtime-source-policy.js',
    'runtime-poi-normalized.js',
    'runtime-poi-consolidated.js',
    'runtime-poi-store.js',
    'runtime-poi-engine.js',
  ].forEach((file) => load(context, file));
  return {
    normalized: context.WanderNormalizedPOI,
    consolidated: context.WanderConsolidatedPOI,
    store: context.WanderPOIStore,
    engine: context.WanderPOIEngine,
  };
}

const AT = '2026-07-09T12:00:00.000Z';
const tests = [];
const test = (name, run) => tests.push({ name, run });

function poi(rt, input) {
  return rt.normalized.create({
    confidence: 0.95,
    observedAt: AT,
    aliases: [],
    categories: [],
    identifiers: [],
    notes: [],
    evidence: [],
    ...input,
  }, AT);
}

test('Shared cross-source identifier produces a strong merge', () => {
  const rt = runtime();
  const osm = poi(rt, {
    name: 'Fortaleza San Felipe',
    location: { lat: 19.7900, lng: -70.6900, method: 'osm_node' },
    source: { id: 'openstreetmap', version: '0.3.0', ref: 'node/10' },
    identifiers: [
      { namespace: 'openstreetmap', value: 'node/10' },
      { namespace: 'wikidata', value: 'Q100' },
    ],
    notes: [{ text: 'Lugar histórico frente al mar.', kind: 'description', confidence: 0.9 }],
  });
  const wikidata = poi(rt, {
    name: 'San Felipe Fortress',
    location: { lat: 19.7901, lng: -70.6901, method: 'wikidata_p625' },
    source: { id: 'wikidata', version: '0.3.0', ref: 'Q100' },
    identifiers: [{ namespace: 'wikidata', value: 'Q100' }],
    notes: [{ text: 'Fortificación histórica.', kind: 'source_note', confidence: 0.95 }],
  });

  const comparison = rt.engine.compareNormalized(osm, wikidata);
  assert.equal(comparison.decision, 'match');
  assert.equal(comparison.reasons.includes('shared_identifier'), true);

  const result = rt.engine.consolidate([osm, wikidata]);
  assert.equal(result.consolidated.length, 1);
  const merged = result.consolidated[0];
  assert.equal(merged.memberIds.length, 2);
  assert.equal(merged.sources.length, 2);
  assert.equal(merged.identifiers.some((item) => item.namespace === 'wikidata' && item.value === 'Q100'), true);
  assert.equal(merged.notes.length, 2);
});

test('Exact name and nearby coordinates merge without shared identifiers', () => {
  const rt = runtime();
  const a = poi(rt, {
    name: 'The Patio',
    location: { lat: 19.90000, lng: -70.95000, method: 'source_a' },
    source: { id: 'openstreetmap', version: '0.3.0', ref: 'node/20' },
  });
  const b = poi(rt, {
    name: 'The Patio',
    location: { lat: 19.90020, lng: -70.95010, method: 'source_b' },
    source: { id: 'wikidata', version: '0.3.0', ref: 'Q200' },
  });

  const comparison = rt.engine.compareNormalized(a, b);
  assert.equal(comparison.decision, 'match');
  assert.equal(comparison.reasons.includes('exact_name_nearby'), true);
  assert.equal(rt.engine.consolidate([a, b]).consolidated.length, 1);
});

test('Same name far apart does not merge', () => {
  const rt = runtime();
  const a = poi(rt, {
    name: 'Central Park',
    location: { lat: 19.90, lng: -70.95, method: 'a' },
    source: { id: 'openstreetmap', version: '0.3.0', ref: 'node/30' },
  });
  const b = poi(rt, {
    name: 'Central Park',
    location: { lat: 19.93, lng: -70.95, method: 'b' },
    source: { id: 'wikidata', version: '0.3.0', ref: 'Q300' },
  });

  assert.equal(rt.engine.compareNormalized(a, b).decision, 'no_match');
  assert.equal(rt.engine.consolidate([a, b]).consolidated.length, 2);
});

test('Partial evidence remains ambiguous instead of forcing a merge', () => {
  const rt = runtime();
  const a = poi(rt, {
    name: 'Museo Casa Colon',
    location: { lat: 19.9000, lng: -70.9500, method: 'a' },
    source: { id: 'openstreetmap', version: '0.3.0', ref: 'node/40' },
  });
  const b = poi(rt, {
    name: 'Museo Casa de Colon',
    location: { lat: 19.9022, lng: -70.9500, method: 'b' },
    source: { id: 'wikidata', version: '0.3.0', ref: 'Q400' },
  });

  const comparison = rt.engine.compareNormalized(a, b);
  assert.equal(comparison.decision, 'ambiguous');
  const result = rt.engine.consolidate([a, b]);
  assert.equal(result.consolidated.length, 2);
  assert.equal(result.ambiguities.length, 1);
});

test('Store v4 persists formal consolidated POIs', () => {
  const shared = new Map();
  const rt = runtime(new MemoryStorage(shared));
  const a = poi(rt, {
    name: 'Lugar Uno',
    location: { lat: 19.90, lng: -70.95, method: 'osm_node' },
    source: { id: 'openstreetmap', version: '0.3.0', ref: 'node/50' },
    identifiers: [{ namespace: 'wikidata', value: 'Q500' }],
  });
  const b = poi(rt, {
    name: 'Place One',
    location: { lat: 19.9001, lng: -70.9501, method: 'wikidata_p625' },
    source: { id: 'wikidata', version: '0.3.0', ref: 'Q500' },
    identifiers: [{ namespace: 'wikidata', value: 'Q500' }],
  });

  rt.store.ingestNormalized([a, b]);
  const result = rt.engine.consolidateStore(rt.store);
  rt.store.flush();
  assert.equal(result.consolidated.length, 1);
  assert.equal(rt.store.storageKey, 'wander.poi.store.v4');
  assert.equal(rt.store.listConsolidated().length, 1);
  assert.equal(runtime(new MemoryStorage(shared)).store.listConsolidated().length, 1);
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
console.log(`\n${passed}/${tests.length} POI consolidation tests passed`);
