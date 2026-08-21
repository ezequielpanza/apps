# Boat Station Core / Web architecture

## Versioning

- **Boat Station Core**: native Android container. Current baseline: `1.0.0`.
- **Boat Station Web**: independently deployable PWA/UI. Initial baseline: `0.2.0`.

The Core version only changes when native Android capabilities change. The Web version may change frequently without rebuilding the APK.

## Core responsibilities

- Android permissions and future hardware capabilities.
- Existing GPS, phone sensors, compass, BLE/BMS and data-folder bridges.
- Existing backup ZIP / GPX behavior.
- TTS bridge for spoken alarms.
- Loading Boat Station Web from Cloudflare.
- Bundled Web fallback when Cloudflare/Starlink is unavailable.

## Web responsibilities

- UI, cards, menus, layouts, graphs and interaction logic.
- Local/Remote presentation.
- PWA caching and web-version lifecycle.

## Runtime

The Core normally opens `https://boat-station-remote.pages.dev/?mode=station`. The same PWA can run in a normal browser as Remote. When `CoreBridge` exists it knows it is running on the Station; otherwise it is in Remote/browser mode.

If the cloud page cannot be reached on the Station, Core loads the bundled `index_v100.html` and injects the existing compatibility patches. Native stored data and backup files are separate from the Web application.

## Core bridge

`CoreBridge` exposes the stable container contract, initially including:

- `getCoreVersion()`
- `getMode()`
- `getCapabilities()`
- `isTtsReady()`
- `speak(text)`
- `stopSpeaking()`
- `reloadWeb()`
- `useBundledWeb()`

Existing `NativeBridge`, `StorageBridge`, and `V200Bridge` remain available for backward compatibility during the migration.
