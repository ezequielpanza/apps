import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(TEST_DIR, '..');
const FIXTURE_PATH = path.join(TEST_DIR, 'fixtures', 'poi', 'google-maps-luperon.json');

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

function createRuntime(storage = new MemoryStorage()) {
  let timerId = 0;
  const sandbox = {
    console,
    Date,
    Math,
    localStorage: storage,
    setTimeout: () => ++timerId,
    clearTimeout: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  [
    'runtime-poi-candidate.js',
    'runtime-poi-evidence.js',
    'runtime-poi-store.js',
    'runtime-poi-connectors.js',
    'runtime-poi-connector-google-maps.js',
  ].forEach((filename) => loadRuntimeFile(context, filename));

  return {
    store: context.WanderPOIStore,
    connectors: context.WanderPOIConnectors,
    googleMaps: context.WanderPOIConnectorGoogleMaps,
  };
}

const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const observedAt = '2026-07-09T12:00:00.000Z';
const tests = [];

function test(name, run) {
  tests.push({ name, run });
}

test('Google Maps exposes exactly the six observed Luperon query profiles', () => {
  const runtime = createRuntime();
  assert.deepEqual(
    Object.keys(runtime.googleMaps.queryProfiles),
    fixture.queryProfiles.map((profile) => profile.key),
  );

  fixture.queryProfiles.forEach((profile) => {
    assert.equal(runtime.googleMaps.buildQuery(profile.key, fixture.destination.name), profile.query);
  });
});

test('Search URL builder preserves the semantic query without requiring result assumptions', () => {
  const runtime = createRuntime();
  const url = runtime.googleMaps.buildSearchUrl('attractions', fixture.destination.name);
  assert.equal(
    url,
    'https://www.google.com/maps/search/?api=1&query=Luper%C3%B3n%20que%20hacer',
  );
});

test('Luperon place URL separates entity coordinates from viewport and preserves source IDs', () => {
  const runtime = createRuntime();
  const parsed = runtime.googleMaps.parseMapsUrl(fixture.destination.placeUrl);

  assert.deepEqual(
    { ...parsed.entityLocation },
    fixture.destination.expectedUrlEvidence.entityLocation,
  );
  assert.deepEqual(
    { ...parsed.viewport },
    fixture.destination.expectedUrlEvidence.viewport,
  );
  assert.deepEqual(
    Array.from(parsed.sourceEntityIds, (item) => item.value),
    fixture.destination.expectedUrlEvidence.sourceEntityIds,
  );
  assert.equal(parsed.placeSlug, '57000 Luperón');
});

test('Observed search URL preserves viewport and semantic search text separately', () => {
  const runtime = createRuntime();
  const parsed = runtime.googleMaps.parseMapsUrl(fixture.observedSearchExample.sourceUrl);

  assert.deepEqual(
    { ...parsed.viewport },
    fixture.observedSearchExample.expectedUrlEvidence.viewport,
  );
  assert.equal(parsed.searchQuery, fixture.observedSearchExample.expectedUrlEvidence.searchQuery);
  assert.equal(parsed.entityLocation, null);
});

test('Discovery preserves query provenance, place URL identity, and entity coordinates', async () => {
  const runtime = createRuntime();
  const result = await runtime.connectors.discoverAndStore('google-maps', {
    destination: fixture.destination,
    profileKey: 'attractions',
    sourceUrl: fixture.observedSearchExample.sourceUrl,
    observedAt,
    items: [
      {
        position: 1,
        name: '57000 Luperón',
        typeHint: 'locality',
        address: 'Luperón 57000, República Dominicana',
        placeUrl: fixture.destination.placeUrl,
      },
    ],
  });

  assert.equal(result.candidates.length, 1);
  const candidate = result.candidates[0];
  assert.equal(candidate.metadata.profileKey, 'attractions');
  assert.equal(candidate.metadata.query, 'Luperón que hacer');
  assert.equal(candidate.source.connector, 'google-maps');
  assert.equal(candidate.source.connectorVersion, '0.1.0');

  const evidence = runtime.store.listEvidence(candidate.id);
  assert.equal(evidence.some((item) => item.type === 'source_search_presence'), true);
  assert.equal(evidence.some((item) => item.type === 'visible_address'), true);
  assert.equal(evidence.some((item) => item.type === 'source_place_url'), true);
  assert.equal(evidence.filter((item) => item.type === 'source_entity_id').length, 2);

  const location = evidence.find((item) => item.type === 'place_url_entity_coordinates');
  assert.ok(location);
  assert.equal(location.location.lat, 19.8935957);
  assert.equal(location.location.lng, -70.9613064);
  assert.equal(location.confidence, 0.98);
});

test('A semantic query with no observed result cards creates no candidates', async () => {
  const runtime = createRuntime();
  const result = await runtime.connectors.discover('google-maps', {
    destination: fixture.destination,
    profileKey: 'museums',
    observedAt,
    items: [],
  });

  assert.equal(result.candidates.length, 0);
  assert.equal(result.evidence.length, 0);
  assert.equal(result.diagnostics.query, 'Luperón museos');
});

test('Live research not_observed status never means an empty Google Maps result set', () => {
  assert.equal(fixture.liveResearchAttempt.status, 'not_observed');
  assert.equal(fixture.liveResearchAttempt.resultCandidatesCaptured, 0);
  assert.match(
    fixture.liveResearchAttempt.interpretation,
    /does not mean the six Google Maps searches return no places/i,
  );
  assert.equal(
    fixture.researchNotes.includes('A not_observed live-access result is not equivalent to an empty Google Maps result set.'),
    true,
  );
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

console.log(`\n${passed}/${tests.length} Google Maps connector tests passed`);
if (failures.length) process.exitCode = 1;
