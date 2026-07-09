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
    'runtime-poi-candidate.js',
    'runtime-poi-evidence.js',
    'runtime-poi-store.js',
    'runtime-poi-connectors.js',
    'runtime-poi-connector-wikidata.js',
  ].forEach((filename) => loadRuntimeFile(context, filename));

  return {
    fetchCalls,
    policy: context.WanderSourcePolicy,
    store: context.WanderPOIStore,
    connectors: context.WanderPOIConnectors,
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

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test('Wikidata policy explicitly allows acquisition and POI storage', () => {
  const runtime = createRuntime(bindings);
  const policy = runtime.policy.get('wikidata');
  assert.equal(policy.mode, 'store_allowed');
  assert.equal(policy.automatedAcquisition, true);
  assert.equal(policy.storeCandidates, true);
  assert.equal(policy.storeEvidence, true);
  assert.equal(runtime.connectors.get('wikidata')?.id, 'wikidata');
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

test('Discovery creates candidates and typed evidence with provenance', async () => {
  const runtime = createRuntime(bindings);
  const result = await runtime.connectors.discoverAndStore('wikidata', {
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
    observedAt: '2026-07-09T12:00:00.000Z',
  });

  assert.equal(result.candidates.length, 2);
  assert.equal(runtime.store.listCandidates().length, 2);

  const historical = result.candidates.find((candidate) => candidate.metadata.qid === 'Q100');
  assert.ok(historical);
  assert.equal(historical.source.connector, 'wikidata');
  assert.equal(historical.source.connectorVersion, '0.1.0');
  assert.equal(historical.status, 'unresolved');

  const evidence = runtime.store.listEvidence(historical.id);
  assert.equal(evidence.some((item) => item.type === 'source_entity_id' && item.value === 'Q100'), true);
  assert.equal(evidence.filter((item) => item.type === 'source_instance_of').length, 2);

  const coordinates = evidence.find((item) => item.type === 'entity_coordinates');
  assert.ok(coordinates);
  assert.equal(coordinates.location.lat, 19.9);
  assert.equal(coordinates.location.lng, -70.95);
  assert.equal(coordinates.location.method, 'wikidata_p625');
  assert.equal(coordinates.confidence, 0.97);
});

test('Discovery uses official query endpoint and JSON result format', async () => {
  const runtime = createRuntime(bindings);
  await runtime.wikidata.discover({
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

console.log(`\n${passed}/${tests.length} Wikidata connector tests passed`);
if (failures.length) process.exitCode = 1;
