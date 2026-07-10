import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AT = '2026-07-10T12:00:00.000Z';

class MemoryStorage {
  constructor(shared = new Map()) { this.shared = shared; }
  getItem(key) { return this.shared.has(String(key)) ? this.shared.get(String(key)) : null; }
  setItem(key, value) { this.shared.set(String(key), String(value)); }
  removeItem(key) { this.shared.delete(String(key)); }
}

function load(context, filename) {
  const source = fs.readFileSync(path.join(ROOT, filename), 'utf8');
  new vm.Script(source, { filename }).runInContext(context);
}

function createRuntime({ wikidataFails = false } = {}) {
  const sandbox = {
    console,
    Date,
    Math,
    URL,
    localStorage: new MemoryStorage(),
    setTimeout,
    clearTimeout,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);

  [
    'runtime-context-store.js',
    'runtime-context-location.js',
    'runtime-source-policy.js',
    'runtime-poi-normalized.js',
    'runtime-poi-consolidated.js',
    'runtime-poi-store.js',
    'runtime-poi-engine.js',
  ].forEach((file) => load(context, file));

  const normalized = context.WanderNormalizedPOI;
  const engine = context.WanderPOIEngine;

  engine.register({
    id: 'openstreetmap',
    version: 'test-osm',
    async search(request) {
      return {
        pois: [
          normalized.create({
            name: 'Fortaleza de Prueba',
            categories: [{ id: 'osm:historic=fort', label: 'historic=fort' }],
            identifiers: [
              { namespace: 'openstreetmap', value: 'way/100' },
              { namespace: 'wikidata', value: 'Q100' },
            ],
            location: { lat: request.lat + 0.001, lng: request.lng, method: 'osm_geometry_center' },
            source: { id: 'openstreetmap', version: 'test-osm', ref: 'way/100' },
            confidence: 0.9,
            observedAt: AT,
            notes: [{ text: 'Lugar histórico.', kind: 'source_note', confidence: 0.8 }],
          }, AT),
          normalized.create({
            name: 'Farmacia de Prueba',
            categories: [{ id: 'osm:amenity=pharmacy', label: 'amenity=pharmacy' }],
            identifiers: [{ namespace: 'openstreetmap', value: 'node/200' }],
            location: { lat: request.lat + 0.006, lng: request.lng, method: 'osm_node' },
            source: { id: 'openstreetmap', version: 'test-osm', ref: 'node/200' },
            confidence: 0.95,
            observedAt: AT,
          }, AT),
        ],
        diagnostics: { source: 'osm-mock' },
      };
    },
  });

  engine.register({
    id: 'wikidata',
    version: 'test-wd',
    async search(request) {
      if (wikidataFails) throw Object.assign(new Error('wikidata unavailable'), { code: 'TEST_FAILURE' });
      return {
        pois: [
          normalized.create({
            name: 'Fortaleza de Prueba',
            categories: [{ id: 'wikidata:Q200', label: 'fortification' }],
            identifiers: [{ namespace: 'wikidata', value: 'Q100' }],
            location: { lat: request.lat + 0.00105, lng: request.lng, method: 'wikidata_p625' },
            source: { id: 'wikidata', version: 'test-wd', ref: 'Q100' },
            confidence: 0.97,
            observedAt: AT,
          }, AT),
        ],
        diagnostics: { source: 'wikidata-mock' },
      };
    },
  });

  load(context, 'runtime-provider-nearby.js');
  return context;
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('NearbyProvider adapts search plan to mobility', () => {
  const rt = createRuntime();
  const nearby = rt.WanderProviders.nearby;
  assert.equal(nearby.planFor({ speedKmh: 4, mobilityMode: 'walking' }).radiusM, 1800);
  assert.equal(nearby.planFor({ speedKmh: 45, mobilityMode: 'car' }).radiusM, 8000);
  assert.equal(nearby.planFor({ speedKmh: 90, mobilityMode: 'unknown' }).radiusM, 15000);
});

test('NearbyProvider searches, consolidates, ranks, and writes context', async () => {
  const rt = createRuntime();
  rt.WanderContext.setLocationOverride({ lat: 19.89, lng: -70.96, speedMps: 0, updatedAt: Date.now() });
  const result = await rt.WanderProviders.nearby.refresh(true);

  assert.ok(result);
  assert.equal(result.status, 'available');
  assert.equal(result.diagnostics.normalizedCount, 3);
  assert.equal(result.diagnostics.consolidatedCount, 2);
  assert.equal(result.diagnostics.mergedGroupCount, 1);
  assert.equal(result.items.length, 2);

  const fort = result.items.find((item) => item.name === 'Fortaleza de Prueba');
  assert.ok(fort);
  assert.equal(fort.sources.length, 2);
  assert.equal(fort.memberIds.length, 2);
  assert.equal(fort.notes.length, 1);
  assert.ok(Number.isFinite(fort.distanceM));
  assert.ok(Number.isFinite(fort.bearingDeg));

  assert.equal(rt.WanderContext.value('nearby.status'), 'available');
  assert.equal(rt.WanderContext.value('nearby.items').length, 2);
  assert.equal(rt.WanderContext.value('nearby.current').diagnostics.mergedGroupCount, 1);
});

test('NearbyProvider preserves successful source when another fails', async () => {
  const rt = createRuntime({ wikidataFails: true });
  rt.WanderContext.setLocationOverride({ lat: 18.48, lng: -69.9, speedMps: 0, updatedAt: Date.now() });
  const result = await rt.WanderProviders.nearby.refresh(true);

  assert.ok(result);
  assert.equal(result.status, 'available_partial');
  assert.deepEqual(Array.from(result.diagnostics.successfulSources), ['openstreetmap']);
  assert.equal(result.diagnostics.errors.length, 1);
  assert.equal(result.items.length, 2);
  assert.equal(rt.WanderContext.value('nearby.status'), 'available_partial');
});

test('NearbyProvider skips insignificant movement until threshold or age', async () => {
  const rt = createRuntime();
  rt.WanderContext.setLocationOverride({ lat: 19.89, lng: -70.96, speedMps: 0, updatedAt: Date.now() });
  await rt.WanderProviders.nearby.refresh(true);

  const location = { lat: 19.8901, lng: -70.96, speedKmh: 0, mobilityMode: 'unknown' };
  assert.equal(rt.WanderProviders.nearby.shouldSearch(location, false), false);
  assert.equal(rt.WanderProviders.nearby.shouldSearch(location, true), true);
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
console.log(`\n${passed}/${tests.length} NearbyProvider tests passed`);
