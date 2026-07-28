import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

for (const file of ['app.js', 'runtime-map-core.js', 'runtime-map-crosshair.js', 'runtime-travel-log-screen.js']) {
  assert.doesNotThrow(() => new Function(read(file)), `${file} must parse as JavaScript`);
}

const app = read('app.js');
const crosshair = read('runtime-map-crosshair.js');
const travelLog = read('runtime-travel-log-screen.js');
const mapCore = read('runtime-map-core.js');

const localStart = app.indexOf('Promise.allSettled([');
const cloudStart = app.indexOf('cloudBootstrap.then((cloudResult)');
assert.ok(localStart >= 0 && cloudStart > localStart, 'Local modules must initialize before cloud backup completion');
assert.doesNotMatch(app, /await loadCloudBackup\(\)/);
assert.match(app, /loadDirectionIndicator\(\),\s*loadMapCrosshair\(\),\s*loadTravelMemory\(\)/s);

assert.match(crosshair, /return position\.isFollowingPosition\?\.\(\) !== true/);
assert.match(crosshair, /const bearingDeg = bearingTo\(here, target\)/);
assert.match(crosshair, /const distanceM = map\.distance\(here, target\)/);
assert.match(crosshair, /map-point-marker/);

assert.match(travelLog, /movementItemsForDay/);
assert.match(travelLog, /previousStay/);
assert.match(travelLog, /nextStay/);
assert.match(travelLog, /Track entre detenciones/);
assert.match(travelLog, /window\.WanderScreen\?\.open\?\.\('map'\)/);
assert.doesNotMatch(travelLog, /open\?\.\('routes'\)/);

assert.match(mapCore, /result\.fallback === true/);
assert.match(mapCore, /context\.drawImage\(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 256, 256\)/);

console.log('PASS local-first modules parse and expose integrated travel timeline, crosshair metrics, and offline zoom fallback');
