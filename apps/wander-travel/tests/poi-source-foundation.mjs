import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(TEST_DIR, '..');
const FIXTURE_PATH = path.join(TEST_DIR, 'fixtures', 'poi', 'tripadvisor-luperon.json');

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
    'runtime-poi-connector-tripadvisor.js',
  ].forEach((filename) => loadRuntimeFile(context, filename));

  return {
    storage,
    candidate: context.WanderPOICandidate,
    evidence: context.WanderPOIEvidence,
    store: context.WanderPOIStore,
    connectors: context.WanderPOIConnectors,
    tripadvisor: context.WanderPOIConnectorTripadvisor,
  };
}

const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const observedAt = '2026-07-08T12:00:00.000Z';

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test('Tripadvisor fixture discovers exactly five unresolved Luperon candidates', async () => {
  const runtime = createRuntime();
  const result = await runtime.connectors.discoverAndStore('tripadvisor', {
    sourceUrl: fixture.source.sourceUrl,
    destination: fixture.destination,
    section: fixture.listing.section,
    items: fixture.listing.items,
    observedAt,
  });

  assert.equal(result.candidates.length, 5);
  assert.deepEqual(
    Array.from(result.candidates, (candidate) => candidate.name),
    fixture.listing.items.map((item) => item.name),
  );
  assert.equal(result.candidates.every((candidate) => candidate.status === 'unresolved'), true);
  assert.equal(runtime.store.listCandidates({ connector: 'tripadvisor' }).length, 5);
  assert.equal(runtime.store.listEvidence().filter((item) => item.type === 'source_listing_presence').length, 5);
});

test('Tripadvisor discovery keeps listing metadata, provenance, and detail links', async () => {
  const runtime = createRuntime();
  const result = await runtime.connectors.discover('tripadvisor', {
    sourceUrl: fixture.source.sourceUrl,
    destination: fixture.destination,
    section: fixture.listing.section,
    items: fixture.listing.items,
    observedAt,
  });

  const fricolandia = result.candidates.find((candidate) => candidate.name.startsWith('FricoLandia'));
  assert.ok(fricolandia);
  assert.equal(fricolandia.source.connector, 'tripadvisor');
  assert.equal(fricolandia.source.connectorVersion, '0.2.0');
  assert.equal(fricolandia.source.strategy, 'destination-listing');
  assert.equal(fricolandia.source.sourceUrl, fixture.source.sourceUrl);

  const detailEvidence = result.evidence.find(
    (item) => item.candidateId === fricolandia.id && item.type === 'source_detail_url',
  );
  assert.ok(detailEvidence);
  assert.equal(detailEvidence.confidence, 1);

  const thePatio = result.candidates.find((candidate) => candidate.name === 'The Patio');
  const listingEvidence = result.evidence.find(
    (item) => item.candidateId === thePatio.id && item.type === 'source_listing_presence',
  );
  assert.equal(listingEvidence.value.rating, 4.3);
  assert.equal(listingEvidence.value.reviewCount, 3);
  assert.equal(listingEvidence.value.priceHint, '$');
  assert.deepEqual(Array.from(listingEvidence.value.categoryHints), ['Estadounidense', 'Bar', 'Pub']);
});

test('POI store persists candidates and evidence across reopen', async () => {
  const shared = new Map();
  const first = createRuntime(new MemoryStorage(shared));
  await first.connectors.discoverAndStore('tripadvisor', {
    sourceUrl: fixture.source.sourceUrl,
    destination: fixture.destination,
    section: fixture.listing.section,
    items: fixture.listing.items,
    observedAt,
  });
  first.store.flush();

  const reopened = createRuntime(new MemoryStorage(shared));
  assert.equal(reopened.store.listCandidates().length, 5);
  assert.equal(reopened.store.listEvidence().length, 10);
  assert.deepEqual(Object.keys(reopened.store.snapshot().consolidated), []);
  assert.equal('canonical' in reopened.store.snapshot(), false);
});

test('Google Maps URL parser separates entity coordinates from viewport center', () => {
  const runtime = createRuntime();
  const parsed = runtime.tripadvisor.parseGoogleMapsUrl(
    'https://www.google.com/maps/place/Example/@19.8924784,-70.9618092,16z/data=!3m1!4b1!8m2!3d19.8935957!4d-70.9613064',
  );

  assert.deepEqual(
    { ...parsed.entityLocation },
    { lat: 19.8935957, lng: -70.9613064 },
  );
  assert.equal(parsed.destinationLocation, null);
  assert.deepEqual(
    { ...parsed.viewport },
    { lat: 19.8924784, lng: -70.9618092, zoom: 16 },
  );
});

test('Tripadvisor daddr map link resolves destination coordinates, not viewport', () => {
  const runtime = createRuntime();
  const detail = fixture.detailResearch.find((item) => item.name.startsWith('FricoLandia'));
  const parsed = runtime.tripadvisor.parseGoogleMapsUrl(detail.mapUrl);

  assert.equal(parsed.entityLocation, null);
  assert.deepEqual(
    { ...parsed.destinationLocation },
    { lat: 19.916283, lng: -71.06353 },
  );
  assert.equal(parsed.viewport, null);
});

test('Location extraction preserves address and emits high-confidence daddr destination evidence', async () => {
  const runtime = createRuntime();
  const discovery = await runtime.connectors.discoverAndStore('tripadvisor', {
    sourceUrl: fixture.source.sourceUrl,
    destination: fixture.destination,
    section: fixture.listing.section,
    items: fixture.listing.items,
    observedAt,
  });
  const candidate = discovery.candidates.find((item) => item.name.startsWith('FricoLandia'));
  const detail = fixture.detailResearch.find((item) => item.name.startsWith('FricoLandia'));

  const extracted = runtime.tripadvisor.extractLocationEvidence({
    candidateId: candidate.id,
    sourceUrl: detail.detailUrl,
    address: detail.visibleAddress,
    mapUrl: detail.mapUrl,
    observedAt,
  });

  assert.deepEqual(
    Array.from(extracted, (item) => item.type),
    ['visible_address', 'map_link_destination_coordinates'],
  );
  const coordinateEvidence = extracted[1];
  assert.equal(coordinateEvidence.location.lat, 19.916283);
  assert.equal(coordinateEvidence.location.lng, -71.06353);
  assert.equal(coordinateEvidence.confidence, 0.96);
});

test('Connector exposes source-specific research instructions without making them consolidated truth', () => {
  const runtime = createRuntime();
  assert.equal(runtime.tripadvisor.experimental, true);
  assert.equal(runtime.tripadvisor.research.observedCandidateCount, 5);
  assert.equal(runtime.tripadvisor.research.observedDetailCount, 1);
  assert.equal(runtime.tripadvisor.research.fixturePath, 'tests/fixtures/poi/tripadvisor-luperon.json');
  assert.equal(runtime.tripadvisor.sourceInstructions.discovery[0].strategy, 'destination-listing');
  assert.equal(runtime.tripadvisor.sourceInstructions.notes.includes('Discovery output is a POI candidate, not a consolidated POI.'), true);
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

console.log(`\n${passed}/${tests.length} POI source foundation tests passed`);
if (failures.length) process.exitCode = 1;
