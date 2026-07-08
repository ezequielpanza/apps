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
    return this.shared.has(key) ? this.shared.get(key) : null;
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

function createClock(initialIso) {
  return {
    now: Date.parse(initialIso),
    set(isoOrMs) {
      this.now = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
      return this.now;
    },
    advance(ms) {
      this.now += ms;
      return this.now;
    },
  };
}

function createFakeDate(clock) {
  return class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [clock.now]));
    }

    static now() {
      return clock.now;
    }
  };
}

function createRuntime(initialIso, storage = new MemoryStorage()) {
  const clock = createClock(initialIso);
  let timerId = 0;
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => 0.123456789;

  const sandbox = {
    console,
    Date: createFakeDate(clock),
    Math: deterministicMath,
    localStorage: storage,
    setTimeout: () => ++timerId,
    clearTimeout: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  loadRuntimeFile(context, 'runtime-engine-place.js');
  loadRuntimeFile(context, 'runtime-engine-relevance.js');
  loadRuntimeFile(context, 'runtime-engine-decision.js');
  loadRuntimeFile(context, 'runtime-engine-journey.js');

  return {
    clock,
    storage,
    place: context.WanderEnginePlace,
    relevance: context.WanderEngineRelevance,
    decision: context.WanderEngineDecision,
    journey: context.WanderEngineJourney,
  };
}

function loadRuntimeFile(context, filename) {
  const fullPath = path.join(APP_ROOT, filename);
  const source = fs.readFileSync(fullPath, 'utf8');
  new vm.Script(source, { filename }).runInContext(context);
}

const PLACE = {
  Santiago: {
    country: 'República Dominicana',
    countryCode: 'do',
    countryId: 'country:do',
    region: 'Santiago',
    regionId: 'country:do/region:santiago',
    city: 'Santiago de los Caballeros',
    cityId: 'country:do/region:santiago/city:santiago-de-los-caballeros',
    district: 'Santiago',
    districtId: 'country:do/region:santiago/city:santiago-de-los-caballeros/district:santiago',
    neighborhood: 'Centro Histórico',
    neighborhoodId: 'country:do/region:santiago/city:santiago-de-los-caballeros/district:santiago/neighborhood:centro-historico',
    zone: 'Centro Histórico',
    zoneId: 'country:do/region:santiago/city:santiago-de-los-caballeros/district:santiago/neighborhood:centro-historico',
  },
  Navarrete: {
    country: 'República Dominicana',
    countryCode: 'do',
    countryId: 'country:do',
    region: 'Santiago',
    regionId: 'country:do/region:santiago',
    city: 'Navarrete',
    cityId: 'country:do/region:santiago/city:navarrete',
    district: 'Navarrete',
    districtId: 'country:do/region:santiago/city:navarrete/district:navarrete',
    neighborhood: 'Centro',
    neighborhoodId: 'country:do/region:santiago/city:navarrete/district:navarrete/neighborhood:centro',
    zone: 'Centro',
    zoneId: 'country:do/region:santiago/city:navarrete/district:navarrete/neighborhood:centro',
  },
};

function markCountryKnown(runtime) {
  runtime.place.setPlaceFamiliarity({
    placeId: 'country:do',
    level: 'country',
    name: 'República Dominicana',
    known: true,
  }, runtime.clock.now);
}

function stationarySituation() {
  return {
    locationAvailable: true,
    motion: { status: 'stationary' },
  };
}

function evaluatePlace(runtime, place) {
  const placeResult = runtime.place.update({
    place,
    placeStatus: 'available',
  }, runtime.clock.now);

  const relevance = runtime.relevance.evaluate({
    situation: stationarySituation(),
    transitions: [],
    place: placeResult,
  });

  const action = runtime.decision.decideAction({
    situation: stationarySituation(),
    relevance,
    place: placeResult,
  });

  return { placeResult, relevance, action };
}

function movingSituation({ lat, lng, mode }) {
  return {
    locationAvailable: true,
    source: 'scenario',
    lat,
    lng,
    accuracy: 5,
    motion: { status: 'moving' },
    mobility: { mode, confidence: 1 },
  };
}

const scenarios = [];

function scenario(name, run) {
  scenarios.push({ name, run });
}

scenario('Nueva ciudad sin memoria → introduce_place', () => {
  const runtime = createRuntime('2026-07-08T10:00:00-04:00');
  markCountryKnown(runtime);

  const { placeResult, action } = evaluatePlace(runtime, PLACE.Santiago);

  assert.equal(placeResult.current.city.presenceStatus, 'assumed_new');
  assert.equal(action.type, 'introduce_place');
  assert.equal(action.semanticPlace.id, PLACE.Santiago.cityId);
  assert.equal(action.contentMode, 'intro_plus_relevant');
  assert.equal(action.canBeCorrectedByUser, true);
});

scenario('Corrección del usuario → known y persiste', () => {
  const storage = new MemoryStorage();
  const runtime = createRuntime('2026-07-08T10:00:00-04:00', storage);
  markCountryKnown(runtime);
  evaluatePlace(runtime, PLACE.Santiago);

  const learned = runtime.place.handleUserMessage('Sí, gracias, ya conozco Santiago', runtime.clock.now + 1000);
  assert.equal(learned.handled, true);
  assert.equal(learned.known, true);
  assert.equal(runtime.place.getCurrentSummary().city.knownByUser, true);
  assert.equal(runtime.place.getCurrentSummary().city.presenceStatus, 'known');

  runtime.place.flush();

  const reopened = createRuntime('2026-07-09T11:00:00-04:00', storage);
  const { placeResult, action } = evaluatePlace(reopened, PLACE.Santiago);
  assert.equal(placeResult.current.city.knownByUser, true);
  assert.equal(placeResult.current.city.presenceStatus, 'known');
  assert.equal(action.type, 'continue_place');
  assert.equal(action.contentMode, 'new_relevant_only');
});

scenario('Presencia el día anterior → recent_presence', () => {
  const storage = new MemoryStorage();
  const firstDay = createRuntime('2026-07-08T10:00:00-04:00', storage);
  markCountryKnown(firstDay);
  evaluatePlace(firstDay, PLACE.Santiago);
  firstDay.place.flush();

  const nextDay = createRuntime('2026-07-09T11:00:00-04:00', storage);
  const { placeResult, action } = evaluatePlace(nextDay, PLACE.Santiago);

  assert.equal(placeResult.current.city.seenYesterday, true);
  assert.equal(placeResult.current.city.presenceStatus, 'recent_presence');
  assert.equal(action.type, 'continue_place');
  assert.equal(action.avoidRepeatedIntro, true);
});

scenario('Negación explícita → new_confirmed', () => {
  const runtime = createRuntime('2026-07-08T10:00:00-04:00');
  markCountryKnown(runtime);
  evaluatePlace(runtime, PLACE.Santiago);

  const learned = runtime.place.handleUserMessage('No lo conozco, es mi primera vez', runtime.clock.now + 1000);

  assert.equal(learned.handled, true);
  assert.equal(learned.known, false);
  assert.equal(runtime.place.getCurrentSummary().city.knownByUser, false);
  assert.equal(runtime.place.getCurrentSummary().city.presenceStatus, 'new_confirmed');
});

scenario('Ruido breve de geocoder no cambia la ciudad', () => {
  const runtime = createRuntime('2026-07-08T10:00:00-04:00');
  markCountryKnown(runtime);
  evaluatePlace(runtime, PLACE.Santiago);

  runtime.clock.advance(1000);
  evaluatePlace(runtime, PLACE.Navarrete);
  assert.equal(runtime.place.getCurrentSummary().city.placeId, PLACE.Santiago.cityId);

  runtime.clock.advance(9000);
  evaluatePlace(runtime, PLACE.Santiago);
  assert.equal(runtime.place.getCurrentSummary().city.placeId, PLACE.Santiago.cityId);

  runtime.clock.advance(10000);
  evaluatePlace(runtime, PLACE.Navarrete);
  runtime.clock.advance(31000);
  evaluatePlace(runtime, PLACE.Navarrete);
  assert.equal(runtime.place.getCurrentSummary().city.placeId, PLACE.Navarrete.cityId);
});

scenario('Journey multimodal conserva una sola sesión', () => {
  const runtime = createRuntime('2026-07-08T10:00:00-04:00');
  const startAt = runtime.clock.now;

  const first = runtime.journey.update({
    situation: movingSituation({ lat: 19.79, lng: -70.69, mode: 'car' }),
    transitionState: { stableMotion: { status: 'moving', sinceAt: startAt } },
  }, runtime.clock.now);

  const journeyId = first.active.id;

  runtime.clock.advance(60000);
  const second = runtime.journey.update({
    situation: movingSituation({ lat: 19.81, lng: -70.72, mode: 'boat' }),
    transitionState: { stableMotion: { status: 'moving', sinceAt: startAt } },
  }, runtime.clock.now);

  runtime.clock.advance(60000);
  const third = runtime.journey.update({
    situation: movingSituation({ lat: 19.84, lng: -70.75, mode: 'bicycle' }),
    transitionState: { stableMotion: { status: 'moving', sinceAt: startAt } },
  }, runtime.clock.now);

  assert.equal(second.active.id, journeyId);
  assert.equal(third.active.id, journeyId);
  assert.deepEqual(
    third.active.mobilitySegments.map((segment) => segment.mode),
    ['car', 'boat', 'bicycle'],
  );
});

scenario('Content Memory evita olvidar lo ya contado', () => {
  const storage = new MemoryStorage();
  const runtime = createRuntime('2026-07-08T10:00:00-04:00', storage);
  const contentId = 'santiago:history:restoration-war';

  runtime.place.rememberContent({
    contentId,
    placeId: PLACE.Santiago.cityId,
    topic: 'Guerra de la Restauración',
  }, runtime.clock.now);

  runtime.clock.advance(60000);
  runtime.place.rememberContent({
    contentId,
    placeId: PLACE.Santiago.cityId,
    topic: 'Guerra de la Restauración',
  }, runtime.clock.now);

  assert.equal(runtime.place.hasToldContent(contentId), true);
  assert.equal(runtime.place.getContentRecord(contentId).tellCount, 2);

  runtime.place.updateContentFeedback(contentId, { userKnewIt: false, interest: 'high' });
  runtime.place.flush();

  const reopened = createRuntime('2026-07-08T12:00:00-04:00', storage);
  const persisted = reopened.place.getContentRecord(contentId);
  assert.equal(persisted.tellCount, 2);
  assert.equal(persisted.userKnewIt, false);
  assert.equal(persisted.interest, 'high');
});

let passed = 0;
const failures = [];

for (const test of scenarios) {
  try {
    test.run();
    passed += 1;
    console.log('PASS', test.name);
  } catch (error) {
    failures.push({ name: test.name, error });
    console.error('FAIL', test.name);
    console.error(error?.stack || error);
  }
}

console.log(`\n${passed}/${scenarios.length} scenarios passed`);

if (failures.length) {
  process.exitCode = 1;
}
