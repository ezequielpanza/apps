import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboardSource = fs.readFileSync(path.join(ROOT, 'runtime-context-dashboard.js'), 'utf8');
const tracksSource = fs.readFileSync(path.join(ROOT, 'runtime-tracks.js'), 'utf8');

assert.match(dashboardSource, /function directionValue\(/);
assert.match(dashboardSource, /context\.value\('direction\.heading'\)/);
assert.match(dashboardSource, /context\.value\('motion\.heading'\)/);
assert.match(dashboardSource, /label: 'Dirección'/);
assert.match(dashboardSource, /cardinalDirection/);

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const windowTarget = new EventTarget();
const currentTrack = { setLatLngs() {} };
const route = { setLatLngs() {} };
const sandbox = Object.assign(windowTarget, {
  console,
  Event,
  EventTarget,
  CustomEvent: class CustomEvent extends Event {
    constructor(type, options = {}) { super(type); this.detail = options.detail; }
  },
  localStorage: new MemoryStorage(),
  document: {
    querySelector() { return null; },
    addEventListener() {},
  },
  WanderBase: {
    map: { fitBounds() {} },
    route,
    currentTrack,
  },
  WanderSessionEngine: {
    snapshot() { return { active: null, sessions: [] }; },
    subscribe() { return () => {}; },
    isAutoEnabled() { return true; },
    list() { return []; },
  },
  WanderContext: {
    set() {},
    value() { return null; },
  },
});
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(tracksSource, sandbox, { filename: 'runtime-tracks.js' });

const session = {
  segments: [
    {
      type: 'movement',
      points: [
        { lat: 18.3501, lng: -68.8271 },
        { lat: 18.3503, lng: -68.8268 },
      ],
    },
    {
      type: 'stay',
      center: { lat: 18.3504, lng: -68.8267 },
    },
    {
      type: 'movement',
      points: [
        { lat: 18.3545, lng: -68.8202 },
        { lat: 18.3548, lng: -68.8198 },
      ],
    },
  ],
};

const segments = sandbox.WanderTracks.segmentLatLngs(session);
assert.equal(segments.length, 2);
assert.deepEqual(JSON.parse(JSON.stringify(segments)), [
  [[18.3501, -68.8271], [18.3503, -68.8268]],
  [[18.3545, -68.8202], [18.3548, -68.8198]],
]);
assert.notDeepEqual(segments[0][segments[0].length - 1], segments[1][0]);
assert.match(tracksSource, /line\.setLatLngs\(segments\)/);
assert.doesNotMatch(tracksSource, /function currentLatLngs\(active\)[\s\S]{0,180}sessionPoints\(active\)/);

console.log('PASS dashboard uses hybrid direction and track segments remain visually disconnected');
