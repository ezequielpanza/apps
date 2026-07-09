import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(TEST_DIR, '..');

class MemoryStorage {
  constructor(shared = new Map()) {
    this.shared = shared;
  }

  getItem(key) {
    return this.shared.has(String(key)) ? this.shared.get(String(key)) : null;
  }

  setItem(key, value) {
    this.shared.set(String(key), String(value));
  }

  removeItem(key) {
    this.shared.delete(String(key));
  }

  clear() {
    this.shared.clear();
  }
}

function loadRuntimeFile(context, filename) {
  const source = fs.readFileSync(path.join(APP_ROOT, filename), 'utf8');
  new vm.Script(source, { filename }).runInContext(context);
}

function createRuntime(storage = new MemoryStorage()) {
  let timerId = 0;
  const sandbox = {
    console,
    Date,
    Math,
    URL,
    localStorage: storage,
    setTimeout: () => ++timerId,
    clearTimeout: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  [
    'runtime-source-policy.js',
    'runtime-poi-normalized.js',
    'runtime-poi-store.js',
    'runtime-poi-engine.js',
    'runtime-external-source-google-maps.js',
    'runtime-external-source-tripadvisor.js',
  ].forEach((filename) => loadRuntimeFile(context, filename));

  return {
    storage,
    policy: context.WanderSourcePolicy,
    normalized: context.WanderNormalizedPOI,
    store: context.WanderPOIStore,
    engine: context.WanderPOIEngine,
    googleMaps: context.WanderExternalSourceGoogleMaps,
    tripadvisor: context.WanderExternalSourceTripadvisor,
  };
}

const observedAt = '2026-07-09T12:00:00.000Z';
const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test('Normalized POI contract has one source-independent shape', () => {
  const runtime = createRuntime();
  const poi = runtime.normalized.create({
    name: 'Lugar de prueba',
    aliases: ['Test Place'],
    categories: [{ id: 'test:place', label: 'Place' }],
    location: { lat: 19.9, lng: -70.95, method: 'test_point' },
    source: {
      id: 'test-source',
      version: '1.0.0',
      ref: 'abc',
      strategy: 'test-search',
    },
    confidence: 0.9,
    observedAt,
    tags: { kind: 'test' },
    attributes: { rawId: 123 },
    evidence: [
      { type: 'source_entity_id', value: 'abc', confidence: 1 },
    ],
  }, observedAt);

  assert.equal(runtime.normalized.isNormalizedPOI(poi), true);
  assert.equal(poi.source.id, 'test-source');
  assert.equal(poi.location.method, 'test_point');
  assert.equal(poi.evidence.length, 1);
});

test('External-only sources remain outside the POI connector registry', () => {
  const runtime = createRuntime();

  for (const sourceId of ['google-maps', 'tripadvisor']) {
    const sourcePolicy = runtime.policy.get(sourceId);
    assert.equal(sourcePolicy.mode, 'external_only');
    assert.equal(sourcePolicy.automatedAcquisition, false);
    assert.equal(sourcePolicy.storePOIs, false);
  }

  assert.deepEqual(runtime.engine.listConnectors(), []);
  assert.equal(typeof runtime.googleMaps.buildExternalIntent, 'function');
  assert.equal(typeof runtime.tripadvisor.buildExternalIntent, 'function');
});

test('POI Engine rejects connectors that return raw non-normalized records', async () => {
  const runtime = createRuntime();
  runtime.policy.register({
    id: 'raw-source',
    mode: 'store_allowed',
    automatedAcquisition: true,
    storePOIs: true,
  });

  runtime.engine.register({
    id: 'raw-source',
    version: '1.0.0',
    async search() {
      return { pois: [{ name: 'raw result' }] };
    },
  });

  await assert.rejects(
    () => runtime.engine.search('raw-source', {}),
    /non-normalized POI/,
  );
});

test('POI Engine processes different connectors through the same path', async () => {
  const runtime = createRuntime();

  for (const sourceId of ['source-a', 'source-b']) {
    runtime.policy.register({
      id: sourceId,
      mode: 'store_allowed',
      automatedAcquisition: true,
      storePOIs: true,
    });

    runtime.engine.register({
      id: sourceId,
      version: '1.0.0',
      async search() {
        return {
          pois: [runtime.normalized.create({
            name: `POI ${sourceId}`,
            location: { lat: 19.9, lng: -70.95, method: `${sourceId}_point` },
            source: { id: sourceId, version: '1.0.0', ref: '1' },
            confidence: 0.9,
            observedAt,
          }, observedAt)],
          diagnostics: { sourceSpecific: sourceId },
        };
      },
    });
  }

  const result = await runtime.engine.searchMany(['source-a', 'source-b'], { any: 'request' });
  assert.equal(result.batches.length, 2);
  assert.equal(result.pois.length, 2);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(
    Array.from(result.pois, (poi) => poi.source.id).sort(),
    ['source-a', 'source-b'],
  );
});

test('POI Store v3 persists normalized POIs and embedded evidence', async () => {
  const shared = new Map();
  const runtime = createRuntime(new MemoryStorage(shared));

  runtime.policy.register({
    id: 'permitted-source',
    mode: 'store_allowed',
    automatedAcquisition: true,
    storePOIs: true,
  });

  runtime.engine.register({
    id: 'permitted-source',
    version: '1.0.0',
    async search() {
      return {
        pois: [runtime.normalized.create({
          name: 'Persisted POI',
          categories: ['test place'],
          location: { lat: 19.9, lng: -70.95, method: 'test_point' },
          source: { id: 'permitted-source', version: '1.0.0', ref: 'p1' },
          confidence: 1,
          observedAt,
          evidence: [
            { type: 'source_entity_id', value: 'p1', confidence: 1 },
          ],
        }, observedAt)],
      };
    },
  });

  await runtime.engine.searchAndStore('permitted-source', {});
  runtime.store.flush();

  assert.equal(runtime.store.storageKey, 'wander.poi.store.v3');
  assert.equal(runtime.store.listNormalized().length, 1);
  assert.equal(runtime.store.listNormalized()[0].evidence.length, 1);
  assert.deepEqual(Object.keys(runtime.store.snapshot().consolidated), []);

  const reopened = createRuntime(new MemoryStorage(shared));
  assert.equal(reopened.store.listNormalized().length, 1);
});

test('Legacy candidate/evidence stores are not migrated into normalized Store v3', () => {
  const shared = new Map();
  shared.set('wander.poi.store.v2', JSON.stringify({
    schemaVersion: 2,
    candidates: { old: { id: 'old' } },
    evidence: { old: { id: 'old' } },
    consolidated: {},
  }));

  const runtime = createRuntime(new MemoryStorage(shared));
  assert.equal(runtime.store.storageKey, 'wander.poi.store.v3');
  assert.equal(runtime.store.listNormalized().length, 0);
});

let passed = 0;
const failures = [];

for (const current of tests) {
  try {
    await current.run();
    passed += 1;
    console.log('PASS', current.name);
  } catch (error) {
    failures.push({ name: current.name, error });
    console.error('FAIL', current.name);
    console.error(error?.stack || error);
  }
}

console.log(`\n${passed}/${tests.length} unified POI engine tests passed`);
if (failures.length) process.exitCode = 1;
