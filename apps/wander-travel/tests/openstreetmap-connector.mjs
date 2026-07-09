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

function createRuntime(elements, storage = new MemoryStorage()) {
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
          return { elements };
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
    'runtime-poi-connector-openstreetmap.js',
  ].forEach((filename) => loadRuntimeFile(context, filename));

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
    type: 'node',
    id: 1001,
    lat: 19.9,
    lon: -70.95,
    tags: {
      name: 'Restaurante Ejemplo',
      amenity: 'restaurant',
      cuisine: 'caribbean',
      'addr:city': 'Luperón',
    },
  },
  {
    type: 'way',
    id: 2002,
    center: { lat: 19.91, lon: -70.96 },
    tags: {
      name: 'Museo Ejemplo',
      tourism: 'museum',
    },
  },
  {
    type: 'relation',
    id: 3003,
    center: { lat: 19.92, lon: -70.97 },
    tags: {
      leisure: 'marina',
      operator: 'Marina sin nombre',
    },
  },
];

const observedAt = '2026-07-09T12:00:00.000Z';
const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test('OpenStreetMap registers as a normalized POI connector', () => {
  const runtime = createRuntime(elements);
  const sourcePolicy = runtime.policy.get('openstreetmap');
  assert.equal(sourcePolicy.mode, 'store_allowed');
  assert.equal(sourcePolicy.automatedAcquisition, true);
  assert.equal(sourcePolicy.storePOIs, true);
  assert.equal(runtime.engine.getConnector('openstreetmap')?.id, 'openstreetmap');
  assert.equal(runtime.engine.getConnector('openstreetmap')?.version, '0.1.0');
});

test('OpenStreetMap profiles build source-specific Overpass queries', () => {
  const runtime = createRuntime(elements);

  const food = runtime.osm.buildQuery({
    lat: 19.89,
    lng: -70.96,
    radiusM: 3000,
    profile: 'food',
  });
  assert.match(food, /amenity/);
  assert.match(food, /restaurant\|cafe\|fast_food/);
  assert.match(food, /around:3000,19\.89,-70\.96/);
  assert.match(food, /out center tags/);

  const nautical = runtime.osm.buildQuery({
    lat: 19.89,
    lng: -70.96,
    profile: 'nautical',
  });
  assert.match(nautical, /leisure"="marina/);
  assert.match(nautical, /seamark:type/);
});

test('Node, way, and relation locations normalize differently but share one POI contract', async () => {
  const runtime = createRuntime(elements);
  const result = await runtime.engine.search('openstreetmap', {
    lat: 19.89,
    lng: -70.96,
    radiusM: 5000,
    profile: 'discovery',
    observedAt,
  });

  assert.equal(result.pois.length, 3);
  assert.equal(result.pois.every(runtime.normalized.isNormalizedPOI), true);

  const node = result.pois.find((poi) => poi.source.ref === 'node/1001');
  assert.ok(node);
  assert.equal(node.location.method, 'osm_node');
  assert.equal(node.location.geometryType, 'point');
  assert.equal(node.location.lat, 19.9);
  assert.equal(node.location.lng, -70.95);
  assert.equal(node.categories[0].id, 'osm:amenity=restaurant');
  assert.equal(node.address.locality, 'Luperón');
  assert.equal(node.tags.cuisine, 'caribbean');

  const way = result.pois.find((poi) => poi.source.ref === 'way/2002');
  assert.ok(way);
  assert.equal(way.location.method, 'osm_geometry_center');
  assert.equal(way.location.geometryType, 'way');
  assert.equal(way.categories[0].id, 'osm:tourism=museum');

  const relation = result.pois.find((poi) => poi.source.ref === 'relation/3003');
  assert.ok(relation);
  assert.equal(relation.name, 'Marina sin nombre');
  assert.equal(relation.location.method, 'osm_geometry_center');
  assert.equal(relation.location.geometryType, 'relation');
  assert.equal(relation.categories[0].id, 'osm:leisure=marina');
});

test('OSM normalization preserves source identity, tags, and coordinate evidence', async () => {
  const runtime = createRuntime(elements);
  const result = await runtime.engine.search('openstreetmap', {
    lat: 19.89,
    lng: -70.96,
    profile: 'discovery',
    observedAt,
  });

  const poi = result.pois[0];
  assert.equal(poi.source.id, 'openstreetmap');
  assert.equal(poi.source.version, '0.1.0');
  assert.equal(poi.source.url, 'https://www.openstreetmap.org/node/1001');
  assert.equal(poi.evidence.some((item) => item.type === 'source_entity_id'), true);
  assert.equal(poi.evidence.some((item) => item.type === 'osm_tags'), true);
  assert.equal(poi.evidence.some((item) => item.type === 'entity_coordinates'), true);
});

test('Engine stores OSM POIs without OSM-specific storage branches', async () => {
  const runtime = createRuntime(elements);
  await runtime.engine.searchAndStore('openstreetmap', {
    lat: 19.89,
    lng: -70.96,
    profile: 'discovery',
    observedAt,
  });

  assert.equal(runtime.store.listNormalized({ sourceId: 'openstreetmap' }).length, 3);
  assert.equal(runtime.store.listNormalized()[0].source.id, 'openstreetmap');
});

test('OSM connector posts Overpass QL to its configured endpoint', async () => {
  const runtime = createRuntime(elements);
  await runtime.osm.search({
    lat: 19.89,
    lng: -70.96,
    radiusM: 1000,
    profile: 'pharmacies',
  });

  assert.equal(runtime.fetchCalls.length, 1);
  assert.equal(runtime.fetchCalls[0].url, 'https://overpass-api.de/api/interpreter');
  assert.equal(runtime.fetchCalls[0].options.method, 'POST');
  assert.match(runtime.fetchCalls[0].options.body, /^data=/);
  assert.match(decodeURIComponent(runtime.fetchCalls[0].options.body), /amenity"="pharmacy/);
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

console.log(`\n${passed}/${tests.length} OpenStreetMap normalized connector tests passed`);
if (failures.length) process.exitCode = 1;
