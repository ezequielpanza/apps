import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class MockElement {
  constructor() { this.innerHTML = ''; }
  addEventListener() {}
  closest() { return null; }
  remove() {}
}

const elements = new Map([
  ['#context-list', new MockElement()],
  ['#context-technical', new MockElement()],
  ['#refresh-context-button', new MockElement()],
]);
const values = new Map([
  ['context.status', 'Detenido en Lobby'],
  ['context.activity', 'paused'],
  ['location.effective.status', 'available'],
  ['location.effective.source', 'gps'],
]);
const context = {
  value(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
  get(key) {
    return values.has(key)
      ? { value: values.get(key), kind: 'derived', updatedAt: Date.now() }
      : null;
  },
  getEffectiveLocation() { return null; },
  statusFor() { return 'active'; },
  subscribe() { return () => {}; },
};
const fieldValues = new Map([
  ['activity', 'En pausa'],
  ['locationStatus', 'Disponible'],
  ['locationSource', 'GPS'],
]);
const dashboard = {
  fields: [...fieldValues].map(([id, value]) => ({ id, label: id, value: () => value })),
  isVisible: () => false,
};

const sandbox = {
  console,
  Date,
  JSON,
  localStorage: { getItem: () => null, setItem() {} },
  document: { querySelector: (selector) => elements.get(selector) || null },
  WanderContext: context,
  WanderContextDashboard: dashboard,
  addEventListener() {},
  dispatchEvent() {},
  setInterval: () => 1,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const vmContext = vm.createContext(sandbox);
const source = fs.readFileSync(path.join(ROOT, 'runtime-context-panel.js'), 'utf8');
new vm.Script(source, { filename: 'runtime-context-panel.js' }).runInContext(vmContext);

const html = elements.get('#context-list').innerHTML;
assert.match(html, /<strong>Actividad<\/strong>[\s\S]*?<b>En pausa<\/b>/);
assert.match(html, /<strong>Ubicación<\/strong>[\s\S]*?<b>Disponible<\/b>/);
assert.match(html, /<strong>Fuente de ubicación<\/strong>[\s\S]*?<b>GPS<\/b>/);
assert.doesNotMatch(html, /<b>(paused|available)<\/b>/);

console.log('PASS Contexto presents human-readable state values');
