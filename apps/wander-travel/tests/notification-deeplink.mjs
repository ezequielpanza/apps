import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

const plugin = read('android/app/src/main/java/app/wandertravel/mobile/WanderNotificationPlugin.java');
const activity = read('android/app/src/main/java/app/wandertravel/mobile/MainActivity.java');
const platform = read('runtime-platform.js');
const router = read('runtime-notification-router.js');
const room = read('runtime-room-companion.js');
const panel = read('runtime-interaction-panel.js');
const css = read('wander-interaction.css');

assert.match(plugin, /EXTRA_NOTIFICATION_ID/);
assert.match(plugin, /EXTRA_INTERACTION_ID/);
assert.match(plugin, /EXTRA_INTERVENTION_ID/);
assert.match(plugin, /EXTRA_NOTIFICATION_TARGET/);
assert.match(plugin, /openIntent\.setData\(Uri\.parse\("wander:\/\/notification\//);
assert.match(plugin, /PendingIntent\.FLAG_UPDATE_CURRENT \| PendingIntent\.FLAG_IMMUTABLE/);
assert.match(plugin, /void consumePendingOpen\(PluginCall call\)/);
assert.match(plugin, /notifyListeners\("notificationOpened"/);
assert.match(plugin, /static void captureOpenIntent\(Intent intent\)/);
assert.match(activity, /protected void onNewIntent\(Intent intent\)/);
assert.match(activity, /WanderNotificationPlugin\.captureOpenIntent\(intent\)/);
assert.match(platform, /addListener\('notificationOpened'/);
assert.match(platform, /consumePendingOpen/);
assert.match(platform, /wander:notification-opened/);
assert.match(platform, /interactionId: interactionId \|\| id/);
assert.match(router, /target === 'room-prompt'/);
assert.match(router, /WanderInteractionPanel\?\.focus/);
assert.match(room, /notificationTarget: 'room-prompt'/);
assert.match(room, /function openNotification\(id\)/);
assert.match(room, /target: intervention\.notificationTarget/);
assert.match(panel, /dataset\.interactionId/);
assert.match(panel, /dataset\.interventionId/);
assert.match(panel, /function focus\(id\)/);
assert.match(css, /is-notification-target/);

console.log('PASS Android notification taps route to their Wander interaction');
