import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'runtime-navigation.js'), 'utf8');

const messages = [];
const contextValues = [];
let routePoints = null;
const context = {
  getEffectiveLocation: () => ({ lat: 38.5, lng: -120.2 }),
  subscribe() {},
  set(key, value) { contextValues.push({ key, value }); },
};
const route = {
  setLatLngs(points) { routePoints = points; },
  getBounds: () => ({ isValid: () => true }),
};
const sandbox = {
  window: {
    WanderContext: context,
    WanderUI: { showWander(title, message, options) { messages.push({ title, message, options }); return true; } },
    WanderMapCore: { route, map: { fitBounds() {} } },
  },
  Date,
  setTimeout: (callback) => { callback(); return 1; },
  clearTimeout() {},
  fetch: async () => new Response(JSON.stringify({
    ok: true,
    route: {
      distanceM: 650,
      durationSeconds: 480,
      encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
      steps: [{ distanceM: 120, maneuver: 'TURN_RIGHT', encodedPolyline: '_p~iF~ps|U_ulLnnqC' }],
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } }),
  Response,
};
vm.runInNewContext(source, sandbox, { filename: 'runtime-navigation.js' });

const navigation = sandbox.window.WanderNavigation;
assert.equal(
  JSON.stringify(navigation.decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')),
  JSON.stringify([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]),
);
assert.equal(navigation.maneuverText('TURN_RIGHT'), 'Girá a la derecha');

await navigation.start({ id: 'poi:test', name: 'Destino', lat: 40.7, lng: -120.95 });
assert.equal(routePoints.length, 3);
assert.equal(contextValues.at(-1).value.status, 'active');
assert.equal(messages.some((item) => /condiciones de aceras/.test(item.message)), true);
assert.equal(messages.at(-1).message, 'Girá a la derecha durante 120 metros.');
console.log('PASS Llévame decodes, displays, and begins following a walking route');
