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
    console, Date, Math, URL, localStorage: storage,
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
    policy: context.WanderSourcePolicy,
    normalized: context.WanderNormalizedPOI,
    consolidated: context.WanderConsolidatedPOI,
    store: context.WanderPOIStore,
    engine: context.WanderPOIEngine,
  };
}

const AT = '2026-07-09T12:00:00.000Z';
const tests = [];
const test = (name, run) => tests.push({ name, run });

function makePOI(rt, sourceId, ref = '1', name = `POI ${sourceId}`) {
  return rt.normalized.create({
    name,
    location: { lat: 19.9, lng: -70.95, method: `${sourceId}_point` },
    source: { id: sourceId, version: '1.0.0', ref },
    confidence: 0.9,
    observedAt: AT,
    identifiers: [{ namespace: sourceId, value: ref }],
    notes: [{ text: `Nota ${sourceId}`, kind: 'note', confidence: 0.9 }],
    evidence: [{ type: 'source_entity_id', value: ref, confidence: 1 }],
  }, AT);
}

test('NormalizedPOI contract is source-independent', () => {
  const rt = runtime();
  const poi = makePOI(rt, 'test-source');
  assert.equal(rt.normalized.isNormalizedPOI(poi), true);
  assert.equal(poi.identifiers.length, 1);
  assert.equal(poi.notes.length, 1);
});

test('Stable source ref keeps POI identity stable', () => {
  const rt = runtime();
  const first = makePOI(rt, 'stable-source', 'entity-123', 'Nombre inicial');
  const second = rt.normalized.create({
    name: 'Nombre corregido',
    location: { lat: 19.9001, lng: -70.9501, method: 'source_point' },
    source: { id: 'stable-source', version: '1.0.0', ref: 'entity-123' },
    confidence: 0.95,
    observedAt: AT,
  }, AT);
  assert.equal(first.id, second.id);
});

test('External-only source policies cannot enter the POI pipeline', () => {
  const rt = runtime();
  for (const id of ['google-maps', 'tripadvisor']) {
    assert.equal(rt.policy.get(id).mode, 'external_only');
    assert.equal(rt.policy.get(id).storePOIs, false);
  }
  assert.equal(rt.engine.listConnectors().length, 0);
  assert.throws(() => rt.policy.assertCapability('google-maps', 'storePOIs'), /blocks storePOIs/);
  assert.throws(() => rt.policy.assertCapability('tripadvisor', 'automatedAcquisition'), /blocks automatedAcquisition/);
});

test('Engine rejects raw non-normalized connector output', async () => {
  const rt = runtime();
  rt.policy.register({ id: 'raw', mode: 'store_allowed', automatedAcquisition: true, storePOIs: true });
  rt.engine.register({ id: 'raw', version: '1.0.0', async search() { return { pois: [{ name: 'raw' }] }; } });
  await assert.rejects(() => rt.engine.search('raw'), /non-normalized POI/);
});

test('Engine processes multiple connectors through one path', async () => {
  const rt = runtime();
  for (const id of ['source-a', 'source-b']) {
    rt.policy.register({ id, mode: 'store_allowed', automatedAcquisition: true, storePOIs: true });
    rt.engine.register({ id, version: '1.0.0', async search() { return { pois: [makePOI(rt, id)] }; } });
  }
  const result = await rt.engine.searchMany(['source-a', 'source-b']);
  assert.equal(result.batches.length, 2);
  assert.equal(result.pois.length, 2);
  assert.equal(result.errors.length, 0);
});

test('Store v4 persists normalized POIs and leaves consolidation explicit', async () => {
  const shared = new Map();
  const rt = runtime(new MemoryStorage(shared));
  rt.policy.register({ id: 'permitted', mode: 'store_allowed', automatedAcquisition: true, storePOIs: true });
  rt.engine.register({ id: 'permitted', version: '1.0.0', async search() { return { pois: [makePOI(rt, 'permitted')] }; } });
  await rt.engine.searchAndStore('permitted');
  rt.store.flush();
  assert.equal(rt.store.storageKey, 'wander.poi.store.v4');
  assert.equal(rt.store.listNormalized().length, 1);
  assert.equal(rt.store.listConsolidated().length, 0);
  assert.equal(runtime(new MemoryStorage(shared)).store.listNormalized().length, 1);
});

test('Legacy Store v3 is not migrated into Store v4', () => {
  const shared = new Map();
  shared.set('wander.poi.store.v3', JSON.stringify({ schemaVersion: 3, normalized: { old: { id: 'old' } }, consolidated: {} }));
  const rt = runtime(new MemoryStorage(shared));
  assert.equal(rt.store.listNormalized().length, 0);
  assert.equal(rt.store.listConsolidated().length, 0);
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
console.log(`\n${passed}/${tests.length} unified POI engine tests passed`);
