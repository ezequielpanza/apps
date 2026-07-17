import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = Date.parse('2026-07-17T12:00:00.000Z');

class FakeDate extends Date {
  constructor(value = NOW) { super(value); }
  static now() { return NOW; }
}

class MemoryStorage {
  constructor(entries) { this.values = new Map(entries); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const room = { lat: 18.64041, lng: -68.345552 };
const lobby = { lat: 18.64196, lng: -68.345552 };
const active = {
  schemaVersion: 1,
  id: 'session-active',
  name: 'Sesión de prueba',
  status: 'active',
  startedAt: NOW - 2 * 60 * 60 * 1000,
  endedAt: null,
  segments: [],
  stays: [{
    id: 'stay-room',
    type: 'stay',
    startedAt: NOW - 60 * 60 * 1000,
    endedAt: null,
    center: room,
    radiusM: 35,
    sampleCount: 12,
    poiId: 'room',
    poiName: 'Habitación',
    overnightCandidate: false,
  }],
  events: [],
  updatedAt: NOW - 5 * 60 * 1000,
};
const storage = new MemoryStorage([
  ['wander.sessions.v1', '[]'],
  ['wander.session.active.v1', JSON.stringify(active)],
  ['wander.sessions.settings.v1', JSON.stringify({ autoEnabled: true })],
]);

const values = new Map([
  ['motion.status', 'stationary'],
  ['mobility.mode', 'stationary'],
  ['personalPOI.current', { id: 'lobby', name: 'Lobby' }],
]);
const context = {
  value(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
  getEffectiveLocation() {
    return { ...lobby, accuracy: 8, speedMps: 0, source: 'gps', updatedAt: new Date(NOW).toISOString() };
  },
  set(key, value) { values.set(key, value); },
  remove(key) { values.delete(key); },
  subscribe() { return () => {}; },
};

const sandbox = {
  console,
  Date: FakeDate,
  Math,
  JSON,
  localStorage: storage,
  WanderContext: context,
  CustomEvent: class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  },
  setInterval: () => 1,
  addEventListener() {},
  dispatchEvent() {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const vmContext = vm.createContext(sandbox);
const source = fs.readFileSync(path.join(ROOT, 'runtime-session-engine.js'), 'utf8');
new vm.Script(source, { filename: 'runtime-session-engine.js' }).runInContext(vmContext);

const reconciled = vmContext.WanderSessionEngine.getActive();
assert.equal(reconciled.stays.length, 2);
assert.equal(reconciled.stays[0].endedAt, NOW);
assert.equal(reconciled.stays[1].endedAt, null);
assert.equal(reconciled.stays[1].poiName, 'Lobby');
assert.equal(reconciled.stays[1].center.lat, lobby.lat);
assert.equal(reconciled.events.at(-1).type, 'stay.relocated');
assert.ok(reconciled.events.at(-1).distanceM > 150);

console.log('PASS stale open stays reconcile after a distant location resume');
