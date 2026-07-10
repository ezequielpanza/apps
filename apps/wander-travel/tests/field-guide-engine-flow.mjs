import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function load(context, filename) {
  const source = fs.readFileSync(path.join(ROOT, filename), 'utf8');
  new vm.Script(source, { filename }).runInContext(context);
}

function createDecisionRuntime() {
  const sandbox = { console, Date, Math };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  load(context, 'runtime-engine-relevance.js');
  load(context, 'runtime-engine-decision.js');
  return {
    relevance: context.WanderEngineRelevance,
    decision: context.WanderEngineDecision,
  };
}

function fieldCandidate(overrides = {}) {
  const now = Date.now();
  return {
    type: 'poi_nearby',
    poiId: 'poi-fort',
    contentId: 'field-guide:poi:poi-fort:proximity-v1',
    score: 0.86,
    createdAt: new Date(now).toISOString(),
    expiresAt: now + 120000,
    item: { id: 'poi-fort', name: 'Fortaleza' },
    presentation: { title: 'Fortaleza', message: 'Tenés cerca un lugar histórico.' },
    ...overrides,
  };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('field guide candidate becomes a formal engine action', () => {
  const rt = createDecisionRuntime();
  const candidate = fieldCandidate();
  const situation = { locationAvailable: true, motion: { status: 'moving' } };
  const relevance = rt.relevance.evaluate({
    situation,
    transitions: [],
    place: { current: null, events: [] },
    fieldGuide: candidate,
  });

  assert.equal(relevance.signal.type, 'field_guide.poi_nearby');
  assert.equal(relevance.fieldGuideCandidate.poiId, 'poi-fort');

  const action = rt.decision.decideAction({ situation, relevance });
  assert.equal(action.type, 'field_guide_suggestion');
  assert.equal(action.poiId, 'poi-fort');
  assert.equal(action.presentation.title, 'Fortaleza');
});

test('new city event outranks nearby field guide interruption', () => {
  const rt = createDecisionRuntime();
  const situation = { locationAvailable: true, motion: { status: 'stationary' } };
  const relevance = rt.relevance.evaluate({
    situation,
    transitions: [],
    place: {
      current: { city: { placeId: 'city:test', name: 'Ciudad' } },
      events: [{
        type: 'city.assumed_new',
        level: 'city',
        placeId: 'city:test',
        name: 'Ciudad',
        presenceStatus: 'assumed_new',
      }],
    },
    fieldGuide: fieldCandidate({ score: 0.89 }),
  });

  assert.equal(relevance.signal.type, 'city.assumed_new');
  const action = rt.decision.decideAction({ situation, relevance });
  assert.equal(action.type, 'introduce_place');
});

test('expired field guide candidate is ignored', () => {
  const rt = createDecisionRuntime();
  const relevance = rt.relevance.evaluate({
    situation: { locationAvailable: true, motion: { status: 'moving' } },
    transitions: [],
    place: { current: null, events: [] },
    fieldGuide: fieldCandidate({ expiresAt: Date.now() - 1 }),
  });
  assert.equal(relevance.signal.type, 'wait');
});

test('engine presenter shows and remembers a decision exactly once', () => {
  const listeners = new Set();
  const shown = [];
  const remembered = [];
  const sandbox = {
    console,
    Date,
    Math,
    setTimeout: () => 1,
    clearTimeout: () => {},
    WanderEngine: {
      subscribeEvaluation(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      getLastEvaluation() { return null; },
    },
    WanderUI: {
      showWander(title, message) { shown.push({ title, message }); },
    },
    WanderFieldGuide: {
      markPresented(candidate) { remembered.push(candidate); return { poiId: candidate.poiId }; },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  load(context, 'runtime-engine-presenter.js');

  const candidate = fieldCandidate();
  const evaluation = {
    type: 'field_guide_suggestion',
    poiId: candidate.poiId,
    contentId: candidate.contentId,
    presentation: candidate.presentation,
    fieldGuideCandidate: candidate,
  };

  listeners.forEach((listener) => listener(evaluation, 'test'));
  listeners.forEach((listener) => listener(evaluation, 'test-repeat'));

  assert.equal(shown.length, 1);
  assert.equal(shown[0].title, 'Fortaleza');
  assert.equal(remembered.length, 1);
  assert.equal(remembered[0].poiId, 'poi-fort');
});

let passed = 0;
for (const currentTest of tests) {
  try {
    await currentTest.run();
    passed += 1;
    console.log('PASS', currentTest.name);
  } catch (error) {
    console.error('FAIL', currentTest.name);
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} field guide engine-flow tests passed`);
