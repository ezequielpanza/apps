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
  constructor({ dataset = {}, hidden = false, id = '' } = {}) {
    this.dataset = { ...dataset };
    this.hidden = hidden;
    this.id = id;
    this.listeners = new Map();
    this.attributes = new Map();
    this.classList = new MockClassList();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  dispatch(type, event = {}) {
    const payload = {
      target: this,
      preventDefault() {},
      stopPropagation() {},
      ...event,
    };
    for (const listener of this.listeners.get(type) || []) listener(payload);
  }

  querySelectorAll() { return []; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  closest(selector) {
    if (selector === '#main-menu' && this.id === 'main-menu') return this;
    if (selector === '#main-menu-button' && this.id === 'main-menu-button') return this;
    return null;
  }
}

const app = new MockElement({ dataset: { screen: 'map', menu: 'closed' } });
const menu = new MockElement({ hidden: true, id: 'main-menu' });
const menuButton = new MockElement({ id: 'main-menu-button' });
const reloadButton = new MockElement({ id: 'reload-app-button' });
const contextDashboard = new MockElement({ id: 'context-dashboard' });
const screens = [
  new MockElement({ dataset: { appScreen: 'travel' }, hidden: true }),
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
      '#reload-app-button': reloadButton,
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

let replacedUrl = null;
const sandbox = {
  console,
  document,
  URL,
  Date: { now: () => 1720000000000 },
  location: {
    href: 'https://wander-travel.pages.dev/?app=v0.85.3',
    replace(url) { replacedUrl = url; },
  },
  setTimeout: () => 1,
  clearTimeout: () => {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const context = vm.createContext(sandbox);
const source = fs.readFileSync(path.join(ROOT, 'runtime-panel.js'), 'utf8');
new vm.Script(source, { filename: 'runtime-panel.js' }).runInContext(context);

assert.equal(replacedUrl, null);
reloadButton.dispatch('click');
assert.equal(replacedUrl, 'https://wander-travel.pages.dev/?app=v0.85.3&reload=1720000000000');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.match(html, /<button id="reload-app-button"[^>]*class="drawer-logo drawer-reload-button"/);
assert.match(html, /aria-label="Recargar Wander"/);

console.log('PASS drawer logo forces a fresh Wander navigation');
