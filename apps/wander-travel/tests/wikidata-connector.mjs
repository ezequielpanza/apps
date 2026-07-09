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
}

function loadRuntimeFile(context, filename) {
  const source = fs.readFileSync(path.join(APP_ROOT, filename), 'utf8');
  new vm.Script(source, { filename }).runInContext(context);
}

function createRuntime(bindings, storage = new MemoryStorage()) {
  let timerId = 0;
  const fetchCalls = [];
  const sandbox = {
    console,
    Date,
    Math,
    URL,
    localStorage: storage,
    setTimeout: () => ++timerId,
    clearTimeout: () => {},
    fetch: async (url, options) => {
      fetchCalls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        async json() {
          return { results: { bindings } };
        },
      };
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  [
    'runtime-source-policy.js',
    'runtime-poi-normalized.js',
    'runtime-poi-store.js',
    'runtime-poi-engine.js',
    'runtime-poi-connector-wikidata.js',
  ].forEach((filename) => loadRuntimeFile(context, filename));

  return {
    fetchCalls,
    policy: context.WanderSourcePolicy,
    normalized: context.WanderNormalizedPOI,
    store: context.WanderPOIStore,
    engine: context.WanderPOIEngine,
    wikidata: context.WanderPOIConnectorWikidata,
  };
}

const bindings = [
  {
    item: { value: 'http://www.wikidata.org/entity/Q100' },
    itemLabel: { value: 'Lugar histórico' },
    location: { value: 'Point(-70.95 19.90)' },
    instance: { value: 'http://www.wikidata.org/entity/Q200' },
    instanceLabel: { value: 'sitio histórico' },
  },
  {
    item: { value: 'http://www.wikidata.org/entity/Q100' },
    itemLabel: { value: 'Lugar histórico' },
    location: { value: 'Point(-70.95 19.90)' },
    instance: { value: 'http://www.wikidata.org/entity/Q201' },
    instanceLabel: { value: 'atracción turística' },
  },
  {
    item: { value: 'http://www.wikidata.org/entity/Q101' },
    itemLabel: { value: 'Playa ejemplo' },
    location: { value: 'Point(-70.97 19.88)' },
  },
];

const observedAt = '2026-07-09T12:00:00.000Z';
const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test('Wikidata registers as a normalized POI connector', () => {
  const runtime = createRuntime(bindings);
  const sourcePolicy = runtime.policy.get('wikidata');
  assert.equal(sourcePolicy.mode, 'store_allowed');
  assert.equal(sourcePolicy.automatedAcquisition, true);
  assert.equal(sourcePolicy.storePOIs, true);
  assert.equal(runtime.engine.getConnector('wikidata')?.id, 'wikidata');
  assert.equal(runtime.engine.getConnector('wikidata')?.version, '0.2.0');
});

test('Nearby query preserves center, radius, language, and bounded limit', () => {
  const runtime = createRuntime(bindings);
  const query = runtime.wikidata.buildNearbyQuery({
    lat: 19.89,
    lng: -70.96,
    radiusKm: 12,
    limit: 50,
    language: 'es,en',
  });

  assert.match(query, /Point\(-70\.96 19\.89\)/);
  assert.match(query, /wikibase:radius "12"/);
  assert.match(query, /wikibase:language "es,en"/);
  assert.match(query, /LIMIT 50/);
});

test('Binding aggregation deduplicates QIDs and preserves multiple P31 types', () => {
  const runtime = createRuntime(bindings);
  const entities = runtime.wikidata.aggregateBindings(bindings);
  assert.equal(entities.length, 2);

  const historical = entities.find((item) => item.qid === 'Q100');
  assert.ok(historical);
  assert.equal(historical.instances.length, 2);
  assert.deepEqual(
    Array.from(historical.instances, (item) => item.qid),
    ['Q200', 'Q201'],
  );
});

test('Wikidata search returns only NormalizedPOI objects', async () => {
  const runtime = createRuntime(bindings);
  const result = await runtime.engine.search('wikidata', {
    lat: 19.89,
    lng: -70.96,
    radiusKm: 10,
    limit: 100,
    language: 'es,en',
    destination: {
      id: 'test-destination',
      name: 'Destino prueba',
      countryCode: 'do',
    },
    observedAt,
  });

  assert.equal(result.pois.length, 2);
  assert.equal(result.pois.every(runtime.normalized.isNormalizedPOI), true);

  const historical = result.pois.find((poi) => poi.source.ref === 'Q100');
  assert.ok(historical);
  assert.equal(historical.source.id, 'wikidata');
  assert.equal(historical.source.version, '0.2.0');
  assert.equal(historical.location.method, 'wikidata_p625');
  assert.equal(historical.location.lat, 19.9);
  assert.equal(historical.location.lng, -70.95);
  assert.deepEqual(
    Array.from(historical.categories, (category) => category.id),
    ['wikidata:Q200', 'wikidata:Q201'],
  );
  assert.equal(historical.evidence.some((item) => item.type === 'source_entity_id' && item.value === 'Q100'), true);
  assert.equal(historical.evidence.filter((item) => item.type === 'source_instance_of').length, 2);
});

test('Engine stores Wikidata POIs without source-specific storage logic', async () => {
  const runtime = createRuntime(bindings);
  await runtime.engine.searchAndStore('wikidata', {
    lat: 19.89,
    lng: -70.96,
    radiusKm: 5,
    observedAt,
  });

  assert.equal(runtime.store.listNormalized({ sourceId: 'wikidata' }).length, 2);
  assert.equal(runtime.store.listNormalized()[0].source.id, 'wikidata');
});

test('Wikidata connector uses query endpoint and JSON result format', async () => {
  const runtime = createRuntime(bindings);
  await runtime.wikidata.search({
    lat: 19.89,
    lng: -70.96,
    radiusKm: 5,
    limit: 20,
  });

  assert.equal(runtime.fetchCalls.length, 1);
  const url = new URL(runtime.fetchCalls[0].url);
  assert.equal(url.origin, 'https://query.wikidata.org');
  assert.equal(url.pathname, '/sparql');
  assert.equal(url.searchParams.get('format'), 'json');
  assert.match(url.searchParams.get('query'), /wikibase:around/);
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

console.log(`\n${passed}/${tests.length} Wikidata normalized connector tests passed`);
if (failures.length) process.exitCode = 1;
