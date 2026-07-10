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

function runtime(bindings, storage = new MemoryStorage()) {
  let timer = 0;
  const fetchCalls = [];
  const sandbox = {
    console, Date, Math, URL, localStorage: storage,
    setTimeout: () => ++timer,
    clearTimeout: () => {},
    fetch: async (url, options) => {
      fetchCalls.push({ url: String(url), options });
      return { ok: true, status: 200, async json() { return { results: { bindings } }; } };
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
  ].forEach((file) => load(context, file));
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

const AT = '2026-07-09T12:00:00.000Z';
const tests = [];
const test = (name, run) => tests.push({ name, run });

test('Wikidata registers as normalized connector v0.3.0', () => {
  const rt = runtime(bindings);
  assert.equal(rt.policy.get('wikidata').storePOIs, true);
  assert.equal(rt.engine.getConnector('wikidata')?.version, '0.3.0');
});

test('Nearby query preserves center radius language and limit', () => {
  const rt = runtime(bindings);
  const query = rt.wikidata.buildNearbyQuery({ lat: 19.89, lng: -70.96, radiusKm: 12, limit: 50, language: 'es,en' });
  assert.match(query, /Point\(-70\.96 19\.89\)/);
  assert.match(query, /wikibase:radius "12"/);
  assert.match(query, /wikibase:language "es,en"/);
  assert.match(query, /LIMIT 50/);
});

test('Binding aggregation deduplicates QID and preserves P31 types', () => {
  const rt = runtime(bindings);
  const entities = rt.wikidata.aggregateBindings(bindings);
  assert.equal(entities.length, 2);
  const historical = entities.find((item) => item.qid === 'Q100');
  assert.equal(historical.instances.length, 2);
});

test('Search returns NormalizedPOI with Wikidata identifier', async () => {
  const rt = runtime(bindings);
  const result = await rt.engine.search('wikidata', {
    lat: 19.89, lng: -70.96, radiusKm: 10, limit: 100, language: 'es,en', observedAt: AT,
  });
  assert.equal(result.pois.length, 2);
  assert.equal(result.pois.every(rt.normalized.isNormalizedPOI), true);
  const historical = result.pois.find((poi) => poi.source.ref === 'Q100');
  assert.equal(historical.source.version, '0.3.0');
  assert.equal(historical.location.method, 'wikidata_p625');
  assert.equal(historical.identifiers.some((item) => item.namespace === 'wikidata' && item.value === 'Q100'), true);
  assert.equal(historical.categories.length, 2);
  assert.equal(historical.notes.length, 0);
});

test('Engine stores Wikidata POIs without source-specific storage logic', async () => {
  const rt = runtime(bindings);
  await rt.engine.searchAndStore('wikidata', { lat: 19.89, lng: -70.96, radiusKm: 5, observedAt: AT });
  assert.equal(rt.store.listNormalized({ sourceId: 'wikidata' }).length, 2);
});

test('Connector uses Wikidata query endpoint with JSON format', async () => {
  const rt = runtime(bindings);
  await rt.wikidata.search({ lat: 19.89, lng: -70.96, radiusKm: 5, limit: 20 });
  const url = new URL(rt.fetchCalls[0].url);
  assert.equal(url.origin, 'https://query.wikidata.org');
  assert.equal(url.pathname, '/sparql');
  assert.equal(url.searchParams.get('format'), 'json');
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
console.log(`\n${passed}/${tests.length} Wikidata connector tests passed`);
