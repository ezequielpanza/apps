import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

const config = read('runtime-persistence-config.js');
const storage = read('runtime-google-drive-storage.js');
const settings = read('runtime-google-drive-settings.js');
const mapRuntime = read('runtime-map.js');
const plugin = read('android/app/src/main/java/app/wandertravel/mobile/WanderGoogleDrivePlugin.java');
const mainActivity = read('android/app/src/main/java/app/wandertravel/mobile/MainActivity.java');
const gradle = read('android/app/build.gradle');

for (const [name, source] of [
  ['runtime-persistence-config.js', config],
  ['runtime-google-drive-storage.js', storage],
  ['runtime-google-drive-settings.js', settings],
]) assert.doesNotThrow(() => new Function(source), `${name} must parse as JavaScript`);

assert.match(config, /provider: 'google-drive-oauth'/);
assert.match(config, /endpoint: '\/__wander_google_drive_persistence__'/);
assert.match(config, /get spreadsheetId\(\)/);
assert.match(config, /get tracksFolderId\(\)/);
assert.doesNotMatch(config, /11hQDPp2nKDyaI8SHvRwPujIgGSN15Mt1_AlbQ6WxRCU/);
assert.doesNotMatch(config, /1LlNCtOA5vLlxyP-ltiL8GRwerTtNES1W/);

assert.match(plugin, /Scopes\.DRIVE_FILE/);
assert.doesNotMatch(plugin, /Scopes\.DRIVE\b/);
assert.match(plugin, /PICKER_ALLOW_FOLDER_SELECTION/);
assert.match(plugin, /PICKER_FILE_IDS/);
assert.match(plugin, /PICKER_ALLOW_MULTIPLE/);
assert.match(plugin, /public void pickStorageFolder\(PluginCall call\)/);
assert.match(plugin, /public void pickExistingStorageItems\(PluginCall call\)/);
assert.match(plugin, /public void getAccessToken\(PluginCall call\)/);
assert.match(plugin, /public void disconnect\(PluginCall call\)/);
assert.match(plugin, /AuthorizationRequest\.Prompt\.CONSENT/);
assert.match(plugin, /AuthorizationRequest\.Prompt\.SELECT_ACCOUNT/);
assert.match(mainActivity, /registerPlugin\(WanderGoogleDrivePlugin\.class\)/);
assert.match(gradle, /com\.google\.android\.gms:play-services-auth:21\.6\.0/);

assert.match(storage, /scope: 'https:\/\/www\.googleapis\.com\/auth\/drive\.file'/);
assert.match(storage, /APP_ROOT_NAME = 'Wander'/);
assert.match(storage, /DATA_FOLDER_NAME = 'Data'/);
assert.match(storage, /TRACKS_FOLDER_NAME = 'Tracks'/);
assert.match(storage, /SPREADSHEET_NAME = 'Wander'/);
assert.match(storage, /database \|\| ''\) === 'Wander'/);
assert.match(storage, /Number\(meta\.schemaVersion \|\| 0\) >= 1/);
assert.match(storage, /ensureSheetTabs/);
assert.match(storage, /ensureHeaders/);
assert.match(storage, /missing = expected\.filter/);
assert.match(storage, /appsScriptStatus: 'retired'/);
assert.match(storage, /wander\.googleDrive\.storage\.v2/);
assert.match(storage, /memoryToken = null/);
assert.doesNotMatch(storage, /localStorage\.setItem\([^\n]*accessToken/);

for (const id of [
  '1L0cZoovdzh5__KV6Ql1If9sUZ-oKEJ3I',
  '1qwnmYAuAnnCsj9kjCun_FteI2fmAzXhP',
  '1LlNCtOA5vLlxyP-ltiL8GRwerTtNES1W',
  '11hQDPp2nKDyaI8SHvRwPujIgGSN15Mt1_AlbQ6WxRCU',
]) assert.match(storage, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'Legacy migration IDs should live only in migration compatibility code');

assert.match(settings, />Conectar Google</);
assert.match(settings, />Cambiar ubicación</);
assert.match(settings, />Sincronizar ahora</);
assert.match(settings, />Reconfigurar</);
assert.match(settings, />Desconectar</);
assert.match(settings, /Estructura encontrada/);
assert.match(settings, /Wander\/Data\/Wander/);
assert.match(settings, /Wander\/Tracks/);
assert.match(settings, /No borra archivos de Drive ni los datos guardados en el teléfono/);

assert.match(mapRuntime, /runtime-google-drive-storage\.js/);
assert.match(mapRuntime, /runtime-google-drive-settings\.js/);
const coreReadyIndex = mapRuntime.indexOf('announceCoreReady');
const storageBootstrapIndex = mapRuntime.indexOf('bootstrapPersistence();');
assert.ok(storageBootstrapIndex >= 0 && coreReadyIndex > storageBootstrapIndex, 'Google storage may bootstrap but must not await before core-ready');
assert.doesNotMatch(mapRuntime, /await\s+bootstrapPersistence/);

console.log('PASS user-scoped Google Drive OAuth storage: drive.file only, reusable Wander/Data/Tracks structure, schema-safe Sheets and offline-first bootstrap');
