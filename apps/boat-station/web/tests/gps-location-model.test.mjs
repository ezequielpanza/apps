import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LOCATION_RETENTION_HOURS,
  normalizeAnchorSettings,
  normalizeVesselConfig,
  distanceMeters,
  evaluateAnchorBoundary
} from '../gps-location-model.mjs';
import { boatFootprint, vesselPosition } from '../dashboard-model.mjs';

test('retention choices include disabled and one hour', () => {
  assert.deepEqual(LOCATION_RETENTION_HOURS, [0, 1, 3, 6, 12, 24]);
});

test('an unset anchor cannot become a point at zero coordinates', () => {
  const anchor = normalizeAnchorSettings({ enabled: true, lat: null, lon: null, radius: 30 });
  assert.equal(anchor.hasPoint, false);
  assert.equal(anchor.enabled, false);
  assert.equal(anchor.lat, null);
});

test('anchor distance uses meters and rejects uncertain boundary fixes', () => {
  const anchor = { enabled: true, lat: 0, lon: 0, radius: 30 };
  assert.ok(Math.abs(distanceMeters(anchor, { lat: 0, lon: 0.001 }) - 111.2) < 1);
  assert.equal(evaluateAnchorBoundary(anchor, { lat: 0, lon: 0.00036, accuracy: 15 }).alarm, false);
  const outside = evaluateAnchorBoundary(anchor, { lat: 0, lon: 0.001, accuracy: 5 });
  assert.equal(outside.alarm, true);
  assert.equal(evaluateAnchorBoundary(anchor, { lat: 0, lon: 0.001, accuracy: 5 }, true).alarm, false);
  const rearmed = evaluateAnchorBoundary(anchor, { lat: 0, lon: 0, accuracy: 5 }, true);
  assert.equal(rearmed.rearmed, true);
  assert.equal(rearmed.tripped, false);
});

test('vessel geometry uses configured dimensions and orientation', () => {
  const config = normalizeVesselConfig({ type: 'mono', length: 12.5, beam: 4.2 });
  const center = vesselPosition({ lat: 18, lon: -66, speedKts: 3, bearing: 90 }, null, config);
  assert.equal(center.heading, 90);
  const outline = boatFootprint(center, center.heading, config);
  assert.equal(outline.length, 1);
  assert.ok(outline[0].length >= 6);
});

test('Ubicación exposes the requested map and recording controls without a route toggle', () => {
  const gps = fs.readFileSync(new URL('../modules/gps-stable.js', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(gps, /name:'Ubicación'/);
  assert.match(gps, /data-gps-action='map-type'/);
  assert.doesNotMatch(gps, /gps-map-record|gps-route-new/);
  assert.match(app, /data-gps-retention/);
  assert.match(app, /\[0,'Desactivado'\]/);
  assert.match(app, /data-gps-anchor-pick/);
  assert.match(app, /data-gps-vessel-setting='length'/);
});
