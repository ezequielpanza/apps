import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class MemoryStorage {
  constructor(shared = new Map()) { this.shared = shared; }
  getItem(key) { return this.shared.has(String(key)) ? this.shared.get(String(key)) : null; }
  setItem(key, value) { this.shared.set(String(key), String(value)); }
  removeItem(key) { this.shared.delete(String(key)); }
}

class MockElement {
  constructor({ id = '', field = null, empty = false, hidden = false } = {}) {
    this.id = id;
    this.dataset = {};
    if (field) this.dataset.dashboardField = field;
    if (empty) this.dataset.dashboardEmpty = '';
    this.hidden = hidden;
    this.textContent = '';
    this.innerHTML = '';
    this.listeners = new Map();
    this.attributes = new Map();
    this.style = { removeProperty() {} };
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type, event) {
    this.listeners.get(type)?.(event);
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
}

function createRuntime(sharedStorage = new Map()) {
  const values = new Map([
    ['context.status', 'Listo para explorar'],
    ['motion.speedKmh', 4.2],
    ['motion.heading', 90],
    ['motion.status', 'moving'],
    ['place.city', 'Luperón'],
  ]);
  const subscribers = new Set();
  const context = {
    value(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
  };

  const fields = ['summary', 'speed', 'heading', 'currentPOI', 'place', 'mobility', 'accuracy', 'nearby', 'lastSuggestion', 'simulation'];
  const fieldElements = fields.map((field) => new MockElement({ field }));
  const dashboard = new MockElement({ id: 'context-dashboard', hidden: true });
  const empty = new MockElement({ empty: true });
  const controls = new MockElement({ id: 'context-dashboard-fields' });
  const metrics = new Map([
    ['metric-status', new MockElement({ id: 'metric-status' })],
    ['metric-speed', new MockElement({ id: 'metric-speed' })],
    ['metric-heading', new MockElement({ id: 'metric-heading' })],
    ['metric-current-poi', new MockElement({ id: 'metric-current-poi' })],
    ['metric-place', new MockElement({ id: 'metric-place' })],
    ['metric-mobility', new MockElement({ id: 'metric-mobility' })],
    ['metric-accuracy', new MockElement({ id: 'metric-accuracy' })],
    ['metric-nearby', new MockElement({ id: 'metric-nearby' })],
    ['metric-last-suggestion', new MockElement({ id: 'metric-last-suggestion' })],
    ['metric-simulation', new MockElement({ id: 'metric-simulation' })],
  ]);

  const documentListeners = new Map();
  const document = {
    visibilityState: 'visible',
    querySelector(selector) {
      if (selector === '#context-dashboard') return dashboard;
      if (selector === '#context-dashboard-fields') return controls;
      if (selector === '[data-dashboard-empty]') return empty;
      if (selector.startsWith('#')) return metrics.get(selector.slice(1)) || null;
      return null;
    },
    querySelectorAll(selector) {
      return selector === '[data-dashboard-field]' ? fieldElements : [];
    },
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    },
  };

  const windowListeners = new Map();
  const sandbox = {
    console,
    JSON,
    Math,
    localStorage: new MemoryStorage(sharedStorage),
    document,
    WanderContext: context,
    addEventListener(type, listener) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(listener);
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const vmContext = vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(ROOT, 'runtime-context-dashboard.js'), 'utf8');
  new vm.Script(source, { filename: 'runtime-context-dashboard.js' }).runInContext(vmContext);

  return {
    api: vmContext.WanderContextDashboard,
    dashboard,
    controls,
    empty,
    fieldElements,
    metrics,
    storage: sharedStorage,
    dispatchWindow(type) {
      for (const listener of windowListeners.get(type) || []) listener({ type });
    },
    dispatchDocument(type) {
      for (const listener of documentListeners.get(type) || []) listener({ type });
    },
  };
}

const shared = new Map();
const first = createRuntime(shared);

assert.deepEqual(Array.from(first.api.getVisibleFields()), ['summary', 'speed', 'heading']);
assert.equal(first.dashboard.hidden, false);
assert.equal(first.fieldElements.find((item) => item.dataset.dashboardField === 'summary').hidden, false);
assert.equal(first.fieldElements.find((item) => item.dataset.dashboardField === 'place').hidden, true);
assert.equal(first.metrics.get('metric-status').textContent, 'Listo para explorar');
assert.equal(first.metrics.get('metric-speed').textContent, '4.2 km/h');
assert.equal(first.metrics.get('metric-heading').textContent, '90°');
assert.match(first.controls.innerHTML, /Resumen/);
assert.match(first.controls.innerHTML, /POI actual/);
assert.match(first.controls.innerHTML, /data-dashboard-toggle="summary"[^>]*checked/);

first.api.setFieldVisible('place', true);
assert.equal(first.api.isVisible('place'), true);
assert.equal(first.fieldElements.find((item) => item.dataset.dashboardField === 'place').hidden, false);
assert.equal(first.metrics.get('metric-place').textContent, 'Luperón');
assert.match(shared.get(first.api.storageKey), /"place"/);

const reopened = createRuntime(shared);
assert.equal(reopened.api.isVisible('place'), true);
assert.equal(reopened.dashboard.hidden, false);
assert.equal(reopened.fieldElements.find((item) => item.dataset.dashboardField === 'place').hidden, false);

reopened.dashboard.hidden = true;
reopened.dispatchWindow('pageshow');
assert.equal(reopened.dashboard.hidden, false);
assert.equal(reopened.api.isVisible('place'), true);

for (const fieldId of reopened.api.getVisibleFields()) {
  reopened.api.setFieldVisible(fieldId, false);
}
assert.deepEqual(Array.from(reopened.api.getVisibleFields()), []);
assert.equal(reopened.dashboard.hidden, false);
assert.equal(reopened.empty.hidden, false);

reopened.api.reset();
assert.deepEqual(Array.from(reopened.api.getVisibleFields()), ['summary', 'speed', 'heading']);
assert.equal(reopened.empty.hidden, true);

console.log('PASS configurable context dashboard fields and reload restoration');
