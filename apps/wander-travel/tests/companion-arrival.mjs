import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policySource = fs.readFileSync(path.join(ROOT, 'runtime-companion-policy.js'), 'utf8');
const runtimeSource = fs.readFileSync(path.join(ROOT, 'runtime-companion.js'), 'utf8');

function evaluation(overrides = {}) {
  return {
    type: 'introduce_place',
    reason: 'city_assumed_new',
    semanticPlace: { level: 'city', id: 'city:santo-domingo', name: 'Santo Domingo' },
    situation: { speedKmh: 0, motion: { status: 'stationary' } },
    ...overrides,
  };
}

function loadPolicy() {
  const sandbox = { window: {}, Date };
  vm.runInNewContext(policySource, sandbox, { filename: 'runtime-companion-policy.js' });
  return sandbox.window.WanderCompanionPolicy;
}

const policy = loadPolicy();
const at = new Date('2026-07-17T10:00:00-04:00').getTime();

{
  const result = policy.decide({ evaluation: evaluation(), at });
  assert.equal(result.disposition, 'present');
  assert.equal(result.intervention.kind, 'place_intro');
  assert.equal(result.intervention.contentId, 'place-intro:city:santo-domingo');
  assert.match(result.intervention.message, /primera visita a Santo Domingo/);
  console.log('PASS new city produces a contextual arrival intervention');
}

{
  const result = policy.decide({ evaluation: evaluation(), at, contentAlreadyTold: true });
  assert.equal(result.disposition, 'ignore');
  assert.equal(result.reason, 'content_already_told');
  console.log('PASS an arrival introduction is not repeated');
}

{
  const result = policy.decide({
    evaluation: evaluation({ situation: { speedKmh: 28, motion: { status: 'moving' } } }),
    at,
  });
  assert.equal(result.disposition, 'defer');
  assert.equal(result.reason, 'traveler_moving_fast');
  console.log('PASS arrival waits while the traveler is moving fast');
}

{
  const result = policy.decide({ evaluation: { type: 'wait' }, at });
  assert.equal(result.disposition, 'ignore');
  console.log('PASS no relevant signal remains silent');
}

{
  const shown = [];
  const remembered = [];
  const observed = [];
  let subscriber = null;
  let correctionTarget = null;
  const app = { dataset: { screen: 'map' } };
  const document = {
    visibilityState: 'visible',
    body: { classList: { contains: () => false } },
    querySelector: (selector) => selector === '.wander-app' ? app : null,
    addEventListener() {},
  };
  const engine = {
    subscribeEvaluation(listener) { subscriber = listener; },
    getLastEvaluation() { return null; },
    hasToldContent(contentId) { return remembered.some((item) => item.contentId === contentId); },
    rememberContent(item) { remembered.push(item); },
    requestPlaceClarification(item) { correctionTarget = item; },
    observe(item) { observed.push(item); },
    handleUserMessage(message) {
      if (!/ya conozco/i.test(message)) return { handled: false };
      return {
        handled: true,
        type: 'place_familiarity',
        known: true,
        placeId: correctionTarget.placeId,
        message: 'Entendido. No voy a repetir la introducción.',
      };
    },
  };
  const context = { set() {} };
  const ui = { showWander(title, message, options) { shown.push({ title, message, options }); return true; } };
  const sandbox = {
    window: {
      WanderContext: context,
      WanderEngine: engine,
      WanderCompanionPolicy: policy,
      WanderUI: ui,
      addEventListener() {},
    },
    document,
    Date,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(runtimeSource, sandbox, { filename: 'runtime-companion.js' });

  assert.equal(typeof subscriber, 'function');
  subscriber(evaluation(), 'test:new-city');
  assert.equal(shown.length, 1);
  assert.equal(remembered[0].contentId, 'place-intro:city:santo-domingo');
  assert.equal(correctionTarget.placeId, 'city:santo-domingo');
  assert.equal(observed[0].type, 'companion_intervention');

  const correction = sandbox.window.WanderCompanion.receive('Ya conozco Santo Domingo');
  assert.equal(correction.handled, true);
  assert.equal(shown.at(-1).title, 'Entendido');
  assert.equal(observed.at(-1).type, 'companion_feedback');
  console.log('PASS arrival is presented, remembered, and accepts a contextual correction');
}

console.log('\n5/5 companion arrival tests passed');
