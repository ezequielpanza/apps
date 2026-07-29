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
    querySelectorAll() { return []; },
    addEventListener() {},
    documentElement: null,
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
  WanderUI: { showToast() {} },
  WanderVersion: 'v0.109.6',
  setTimeout,
  clearTimeout,
  Blob,
  URL,
});
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(tracksSource, sandbox, { filename: 'runtime-tracks.js' });

const session = {
  id: 'session-1',
  name: 'Prueba & costa',
  startedAt: 1785312000000,
  distanceM: 950,
  stays: [],
  segments: [
    {
      id: 'movement-1',
      type: 'movement',
      method: 'walking',
      startedAt: 1785312000000,
      endedAt: 1785312060000,
      distanceM: 250,
      points: [
        { lat: 18.3501, lng: -68.8271, at: 1785312000000, accuracy: 4.2, speedKmh: 4.5, heading: 90 },
        { lat: 18.3503, lng: -68.8268, at: 1785312060000, accuracy: 5.1 },
      ],
    },
    {
      type: 'stay',
      center: { lat: 18.3504, lng: -68.8267 },
    },
    {
      id: 'movement-2',
      type: 'movement',
      method: 'boat',
      startedAt: 1785312120000,
      endedAt: 1785312240000,
      distanceM: 700,
      points: [
        { lat: 18.3545, lng: -68.8202, at: 1785312120000 },
        { lat: 18.3548, lng: -68.8198, at: 1785312240000 },
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

const gpx = sandbox.WanderTracks.buildGpx({
  name: session.name,
  description: 'Dos tramos exportables',
  type: 'wander-session',
  segments: session.segments.filter((segment) => segment.type === 'movement'),
});
assert.match(gpx, /<gpx version="1\.1"/);
assert.match(gpx, /xmlns="http:\/\/www\.topografix\.com\/GPX\/1\/1"/);
assert.match(gpx, /Prueba &amp; costa/);
assert.equal((gpx.match(/<trkseg>/g) || []).length, 2);
assert.equal((gpx.match(/<trkpt /g) || []).length, 4);
assert.match(gpx, /<time>2026-/);
assert.match(gpx, /<wander:accuracy>4\.2<\/wander:accuracy>/);
assert.match(gpx, /<wander:speedKmh>4\.50<\/wander:speedKmh>/);
assert.match(gpx, /<wander:heading>90\.0<\/wander:heading>/);

let nativeSave = null;
sandbox.Capacitor = {
  isNativePlatform: () => true,
  Plugins: {
    WanderLocation: {
      async saveGpx(payload) {
        nativeSave = payload;
        return { cancelled: false, uri: 'content://wander/test.gpx' };
      },
    },
  },
};
const exportResult = await sandbox.WanderTracks.exportSegment(session, session.segments[0]);
assert.equal(exportResult.cancelled, false);
assert.ok(nativeSave, 'Android export must use WanderLocation.saveGpx');
assert.match(nativeSave.filename, /^Wander_.*\.gpx$/);
assert.match(nativeSave.content, /<trkseg>/);
assert.equal((nativeSave.content.match(/<trkpt /g) || []).length, 2);
assert.match(tracksSource, /data\.logMovementDownload/);
assert.match(tracksSource, /Descargar track en formato GPX/);

console.log('PASS dashboard uses hybrid direction, track segments remain disconnected, and Bitácora tracks export valid GPX files');