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
}

class MockElement {
  constructor({ id = '', field = null, empty = false } = {}) {
    this.id = id;
    this.dataset = {};
    if (field) this.dataset.dashboardField = field;
    if (empty) this.dataset.dashboardEmpty = '';
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this.className = '';
    this.children = [];
  }

  querySelector(selector) {
    if (selector === '[data-dashboard-empty]') return this.children.find((child) => 'dashboardEmpty' in child.dataset) || null;
    const fieldMatch = selector.match(/^\[data-dashboard-field="([^"]+)"\]$/);
    if (fieldMatch) return this.children.find((child) => child.dataset.dashboardField === fieldMatch[1]) || null;
    return null;
  }

  insertBefore(child, before) {
    const index = before ? this.children.indexOf(before) : -1;
    if (index >= 0) this.children.splice(index, 0, child);
    else this.children.push(child);
  }
}

function createRuntime(sharedStorage = new Map()) {
  const values = new Map([
    ['context.status', 'Listo para explorar'],
    ['motion.speedKmh', 4.2],
    ['motion.heading', 90],
    ['motion.status', 'moving'],
    ['location.effective.lat', 19.123456],
    ['location.effective.lng', -70.654321],
    ['place.city', 'Luperón'],
  ]);
  const subscribers = new Set();
  const context = {
    value(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
  };

  const staticFields = ['summary', 'speed', 'heading', 'currentPOI', 'place', 'mobility', 'accuracy', 'nearby', 'simulation'];
  const dashboard = new MockElement({ id: 'context-dashboard' });
  for (const field of staticFields) dashboard.children.push(new MockElement({ field }));
  const empty = new MockElement({ empty: true });
  dashboard.children.push(empty);

  const metrics = new Map([
    ['metric-status', new MockElement({ id: 'metric-status' })],
    ['metric-speed', new MockElement({ id: 'metric-speed' })],
    ['metric-heading', new MockElement({ id: 'metric-heading' })],
    ['metric-current-poi', new MockElement({ id: 'metric-current-poi' })],
    ['metric-place', new MockElement({ id: 'metric-place' })],
    ['metric-mobility', new MockElement({ id: 'metric-mobility' })],
    ['metric-accuracy', new MockElement({ id: 'metric-accuracy' })],
    ['metric-nearby', new MockElement({ id: 'metric-nearby' })],
    ['metric-simulation', new MockElement({ id: 'metric-simulation' })],
    ['metric-activity', new MockElement({ id: 'metric-activity' })],
    ['metric-time', new MockElement({ id: 'metric-time' })],
    ['metric-day-period', new MockElement({ id: 'metric-day-period' })],
    ['metric-location-status', new MockElement({ id: 'metric-location-status' })],
    ['metric-coordinates', new MockElement({ id: 'metric-coordinates' })],
    ['metric-location-source', new MockElement({ id: 'metric-location-source' })],
    ['metric-motion-status', new MockElement({ id: 'metric-motion-status' })],
    ['metric-journey', new MockElement({ id: 'metric-journey' })],
    ['metric-country', new MockElement({ id: 'metric-country' })],
    ['metric-zone', new MockElement({ id: 'metric-zone' })],
    ['metric-place-memory', new MockElement({ id: 'metric-place-memory' })],
    ['metric-app-version', new MockElement({ id: 'metric-app-version' })],
  ]);

  const document = {
    createElement() { return new MockElement(); },
    querySelector(selector) {
      if (selector === '#context-dashboard') return dashboard;
      if (selector === '[data-dashboard-empty]') return empty;
      if (selector.startsWith('#')) return metrics.get(selector.slice(1)) || dashboard.children.find((child) => child.id === selector.slice(1)) || null;
      return null;
    },
    querySelectorAll(selector) {
      return selector === '[data-dashboard-field]' ? dashboard.children.filter((child) => child.dataset.dashboardField) : [];
    },
  };

  const sandbox = {
    console,
    JSON,
    Math,
    localStorage: new MemoryStorage(sharedStorage),
    document,
    WanderContext: context,
    addEventListener() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const vmContext = vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(ROOT, 'runtime-context-dashboard.js'), 'utf8');
  new vm.Script(source, { filename: 'runtime-context-dashboard.js' }).runInContext(vmContext);

  return { api: vmContext.WanderContextDashboard, dashboard, empty, metrics, storage: sharedStorage };
}

const shared = new Map();
const first = createRuntime(shared);

assert.deepEqual(Array.from(first.api.getVisibleFields()), ['summary', 'speed', 'heading']);
assert.equal(first.dashboard.querySelector('[data-dashboard-field="summary"]').hidden, false);
assert.equal(first.dashboard.querySelector('[data-dashboard-field="place"]').hidden, true);
assert.equal(first.metrics.get('metric-status').textContent, 'Listo para explorar');
assert.equal(first.metrics.get('metric-speed').textContent, '4.2 km/h');
assert.equal(first.metrics.get('metric-heading').textContent, '90°');
assert.equal(first.api.fields.length, 21);
assert.ok(first.dashboard.querySelector('[data-dashboard-field="activity"]'));
assert.ok(first.dashboard.querySelector('[data-dashboard-field="coordinates"]'));
assert.ok(first.dashboard.querySelector('[data-dashboard-field="placeMemory"]'));

first.api.setFieldVisible('coordinates', true);
assert.equal(first.api.isVisible('coordinates'), true);
assert.equal(first.dashboard.querySelector('[data-dashboard-field="coordinates"]').hidden, false);
assert.equal(first.metrics.get('metric-coordinates').textContent, '19.123456, -70.654321');

first.api.setFieldVisible('place', true);
assert.equal(first.api.isVisible('place'), true);
assert.equal(first.dashboard.querySelector('[data-dashboard-field="place"]').hidden, false);
assert.equal(first.metrics.get('metric-place').textContent, 'Luperón');
assert.match(shared.get(first.api.storageKey), /"place"/);

const reopened = createRuntime(shared);
assert.equal(reopened.api.isVisible('place'), true);
assert.equal(reopened.dashboard.querySelector('[data-dashboard-field="place"]').hidden, false);

for (const fieldId of reopened.api.getVisibleFields()) reopened.api.setFieldVisible(fieldId, false);
assert.deepEqual(Array.from(reopened.api.getVisibleFields()), []);
assert.equal(reopened.empty.hidden, false);

reopened.api.reset();
assert.deepEqual(Array.from(reopened.api.getVisibleFields()), ['summary', 'speed', 'heading']);
assert.equal(reopened.empty.hidden, true);

console.log('PASS configurable context dashboard fields');
