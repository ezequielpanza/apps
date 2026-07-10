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

function runtime(elements, storage = new MemoryStorage()) {
  let timer = 0;
  const fetchCalls = [];
  const sandbox = {
    console, Date, Math, URL, localStorage: storage,
    setTimeout: () => ++timer,
    clearTimeout: () => {},
    fetch: async (url, options) => {
      fetchCalls.push({ url: String(url), options });
      return { ok: true, status: 200, async json() { return { elements }; } };
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
    'runtime-poi-connector-openstreetmap.js',
  ].forEach((file) => load(context, file));
  return {
    fetchCalls,
    policy: context.WanderSourcePolicy,
    normalized: context.WanderNormalizedPOI,
    store: context.WanderPOIStore,
    engine: context.WanderPOIEngine,
    osm: context.WanderPOIConnectorOpenStreetMap,
  };
}

const elements = [
  {
    type: 'node', id: 1001, lat: 19.9, lon: -70.95,
    tags: {
      name: 'Restaurante Ejemplo', amenity: 'restaurant', cuisine: 'caribbean',
      'addr:city': 'Luperón', wikidata: 'Q100', description: 'Restaurante frente al mar.',
    },
  },
  {
    type: 'way', id: 2002, center: { lat: 19.91, lon: -70.96 },
    tags: { name: 'Museo Ejemplo', tourism: 'museum' },
  },
  {
    type: 'relation', id: 3003, center: { lat: 19.92, lon: -70.97 },
    tags: { leisure: 'marina', operator: 'Marina sin nombre' },
  },
];

const AT = '2026-07-09T12:00:00.000Z';
const tests = [];
const test = (name, run) => tests.push({ name, run });

test('OpenStreetMap registers as normalized connector v0.3.0', () => {
  const rt = runtime(elements);
  assert.equal(rt.policy.get('openstreetmap').storePOIs, true);
  assert.equal(rt.engine.getConnector('openstreetmap')?.version, '0.3.0');
});

test('OSM profiles build source-specific Overpass queries', () => {
  const rt = runtime(elements);
  const food = rt.osm.buildQuery({ lat: 19.89, lng: -70.96, radiusM: 3000, profile: 'food' });
  assert.match(food, /restaurant\|cafe\|fast_food/);
  assert.match(food, /around:3000,19\.89,-70\.96/);
  const nautical = rt.osm.buildQuery({ lat: 19.89, lng: -70.96, profile: 'nautical' });
  assert.match(nautical, /leisure"="marina/);
  assert.match(nautical, /seamark:type/);
});

test('Node way and relation share one NormalizedPOI contract', async () => {
  const rt = runtime(elements);
  const result = await rt.engine.search('openstreetmap', {
    lat: 19.89, lng: -70.96, radiusM: 5000, profile: 'discovery', observedAt: AT,
  });
  assert.equal(result.pois.length, 3);
  assert.equal(result.pois.every(rt.normalized.isNormalizedPOI), true);

  const node = result.pois.find((poi) => poi.source.ref === 'node/1001');
  assert.equal(node.location.method, 'osm_node');
  assert.equal(node.categories[0].id, 'osm:amenity=restaurant');
  assert.equal(node.address.locality, 'Luperón');
  assert.equal(node.identifiers.some((item) => item.namespace === 'openstreetmap' && item.value === 'node/1001'), true);
  assert.equal(node.identifiers.some((item) => item.namespace === 'wikidata' && item.value === 'Q100'), true);
  assert.equal(node.notes[0].text, 'Restaurante frente al mar.');

  const way = result.pois.find((poi) => poi.source.ref === 'way/2002');
  assert.equal(way.location.method, 'osm_geometry_center');
  assert.equal(way.location.geometryType, 'way');

  const relation = result.pois.find((poi) => poi.source.ref === 'relation/3003');
  assert.equal(relation.name, 'Marina sin nombre');
  assert.equal(relation.location.geometryType, 'relation');
});

test('OSM normalization preserves source identity tags and evidence', async () => {
  const rt = runtime(elements);
  const result = await rt.engine.search('openstreetmap', { lat: 19.89, lng: -70.96, profile: 'discovery', observedAt: AT });
  const poi = result.pois[0];
  assert.equal(poi.source.version, '0.3.0');
  assert.equal(poi.source.url, 'https://www.openstreetmap.org/node/1001');
  assert.equal(poi.tags.cuisine, 'caribbean');
  assert.equal(poi.evidence.some((item) => item.type === 'osm_tags'), true);
});

test('Engine stores OSM POIs without OSM-specific storage logic', async () => {
  const rt = runtime(elements);
  await rt.engine.searchAndStore('openstreetmap', { lat: 19.89, lng: -70.96, profile: 'discovery', observedAt: AT });
  assert.equal(rt.store.listNormalized({ sourceId: 'openstreetmap' }).length, 3);
});

test('Connector posts Overpass QL to configured endpoint', async () => {
  const rt = runtime(elements);
  await rt.osm.search({ lat: 19.89, lng: -70.96, radiusM: 1000, profile: 'pharmacies' });
  assert.equal(rt.fetchCalls[0].url, 'https://overpass-api.de/api/interpreter');
  assert.equal(rt.fetchCalls[0].options.method, 'POST');
  assert.match(decodeURIComponent(rt.fetchCalls[0].options.body), /amenity"="pharmacy/);
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
console.log(`\n${passed}/${tests.length} OpenStreetMap connector tests passed`);
