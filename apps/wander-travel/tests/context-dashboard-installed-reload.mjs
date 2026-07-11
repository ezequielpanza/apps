import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
}

class MockStyle {
  constructor() { this.values = new Map(); }
  setProperty(name, value, priority = '') { this.values.set(name, { value, priority }); }
}

class MockElement {
  constructor({ field = null, empty = false, hidden = false } = {}) {
    this.dataset = {};
    if (field) this.dataset.dashboardField = field;
    if (empty) this.dataset.dashboardEmpty = '';
    this.hidden = hidden;
    this.style = new MockStyle();
    this.attributes = new Map();
    this.textContent = '';
    this.innerHTML = '';
    this.listeners = new Map();
  }
  removeAttribute(name) { this.attributes.delete(name); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
}

const dashboard = new MockElement({ hidden: true });
dashboard.attributes.set('hidden', '');
const fields = ['summary', 'speed', 'heading', 'currentPOI', 'place', 'mobility', 'accuracy', 'nearby', 'lastSuggestion', 'simulation'];
const fieldElements = fields.map((field) => new MockElement({ field, hidden: true }));
const empty = new MockElement({ empty: true, hidden: true });
const controls = new MockElement();
const metrics = new Map(fields.map((field) => [`metric-${field === 'summary' ? 'status' : field === 'currentPOI' ? 'current-poi' : field === 'lastSuggestion' ? 'last-suggestion' : field}`, new MockElement()]));
metrics.set('metric-speed', new MockElement());
metrics.set('metric-heading', new MockElement());
metrics.set('metric-place', new MockElement());
metrics.set('metric-mobility', new MockElement());
metrics.set('metric-accuracy', new MockElement());
metrics.set('metric-nearby', new MockElement());
metrics.set('metric-simulation', new MockElement());

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
  addEventListener(type, listener) { documentListeners.set(type, listener); },
};

const context = {
  value(key, fallback = null) {
    const values = {
      'context.status': 'Listo para explorar',
      'motion.speedKmh': 3.5,
      'motion.heading': 45,
      'motion.status': 'moving',
    };
    return key in values ? values[key] : fallback;
  },
  subscribe() { return () => {}; },
};

const windowListeners = new Map();
const sandbox = {
  console,
  document,
  localStorage: new MemoryStorage(),
  WanderContext: context,
  requestAnimationFrame(callback) { callback(); },
  setTimeout(callback) { callback(); return 1; },
  addEventListener(type, listener) { windowListeners.set(type, listener); },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const vmContext = vm.createContext(sandbox);
const source = fs.readFileSync(path.join(ROOT, 'runtime-context-dashboard.js'), 'utf8');
new vm.Script(source, { filename: 'runtime-context-dashboard.js' }).runInContext(vmContext);

assert.equal(dashboard.hidden, false);
assert.equal(dashboard.attributes.get('aria-hidden'), 'false');
assert.equal(dashboard.dataset.dashboardMounted, 'true');
assert.deepEqual(dashboard.style.values.get('display'), { value: 'flex', priority: 'important' });
assert.deepEqual(dashboard.style.values.get('visibility'), { value: 'visible', priority: 'important' });
assert.deepEqual(dashboard.style.values.get('opacity'), { value: '1', priority: 'important' });
assert.equal(fieldElements.find((item) => item.dataset.dashboardField === 'summary').hidden, false);
assert.equal(fieldElements.find((item) => item.dataset.dashboardField === 'speed').hidden, false);
assert.equal(fieldElements.find((item) => item.dataset.dashboardField === 'heading').hidden, false);
assert.equal(empty.hidden, true);

// Simula que Chrome standalone restaura el botón oculto después del primer render.
dashboard.hidden = true;
dashboard.attributes.set('hidden', '');
windowListeners.get('pageshow')?.();
assert.equal(dashboard.hidden, false);
assert.equal(dashboard.attributes.has('hidden'), false);

const css = fs.readFileSync(path.join(ROOT, 'wander-context-dashboard.css'), 'utf8');
assert.match(css, /#context-dashboard\s*\{[\s\S]*display:\s*flex\s*!important/);
assert.match(css, /visibility:\s*visible\s*!important/);

console.log('PASS installed PWA dashboard remount');
