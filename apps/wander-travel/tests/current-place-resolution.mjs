import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { onRequestGet as nearbyPlaces } from '../functions/api/places/nearby.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POINT = { lat: 18.5054125, lng: -68.381328125 };

function load(context, filename) {
  new vm.Script(fs.readFileSync(path.join(ROOT, filename), 'utf8'), { filename }).runInContext(context);
}

function memoryContext(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    value(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
    set(key, value) { values.set(key, value); return value; },
    remove(key) { values.delete(key); },
    subscribe() { return () => {}; },
    getEffectiveLocation() { return values.get('location.effective') || null; },
  };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('Google endpoint performs a dedicated container search', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.includedTypes) {
      return Response.json({ places: [{
        id: 'fishing-lodge',
        displayName: { text: 'Fishing Lodge Cap Cana', languageCode: 'es' },
        primaryType: 'apartment_complex',
        types: ['apartment_complex', 'lodging'],
        location: { latitude: 18.5051, longitude: -68.3818 },
        viewport: { low: { latitude: 18.503, longitude: -68.384 }, high: { latitude: 18.507, longitude: -68.379 } },
      }] });
    }
    return Response.json({ places: [{
      id: 'nearby-cafe',
      displayName: { text: 'Café cercano', languageCode: 'es' },
      primaryType: 'cafe',
      types: ['cafe'],
      location: { latitude: 18.5055, longitude: -68.3812 },
    }] });
  };
  try {
    const request = new Request(`https://wander.test/api/places/nearby?lat=${POINT.lat}&lng=${POINT.lng}&radius=3000`);
    const response = await nearbyPlaces({ request, env: { GOOGLE_MAPS_API_KEY: 'test' } });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls.length, 2);
    assert.ok(calls[1].includedTypes.includes('apartment_complex'));
    assert.ok(calls[1].includedTypes.includes('resort_hotel'));
    assert.equal(payload.diagnostics.containerCount, 1);
    assert.ok(payload.places.some((place) => place.id === 'fishing-lodge'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Google resolver recognizes a lodging complex even when it is outside nearby.items', () => {
  const wanderContext = memoryContext({ 'location.effective': { ...POINT, accuracy: 12, source: 'gps' }, 'nearby.items': [] });
  const member = {
    id: 'google-member',
    source: { id: 'google-places' },
    name: 'Fishing Lodge Cap Cana',
    tags: { primaryType: 'apartment_complex', types: ['apartment_complex', 'lodging'] },
    location: { lat: 18.5051, lng: -68.3818 },
    attributes: { viewport: { south: 18.503, west: -68.384, north: 18.507, east: -68.379 } },
  };
  const item = { id: 'fishing-lodge', name: member.name, location: member.location, memberIds: [member.id] };
  const sandbox = {
    console, Date, Math, queueMicrotask,
    WanderContext: wanderContext,
    WanderPOIStore: {
      getNormalized(id) { return id === member.id ? member : null; },
      listConsolidated() { return [item]; },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  load(vm.createContext(sandbox), 'runtime-provider-container-google.js');
  assert.equal(wanderContext.value('container.current').name, 'Fishing Lodge Cap Cana');
  assert.equal(wanderContext.value('container.current').primaryType, 'apartment_complex');
  assert.equal(wanderContext.value('container.googleDiagnostics').eligibleCandidates, 1);
});

test('Empty OSM result preserves an existing Google container', async () => {
  const googleContainer = { id: 'fishing-lodge', name: 'Fishing Lodge Cap Cana', source: 'google-places' };
  const wanderContext = memoryContext({
    'location.effective': { ...POINT, accuracy: 12, source: 'gps' },
    'container.current': googleContainer,
    'container.status': 'inside',
  });
  const sandbox = {
    console, Date, Math, setTimeout, clearTimeout,
    fetch: async () => Response.json({ ok: true, count: 0, current: null, source: { id: 'openstreetmap' } }),
    WanderContext: wanderContext,
    WanderPlatform: { apiUrl: (value) => value },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  load(vm.createContext(sandbox), 'runtime-provider-container.js');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(wanderContext.value('container.current'), googleContainer);
  assert.equal(wanderContext.value('container.status'), 'inside');
  assert.equal(wanderContext.value('container.osmDiagnostics').preservedSource, 'google-places');
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
console.log(`\n${passed}/${tests.length} current-place resolution tests passed`);
