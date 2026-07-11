import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class MemoryStorage {
  constructor(seed = {}) { this.map = new Map(Object.entries(seed)); }
  getItem(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
}

function createElement() {
  const listeners = new Map();
  return {
    innerHTML: '',
    attributes: {},
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    click() {
      for (const listener of listeners.get('click') || []) listener({ type: 'click' });
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] || null; },
  };
}

function createRuntime(seed = {}) {
  const rail = createElement();
  const documentEvents = [];
  const listeners = new Set();
  const values = new Map(Object.entries({
    'context.status': 'En pausa',
    'motion.speedKmh': 1.25,
    'motion.heading': 92,
    'motion.status': 'moving',
    ...seed.contextValues,
  }));

  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    },
    localStorage: new MemoryStorage(seed.storage || {}),
    document: {
      querySelector(selector) { return selector === '#context-rail' ? rail : null; },
      addEventListener() {},
      dispatchEvent(event) { documentEvents.push(event); return true; },
    },
    WanderContext: {
      value(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    },
    WanderScreen: {
      opened: [],
      open(name) { this.opened.push(name); },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(ROOT, 'runtime-context-rail.js'), 'utf8');
  new vm.Script(source, { filename: 'runtime-context-rail.js' }).runInContext(context);

  return {
    api: context.WanderContextRail,
    rail,
    values,
    listeners,
    storage: sandbox.localStorage,
    screen: context.WanderScreen,
    documentEvents,
  };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('default rail shows summary, speed, and heading', () => {
  const rt = createRuntime();
  assert.deepEqual(rt.api.getConfig().visibleFields, ['summary', 'speed', 'heading']);
  assert.match(rt.rail.innerHTML, /En pausa/);
  assert.match(rt.rail.innerHTML, /1\.3 km\/h/);
  assert.match(rt.rail.innerHTML, /92°/);
});

test('clicking the rail opens the Context panel', () => {
  const rt = createRuntime();
  rt.rail.click();
  assert.deepEqual(rt.screen.opened, ['context']);
});

test('visible fields can be changed and are persisted', () => {
  const rt = createRuntime({ contextValues: { 'mobility.mode': 'walking' } });
  rt.api.setVisibleFields(['summary', 'mobility']);

  assert.deepEqual(rt.api.getConfig().visibleFields, ['summary', 'mobility']);
  assert.match(rt.rail.innerHTML, /En pausa/);
  assert.match(rt.rail.innerHTML, /A pie/);
  assert.doesNotMatch(rt.rail.innerHTML, /km\/h/);

  const saved = JSON.parse(rt.storage.getItem(rt.api.storageKey));
  assert.deepEqual(saved.visibleFields, ['summary', 'mobility']);
});

test('toggleField can hide and show individual fields', () => {
  const rt = createRuntime();
  rt.api.toggleField('speed', false);
  assert.deepEqual(rt.api.getConfig().visibleFields, ['summary', 'heading']);
  assert.doesNotMatch(rt.rail.innerHTML, /km\/h/);

  rt.api.toggleField('speed', true);
  assert.deepEqual(rt.api.getConfig().visibleFields, ['summary', 'heading', 'speed']);
  assert.match(rt.rail.innerHTML, /1\.3 km\/h/);
});

test('invalid stored fields are filtered without breaking the rail', () => {
  const rt = createRuntime({
    storage: {
      'wander.contextRail.config.v1': JSON.stringify({ version: 1, visibleFields: ['summary', 'bad-field', 'place'] }),
    },
    contextValues: {
      'history.currentPlace': { city: { name: 'Luperón' } },
    },
  });

  assert.deepEqual(rt.api.getConfig().visibleFields, ['summary', 'place']);
  assert.match(rt.rail.innerHTML, /Luperón/);
  assert.doesNotMatch(rt.rail.innerHTML, /bad-field/);
});

test('empty configuration leaves a tappable Contexto fallback', () => {
  const rt = createRuntime();
  rt.api.setVisibleFields([]);
  assert.deepEqual(rt.api.getConfig().visibleFields, []);
  assert.match(rt.rail.innerHTML, /Contexto/);
  rt.rail.click();
  assert.deepEqual(rt.screen.opened, ['context']);
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
console.log(`\n${passed}/${tests.length} ContextRail tests passed`);
