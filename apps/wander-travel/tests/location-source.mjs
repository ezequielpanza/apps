import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function load(sandbox, file) {
  new vm.Script(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file })
    .runInContext(sandbox);
}

let browserCallbacks = null;
let clearedWatch = null;
const writes = [];
const browserSandbox = {
  console,
  Date,
  Math,
  navigator: {
    geolocation: {
      watchPosition(onPosition, onError, options) {
        browserCallbacks = { onPosition, onError, options };
        return 23;
      },
      clearWatch(id) { clearedWatch = id; },
    },
  },
  WanderContext: {
    setRealLocation(payload) { writes.push(['location', payload]); },
    setRealLocationStatus(status, options) { writes.push(['status', status, options]); },
    set() {},
  },
};
browserSandbox.window = browserSandbox;
browserSandbox.globalThis = browserSandbox;
const browserContext = vm.createContext(browserSandbox);

load(browserContext, 'runtime-location-source.js');
load(browserContext, 'runtime-provider-location.js');

assert.equal(browserContext.WanderProviders.location.isWatching(), true);
assert.equal(browserContext.WanderProviders.location.getSourceInfo().id, 'browser-geolocation');
assert.equal(browserContext.WanderProviders.location.getSourceInfo().capabilities.background, false);
assert.equal(browserCallbacks.options.enableHighAccuracy, true);

browserCallbacks.onPosition({
  coords: { latitude: 18.472, longitude: -69.91, accuracy: 8, altitude: null, heading: null, speed: 0 },
  timestamp: 1000,
});
assert.equal(writes.some(([type, payload]) => type === 'location' && payload.lat === 18.472), true);

browserContext.WanderProviders.location.stop();
assert.equal(clearedWatch, 23);
assert.equal(browserContext.WanderProviders.location.isWatching(), false);

let nativeStarted = false;
const nativeSandbox = {
  console,
  Date,
  Math,
  navigator: {},
  WanderContext: {
    setRealLocation() {},
    setRealLocationStatus() {},
    set() {},
  },
  WanderNativeLocationSource: {
    id: 'native-background-location',
    capabilities: { background: true, stopsWhenClosed: true },
    isSupported: () => true,
    start() { nativeStarted = true; return true; },
    stop() {},
    isWatching: () => nativeStarted,
  },
};
nativeSandbox.window = nativeSandbox;
nativeSandbox.globalThis = nativeSandbox;
const nativeContext = vm.createContext(nativeSandbox);

load(nativeContext, 'runtime-location-source.js');
load(nativeContext, 'runtime-provider-location.js');

assert.equal(nativeStarted, true);
assert.equal(nativeContext.WanderProviders.location.getSourceInfo().id, 'native-background-location');
assert.equal(nativeContext.WanderProviders.location.getSourceInfo().capabilities.background, true);

console.log('PASS location provider selects web or native source without changing context consumers');
