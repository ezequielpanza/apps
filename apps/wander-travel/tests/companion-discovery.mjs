import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function load(files) {
  const sandbox = { window: {}, Date };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  for (const file of files) {
    new vm.Script(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file }).runInContext(context);
  }
  return sandbox;
}

function situation(overrides = {}) {
  return {
    locationAvailable: true,
    speedKmh: 4,
    heading: 0,
    motion: { status: 'moving' },
    mobility: { mode: 'walking' },
    ...overrides,
  };
}

function monument(overrides = {}) {
  return {
    id: 'poi:fortaleza-ozama',
    name: 'Fortaleza Ozama',
    location: { lat: 18.472, lng: -69.884 },
    distanceM: 90,
    bearingDeg: 20,
    relevanceScore: 0.88,
    categories: [{ id: 'historic-fort', label: 'Fortaleza histórica' }],
    notes: [{ text: 'Su construcción comenzó a principios del siglo XVI.', confidence: 0.95 }],
    sources: [{ id: 'wikidata' }],
    ...overrides,
  };
}

const runtime = load([
  'runtime-engine-discovery.js',
  'runtime-engine-relevance.js',
  'runtime-engine-decision.js',
  'runtime-companion-policy.js',
]);

{
  const discovery = runtime.WanderEngineDiscovery.evaluate({ situation: situation(), items: [monument()] });
  assert.equal(discovery.candidate.id, 'poi:fortaleza-ozama');
  assert.equal(discovery.candidate.direction, 'ahead');

  const relevance = runtime.WanderEngineRelevance.evaluate({ situation: situation(), discovery });
  const action = runtime.WanderEngineDecision.decideAction({ situation: situation(), relevance });
  assert.equal(action.type, 'discover_poi');
  assert.equal(action.contentMode, 'grounded_fact');

  const intervention = runtime.WanderCompanionPolicy.decide({ evaluation: action, at: Date.now() });
  assert.equal(intervention.disposition, 'present');
  assert.match(intervention.intervention.message, /90 metros/);
  assert.match(intervention.intervention.message, /más adelante/);
  assert.match(intervention.intervention.message, /siglo XVI/);
  assert.equal(intervention.intervention.action.label, 'Llévame');
  console.log('PASS a nearby landmark becomes a grounded human-direction discovery');
}

{
  const discovery = runtime.WanderEngineDiscovery.evaluate({
    situation: situation(),
    items: [monument()],
    hasToldContent: () => true,
  });
  assert.equal(discovery.candidate, null);
  console.log('PASS previously told POI content is not selected again');
}

{
  const discovery = runtime.WanderEngineDiscovery.evaluate({
    situation: situation({ speedKmh: 24 }),
    items: [monument()],
  });
  assert.equal(discovery.candidate, null);
  assert.equal(discovery.reason, 'traveler_moving_fast');
  console.log('PASS discovery remains silent during fast movement');
}

{
  const discovery = runtime.WanderEngineDiscovery.evaluate({
    situation: situation(),
    items: [monument({ bearingDeg: 190 })],
  });
  assert.equal(discovery.candidate, null);
  console.log('PASS a POI already behind the walking traveler is ignored');
}

{
  const discovery = runtime.WanderEngineDiscovery.evaluate({
    situation: situation(),
    items: [monument({
      id: 'poi:atm',
      name: 'Cajero automático',
      categories: [{ id: 'atm', label: 'ATM' }],
      notes: [],
    })],
  });
  assert.equal(discovery.candidate, null);
  console.log('PASS generic utilities do not create unsolicited discoveries');
}

console.log('\n5/5 companion discovery tests passed');
