import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidRoot = path.join(ROOT, 'android');
const manifest = fs.readFileSync(path.join(androidRoot, 'app/src/main/AndroidManifest.xml'), 'utf8');
const service = fs.readFileSync(
  path.join(androidRoot, 'app/src/main/java/app/wandertravel/mobile/WanderLocationService.java'),
  'utf8'
);
const plugin = fs.readFileSync(
  path.join(androidRoot, 'app/src/main/java/app/wandertravel/mobile/WanderLocationPlugin.java'),
  'utf8'
);

assert.match(manifest, /FOREGROUND_SERVICE_LOCATION/);
assert.match(manifest, /foregroundServiceType="location"/);
assert.match(manifest, /stopWithTask="true"/);
assert.doesNotMatch(manifest, /ACCESS_BACKGROUND_LOCATION/);
assert.match(service, /startForeground\(/);
assert.match(service, /START_NOT_STICKY/);
assert.match(service, /onTaskRemoved/);
assert.match(service, /stopSelf\(\)/);
assert.match(plugin, /notifyCompanion/);
assert.match(plugin, /BigTextStyle/);

console.log('PASS Android accompanies in foreground/background and stops with the user task');
