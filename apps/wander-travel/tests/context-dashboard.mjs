import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class MockClassList {
  toggle() {}
}

class MockElement {
  constructor({ dataset = {}, hidden = false } = {}) {
    this.dataset = { ...dataset };
    this.hidden = hidden;
    this.listeners = new Map();
    this.attributes = new Map();
    this.classList = new MockClassList();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) {
      listener({ target: this, ...event });
    }
  }

  querySelectorAll() {
    return [];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  closest() {
    return null;
  }
}

const app = new MockElement({ dataset: { screen: 'map', menu: 'closed' } });
const menu = new MockElement({ hidden: true });
const menuButton = new MockElement();
const contextDashboard = new MockElement();
const screens = [
  new MockElement({ dataset: { appScreen: 'context' }, hidden: true }),
  new MockElement({ dataset: { appScreen: 'simulator' }, hidden: true }),
  new MockElement({ dataset: { appScreen: 'settings' }, hidden: true }),
];

const documentListeners = new Map();
const document = {
  body: { classList: new MockClassList() },
  querySelector(selector) {
    return {
      '.wander-app': app,
      '#main-menu': menu,
      '#main-menu-button': menuButton,
      '#context-dashboard': contextDashboard,
    }[selector] || null;
  },
  querySelectorAll(selector) {
    return selector === '[data-app-screen]' ? screens : [];
  },
  addEventListener(type, listener) {
    if (!documentListeners.has(type)) documentListeners.set(type, []);
    documentListeners.get(type).push(listener);
  },
};

const sandbox = {
  console,
  document,
  CustomEvent: class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  },
  setTimeout: () => 1,
  clearTimeout: () => {},
  addEventListener() {},
  dispatchEvent() {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const context = vm.createContext(sandbox);
const source = fs.readFileSync(path.join(ROOT, 'runtime-panel.js'), 'utf8');
new vm.Script(source, { filename: 'runtime-panel.js' }).runInContext(context);

assert.equal(app.dataset.screen, 'map');
assert.equal(screens.find((screen) => screen.dataset.appScreen === 'context').hidden, true);

contextDashboard.dispatch('click');

assert.equal(app.dataset.screen, 'context');
assert.equal(screens.find((screen) => screen.dataset.appScreen === 'context').hidden, false);
assert.equal(menu.attributes.get('aria-hidden'), 'true');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.match(html, /<button id="context-dashboard"[^>]*class="status-rail"/);
assert.match(html, /aria-controls="context-screen"/);

const css = fs.readFileSync(path.join(ROOT, 'wander-context-dashboard.css'), 'utf8');
assert.match(css, /pointer-events:\s*auto/);
assert.doesNotMatch(css, /data-dashboard-field="appVersion"[\s\S]{0,120}display:\s*none/, 'Mobile CSS must not hide a selected app-version field');
assert.match(css, /data-dashboard-field="summary"/);

console.log('PASS context dashboard opens Contexto');
