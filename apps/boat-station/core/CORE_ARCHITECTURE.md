# Boat Station Core / Web architecture

## Principle

Boat Station has one application UI: `apps/boat-station/web/index.html` and the modules/scripts referenced from that web root. The browser, installed PWA and Android Core all use that same deployed PWA. There are no versioned HTML copies, deploy-time UI injection scripts or compatibility patches.

## Versioning

- **Boat Station Core** is the native Android container. Its version changes only when native capabilities or the Android shell change.
- **Boat Station Web** is the PWA/UI and can be deployed independently without rebuilding the APK.
- Android runtime version reporting must come from the Gradle/BuildConfig application version rather than independent UI patch versions.

## Core responsibilities

- Android permissions and hardware access.
- GPS, phone status, motion/orientation and compass sensors.
- BLE/BMS access and persistent native battery configuration.
- Data-folder storage, backup ZIP and GPX import/export.
- TTS/alarm and native QR generation.
- Loading the canonical PWA from `https://boat-station.pages.dev/?mode=station`.
- Providing a minimal native bootstrap/offline error shell; application UI does not live in Android assets.

## Web responsibilities

- All application UI, cards, menus, layouts, graphs and interaction logic.
- Local station and remote browser presentation.
- Module state and presentation logic.
- Station pairing and remote snapshot synchronization.
- PWA service-worker caching and web lifecycle.

## Runtime

`MainActivityCore` opens `https://boat-station.pages.dev/?mode=station`. The same root URL without local Core bridges runs as the remote browser/PWA client.

Local/station mode is detected by `mode=station` or the presence of a native Core bridge. In local mode, `app.js` and native adapters are loaded. In remote mode, the browser renders the snapshot published by the selected station.

The Android asset `index.html` is only a neutral startup bootstrap inherited from the low-level native shell. It contains no Boat Station application UI or application logic.

## Native bridge contract

- `CoreBridge`: stable Core capabilities such as mode/version, sensors, TTS/alarm and reload.
- `NativeBridge`: BLE/BMS and lower-level hardware configuration inherited from the native layer.
- `StorageBridge`: data-folder, backup and persistent storage operations.
- `NativeToolsBridge`: native QR and GPX file operations.
- `BoatStationTools`: Web-facing adapter over `NativeToolsBridge`.
- `window.BoatStation`: callbacks from native code into the active Web modules (`updateGPS`, `updatePhone`, `updateCompass`, `updateMotion`, battery/BLE callbacks).

## Maintenance rule

Do not add `patch_*`, versioned `index_v*`, runtime DOM-fix scripts, or deployment steps that mutate `index.html`. A required behavior must be implemented in the canonical Web module, stylesheet, bridge, native class or workflow that owns that behavior. CI intentionally rejects `/clean/` references and Web `patch_*` files.
