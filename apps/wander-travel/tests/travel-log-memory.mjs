import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'runtime-travel-log.js'), 'utf8');
const appRuntime = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const versionRuntime = fs.readFileSync(path.join(ROOT, 'runtime-version.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
const packageManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

class CustomEventPolyfill extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
}

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const windowTarget = new EventTarget();
const contextValues = new Map();
const contextListeners = new Set();
let activeSession = null;

const windowObject = Object.assign(windowTarget, {
  WanderContext: {
    subscribe(listener) { contextListeners.add(listener); return () => contextListeners.delete(listener); },
    value(key) { return contextValues.get(key) ?? null; },
  },
  WanderSessionEngine: {
    getActive() { return activeSession; },
    snapshot() { return { active: activeSession, sessions: [] }; },
  },
});

const sandbox = {
  window: windowObject,
  globalThis: null,
  localStorage: new MemoryStorage(),
  CustomEvent: CustomEventPolyfill,
  Event,
  EventTarget,
  Date,
  Math,
  JSON,
  console,
};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'runtime-travel-log.js' });

const log = windowObject.WanderTravelLog;
assert.ok(log, 'Travel log API must initialize');
assert.equal(log.listEntries().length, 0);

function setContext(key, value, metadata = {}) {
  contextValues.set(key, value);
  const entry = { value, source: metadata.source || 'test', kind: metadata.kind || 'observed', confidence: 1 };
  contextListeners.forEach((listener) => listener(key, entry, {}));
}

setContext('currentPOI.current', null);
setContext('currentPOI.current', { id: 'room-1', name: 'Habitación 214' });
assert.ok(log.listEntries().some((entry) => entry.title === 'Llegada' && entry.poiId === 'room-1'));

windowObject.dispatchEvent(new CustomEventPolyfill('wander:interaction-change', {
  detail: {
    type: 'presented',
    interaction: {
      id: 'interaction-room',
      title: 'Pausa en la habitación',
      message: '¿Te ayudo a organizar algo después o te quedás descansando?',
      reason: 'room_stay',
      channel: 'in_app',
      type: 'ask',
      priority: 'normal',
      poiId: 'room-1',
      placeName: 'Habitación 214',
    },
  },
}));
const conversation = log.listEntries().find((entry) => entry.interactionId === 'interaction-room' && entry.kind === 'conversation');
assert.ok(conversation, 'Presented interaction must be stored as conversation memory');
assert.ok(conversation.contextChanges.some((change) => change.key === 'currentPOI.current'), 'Interaction must retain triggering context changes');

windowObject.dispatchEvent(new CustomEventPolyfill('wander:interaction-change', {
  detail: {
    type: 'response',
    response: { interactionId: 'interaction-room', responseId: 'rest', label: 'Descansar', responseType: 'choice', poiId: 'room-1' },
  },
}));
assert.ok(log.listEntries().some((entry) => entry.kind === 'decision' && entry.summary === 'Descansar'));

const plan = log.addPlan({ title: 'Visitar el casco histórico', scheduledAt: new Date(Date.now() + 3600000).toISOString() });
assert.equal(log.listPlans().length, 1);
log.updatePlan(plan.id, { status: 'completed' });
assert.equal(log.listPlans()[0].status, 'completed');
assert.ok(log.listEntries().some((entry) => entry.title === 'Actividad realizada'));

windowObject.dispatchEvent(new CustomEventPolyfill('wander:session-engine-ready', { detail: { active: null, sessions: [] } }));
activeSession = { id: 'session-1', name: 'Sesión de prueba' };
windowObject.dispatchEvent(new CustomEventPolyfill('wander:sessions-changed', { detail: { active: activeSession, sessions: [] } }));
activeSession = null;
windowObject.dispatchEvent(new CustomEventPolyfill('wander:sessions-changed', {
  detail: { active: null, sessions: [{ id: 'session-1', name: 'Sesión de prueba', distanceM: 1250, status: 'closed', closeReason: 'manual' }] },
}));
assert.ok(log.listEntries().some((entry) => entry.title === 'Comenzó un recorrido' && entry.sessionId === 'session-1'));
assert.ok(log.listEntries().some((entry) => entry.title === 'Recorrido finalizado' && entry.sessionId === 'session-1'));

assert.match(versionRuntime, /const VERSION = 'v0\.106\.2'/);
assert.equal(manifest.start_url, './?app=v0.106.2');
assert.equal(packageManifest.version, '0.106.2');
for (const asset of ['wander-travel-log.css', 'runtime-travel-log.js', 'runtime-travel-log-screen.js', 'runtime-morning-briefing.js']) {
  assert.ok(appRuntime.includes(asset), `${asset} must load at runtime`);
  assert.ok(serviceWorker.includes(`'./${asset}'`), `${asset} must be cached for offline use`);
  assert.ok(fs.existsSync(path.join(ROOT, asset)), `${asset} must exist`);
}

console.log('PASS travel log stores contextual conversations, decisions, plans and session references');
