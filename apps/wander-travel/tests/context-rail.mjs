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

function createElement({ dataset = {}, className = '', hidden = false } = {}) {
  const listeners = new Map();
  const element = {
    innerHTML: '',
    attributes: {},
    dataset,
    className,
    hidden,
    classList: {
      values: new Set(String(className).split(/\s+/).filter(Boolean)),
      toggle(name, active) {
        if (active) this.values.add(name);
        else this.values.delete(name);
      },
      contains(name) { return this.values.has(name); },
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, event = {}) {
      const payload = {
        type,
        target: this,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; },
        defaultPrevented: false,
        propagationStopped: false,
        ...event,
      };
      for (const listener of listeners.get(type) || []) listener(payload);
      return payload;
    },
    click() { return this.dispatch('click'); },
    pointerup() { return this.dispatch('pointerup'); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    getAttribute(name) { return this.attributes[name] || null; },
    closest(selector) {
      if (selector === '#context-rail' && this.id === 'context-rail') return this;
      if (selector === '[data-screen-target]' && this.dataset.screenTarget) return this;
      return null;
    },
  };
  return element;
}

function createRuntime(seed = {}) {
  const rail = createElement();
  rail.id = 'context-rail';
  const contextScreen = createElement({ dataset: { appScreen: 'context' }, hidden: true });
  const mapScreen = createElement({ dataset: { appScreen: 'map' }, hidden: false });
  const app = createElement({ dataset: { screen: 'map' }, className: 'wander-app' });
  const navContext = createElement({ dataset: { screenTarget: 'context' } });
  const child = createElement();
  child.closest = (selector) => selector === '#context-rail' ? rail : null;

  const documentEvents = [];
  const documentListeners = new Map();
  const listeners = new Set();
  const values = new Map(Object.entries({
    'context.status': 'En pausa',
    'motion.speedKmh': 1.25,
    'motion.heading': 92,
    'motion.status': 'moving',
    ...seed.contextValues,
  }));

  const queryAll = {
    '[data-app-screen]': [mapScreen, contextScreen],
    '[data-screen-target]': [navContext],
  };

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
      querySelector(selector) {
        if (selector === '#context-rail') return rail;
        if (selector === '.wander-app') return app;
        return null;
      },
      querySelectorAll(selector) { return queryAll[selector] || []; },
      addEventListener(type, listener) {
        if (!documentListeners.has(type)) documentListeners.set(type, []);
        documentListeners.get(type).push(listener);
      },
      dispatchEvent(event) { documentEvents.push(event); return true; },
      dispatch(type, event = {}) {
        const payload = {
          type,
          target: rail,
          preventDefault() { this.defaultPrevented = true; },
          stopPropagation() { this.propagationStopped = true; },
          defaultPrevented: false,
          propagationStopped: false,
          ...event,
        };
        for (const listener of documentListeners.get(type) || []) listener(payload);
        return payload;
      },
    },
    WanderContext: {
      value(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    },
  };

  if (seed.withoutScreen !== true) {
    sandbox.WanderScreen = {
      opened: [],
      open(name) { this.opened.push(name); },
    };
  }

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(ROOT, 'runtime-context-rail.js'), 'utf8');
  new vm.Script(source, { filename: 'runtime-context-rail.js' }).runInContext(context);

  return {
    api: context.WanderContextRail,
    rail,
    child,
    app,
    contextScreen,
    mapScreen,
    navContext,
    values,
    listeners,
    storage: sandbox.localStorage,
    screen: context.WanderScreen,
    document: sandbox.document,
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

test('pointerup on the rail opens the Context panel and stops propagation', () => {
  const rt = createRuntime();
  const event = rt.rail.pointerup();
  assert.deepEqual(rt.screen.opened, ['context']);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
});

test('delegated pointerup from an internal rail child still opens Context', () => {
  const rt = createRuntime();
  rt.document.dispatch('pointerup', { target: rt.child });
  assert.deepEqual(rt.screen.opened, ['context']);
});

test('manual fallback opens Context when WanderScreen is not ready yet', () => {
  const rt = createRuntime({ withoutScreen: true });
  const opened = rt.api.openContextPanel();
  assert.equal(opened, true);
  assert.equal(rt.app.dataset.screen, 'context');
  assert.equal(rt.contextScreen.hidden, false);
  assert.equal(rt.mapScreen.hidden, true);
  assert.equal(rt.navContext.classList.contains('is-active'), true);
  assert.equal(rt.navContext.getAttribute('aria-current'), 'page');
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
