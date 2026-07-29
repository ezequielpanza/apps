from pathlib import Path
import json

root = Path('apps/wander-travel')


def replace(path, old, new, count=1):
    target = root / path
    text = target.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f'{path}: expected {count} occurrence(s), found {actual}: {old[:100]!r}')
    target.write_text(text.replace(old, new, count))


# Direction cursor: keep a continuous rendered angle across 359° -> 0°.
replace(
    'runtime-direction-indicator.js',
    "  let smoothedHeading = null;\n  let directionMarker = null;",
    "  let smoothedHeading = null;\n  let renderedHeading = null;\n  let directionMarker = null;",
)
replace(
    'runtime-direction-indicator.js',
    "  function removeMarker() {\n    if (!directionMarker) return;\n    map.removeLayer(directionMarker);\n    directionMarker = null;\n  }",
    "  function removeMarker() {\n    if (directionMarker) map.removeLayer(directionMarker);\n    directionMarker = null;\n    renderedHeading = null;\n  }",
)
replace(
    'runtime-direction-indicator.js',
    "    const element = directionMarker.getElement();\n    const arrow = element?.querySelector?.('.wander-direction-arrow');\n    if (arrow) arrow.style.transform = `rotate(${nextState.heading}deg)`;",
    "    const element = directionMarker.getElement();\n    const arrow = element?.querySelector?.('.wander-direction-arrow');\n    const normalized = normalizeHeading(nextState.heading);\n    if (normalized !== null) {\n      if (renderedHeading === null) renderedHeading = normalized;\n      else {\n        const previousNormalized = normalizeHeading(renderedHeading);\n        const delta = ((normalized - previousNormalized + 540) % 360) - 180;\n        renderedHeading += delta;\n      }\n    }\n    if (arrow && renderedHeading !== null) arrow.style.transform = `rotate(${renderedHeading}deg)`;",
)

# The stable overlay also needs the same unwrapped transform.
replace(
    'app.js',
    "    let candidateAt = 0;\n    let smoothedHeading = null;",
    "    let candidateAt = 0;\n    let smoothedHeading = null;\n    let renderedHeading = null;",
)
replace(
    'app.js',
    "    function removeMarker() {\n      if (!marker) return;\n      map.removeLayer(marker);\n      marker = null;\n    }",
    "    function removeMarker() {\n      if (marker) map.removeLayer(marker);\n      marker = null;\n      renderedHeading = null;\n    }",
)
replace(
    'app.js',
    "      const element = marker.getElement?.();\n      const arrow = element?.querySelector?.('.wander-direction-arrow');\n      if (arrow) arrow.style.transform = `rotate(${heading}deg)`;",
    "      const element = marker.getElement?.();\n      const arrow = element?.querySelector?.('.wander-direction-arrow');\n      const normalizedHeading = normalized(heading);\n      if (normalizedHeading !== null) {\n        if (renderedHeading === null) renderedHeading = normalizedHeading;\n        else {\n          const previousNormalized = normalized(renderedHeading);\n          const delta = ((normalizedHeading - previousNormalized + 540) % 360) - 180;\n          renderedHeading += delta;\n        }\n      }\n      if (arrow && renderedHeading !== null) arrow.style.transform = `rotate(${renderedHeading}deg)`;",
)

# Missing storage previously became Number(null) === 0 ('No mostrar').
replace(
    'app.js',
    "      try {\n        const stored = Number(localStorage.getItem(STORAGE_KEY));\n        return OPTIONS.some((option) => option.value === stored) ? stored : DEFAULT_WINDOW_MS;\n      } catch { return DEFAULT_WINDOW_MS; }",
    "      try {\n        const raw = localStorage.getItem(STORAGE_KEY);\n        if (raw === null) return DEFAULT_WINDOW_MS;\n        const stored = Number(raw);\n        return OPTIONS.some((option) => option.value === stored) ? stored : DEFAULT_WINDOW_MS;\n      } catch { return DEFAULT_WINDOW_MS; }",
)

# Recording engine: one-second precise default and continuous anchors at stops.
replace('runtime-session-engine.js', '    minimumIntervalSec: 2,', '    minimumIntervalSec: 1,')
replace(
    'runtime-session-engine.js',
    "    Object.freeze({ id: 'precise', label: 'Preciso', intervalSec: 2, distanceM: 2, description: 'Más detalle para caminar, giros y recorridos cortos.' }),",
    "    Object.freeze({ id: 'precise', label: 'Preciso', intervalSec: 1, distanceM: 1, description: 'Un punto por segundo para caminar, giros y recorridos cortos.' }),",
)
replace(
    'runtime-session-engine.js',
    "    const profileId = PROFILE_BY_ID[raw.profileId] ? raw.profileId : 'balanced';",
    "    const profileId = PROFILE_BY_ID[raw.profileId] ? raw.profileId : 'precise';",
)
replace(
    'runtime-session-engine.js',
    "        RECORDING_LIMITS.maximumIntervalSec,\n        5\n      ),",
    "        RECORDING_LIMITS.maximumIntervalSec,\n        1\n      ),",
)
replace(
    'runtime-session-engine.js',
    "        RECORDING_LIMITS.maximumDistanceM,\n        5\n      ),",
    "        RECORDING_LIMITS.maximumDistanceM,\n        1\n      ),",
)
replace(
    'runtime-session-engine.js',
    "    return PROFILE_BY_ID[recordingSettings.profileId] || PROFILE_BY_ID.balanced;",
    "    return PROFILE_BY_ID[recordingSettings.profileId] || PROFILE_BY_ID.precise;",
)
replace(
    'runtime-session-engine.js',
    "    const normalized = PROFILE_BY_ID[profileId] ? profileId : 'balanced';",
    "    const normalized = PROFILE_BY_ID[profileId] ? profileId : 'precise';",
)
replace(
    'runtime-session-engine.js',
    "    if (motion === 'moving') {\n      if (!active) startSession(position, at);\n      const stay = openStay(active);\n      if (stay) closeStay(at);\n      if (!attachedVehicleId) attachVehicleFromPOI(position, at);\n      if (!openMovement(active)) createMovement(position, at);\n      else addMovementPoint(openMovement(active), position, at);",
    "    if (motion === 'moving') {\n      if (!active) startSession(position, at);\n      const stay = openStay(active);\n      let movement = openMovement(active);\n      if (stay) {\n        const closedStay = closeStay(at);\n        if (!movement) {\n          const anchor = {\n            ...position,\n            lat: finite(closedStay?.center?.lat) ?? position.lat,\n            lng: finite(closedStay?.center?.lng) ?? position.lng,\n            accuracy: finite(closedStay?.radiusM) ?? position.accuracy,\n          };\n          movement = createMovement(anchor, Number(closedStay?.endedAt || at));\n        }\n      }\n      if (!attachedVehicleId) attachVehicleFromPOI(position, at);\n      if (!movement) movement = createMovement(position, at);\n      else addMovementPoint(movement, position, at, Boolean(stay));",
)
replace(
    'runtime-session-engine.js',
    "        if (openMovement(active)) closeMovement(at);\n        const stay = reconcileStay(position, at);",
    "        const movement = openMovement(active);\n        if (movement) {\n          addMovementPoint(movement, position, at, true);\n          closeMovement(at);\n        }\n        const stay = reconcileStay(position, at);",
)

# Native sampling also permits and requests one-second fixes.
replace(
    'runtime-native-location-source.js',
    "    precise: Object.freeze({ intervalSec: 2, distanceM: 2 }),",
    "    precise: Object.freeze({ intervalSec: 1, distanceM: 1 }),",
)
replace(
    'runtime-native-location-source.js',
    "      const profileId = typeof stored?.profileId === 'string' ? stored.profileId : 'balanced';",
    "      const profileId = typeof stored?.profileId === 'string' ? stored.profileId : 'precise';",
)
replace(
    'runtime-native-location-source.js',
    "          intervalSec: clampInteger(stored?.manualIntervalSec, 2, 60, 5),",
    "          intervalSec: clampInteger(stored?.manualIntervalSec, 1, 60, 1),",
)
replace(
    'runtime-native-location-source.js',
    "      return { profileId: PRESETS[profileId] ? profileId : 'balanced', ...preset };",
    "      return { profileId: PRESETS[profileId] ? profileId : 'precise', ...preset };",
)
replace(
    'runtime-native-location-source.js',
    "      return { profileId: 'balanced', ...PRESETS.balanced };",
    "      return { profileId: 'precise', ...PRESETS.precise };",
)
replace(
    'runtime-native-location-source.js',
    "      minimumIntervalMs: clampInteger(config?.intervalSec, 2, 60, 5) * 1000,\n      minimumDistanceM: clampInteger(config?.distanceM, 1, 100, 5),",
    "      minimumIntervalMs: clampInteger(config?.intervalSec, 1, 60, 1) * 1000,\n      minimumDistanceM: clampInteger(config?.distanceM, 1, 100, 1),",
)
replace(
    'android/app/src/main/java/app/wandertravel/mobile/WanderLocationPlugin.java',
    '        intent.putExtra("minimumIntervalMs", Math.max(2000, call.getInt("minimumIntervalMs", 5000)));\n        intent.putExtra("minimumDistanceM", Math.max(0, call.getInt("minimumDistanceM", 5)));',
    '        intent.putExtra("minimumIntervalMs", Math.max(1000, call.getInt("minimumIntervalMs", 1000)));\n        intent.putExtra("minimumDistanceM", Math.max(0, call.getInt("minimumDistanceM", 1)));',
)
replace(
    'android/app/src/main/java/app/wandertravel/mobile/WanderLocationService.java',
    '        long minimumIntervalMs = intent == null ? 5000 : intent.getIntExtra("minimumIntervalMs", 5000);\n        float minimumDistanceM = intent == null ? 5 : intent.getIntExtra("minimumDistanceM", 5);',
    '        long minimumIntervalMs = intent == null ? 1000 : intent.getIntExtra("minimumIntervalMs", 1000);\n        float minimumDistanceM = intent == null ? 1 : intent.getIntExtra("minimumDistanceM", 1);',
)

# Brief GPS/sensor hesitations should not split a track immediately.
replace('runtime-sensor-motion-bridge.js', '  const STOP_CONFIRM_MS = 10000;', '  const STOP_CONFIRM_MS = 20000;')

# One-time migration: previous untouched default becomes Precise; explicit other profiles remain.
defaults = """(() => {
  const RECORDING_KEY = 'wander.recording.profile.v1';
  const RECORDING_MIGRATION_KEY = 'wander.recording.default.1s.v1';
  const RECENT_TRACKS_KEY = 'wander.tracks.recent.window.v1';
  const LAST_24_HOURS_MS = 24 * 60 * 60 * 1000;

  try {
    if (localStorage.getItem(RECENT_TRACKS_KEY) === null) {
      localStorage.setItem(RECENT_TRACKS_KEY, String(LAST_24_HOURS_MS));
    }
  } catch {}

  try {
    if (localStorage.getItem(RECORDING_MIGRATION_KEY) === 'done') return;
    const raw = JSON.parse(localStorage.getItem(RECORDING_KEY) || 'null') || {};
    if (!raw.profileId || raw.profileId === 'balanced') raw.profileId = 'precise';
    localStorage.setItem(RECORDING_KEY, JSON.stringify(raw));
    localStorage.setItem(RECORDING_MIGRATION_KEY, 'done');
  } catch {}
})();
"""
(root / 'runtime-default-migrations.js').write_text(defaults)

replace(
    'index.html',
    '<script src="runtime-version.js?v=20260718-10"></script>\n<script src="runtime-platform.js?v=20260718-01"></script>',
    '<script src="runtime-version.js?v=20260718-10"></script>\n<script src="runtime-default-migrations.js?v=20260729-01"></script>\n<script src="runtime-platform.js?v=20260718-01"></script>',
)
replace('sw.js', "const SHELL_REVISION = '20260728-03';", "const SHELL_REVISION = '20260729-01';")
replace(
    'sw.js',
    "  './runtime-version.js',\n  './runtime-platform.js',",
    "  './runtime-version.js',\n  './runtime-default-migrations.js',\n  './runtime-platform.js',",
)

# Versions.
replace('runtime-version.js', "const VERSION = 'v0.109.6';", "const VERSION = 'v0.109.7';")
package_path = root / 'package.json'
package = json.loads(package_path.read_text())
package['version'] = '0.109.7'
package_path.write_text(json.dumps(package, indent=2) + '\n')
manifest_path = root / 'manifest.webmanifest'
manifest = json.loads(manifest_path.read_text())
manifest['start_url'] = './?app=v0.109.7'
manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
android_path = root / 'android-version.json'
android = json.loads(android_path.read_text())
android['versionName'] = '0.11.8'
android['versionCode'] = 24
android_path.write_text(json.dumps(android, indent=2) + '\n')

# Update version expectations in tests.
for test in (root / 'tests').glob('*.mjs'):
    text = test.read_text()
    text = text.replace('v0.109.6', 'v0.109.7').replace('0.109.6', '0.109.7')
    text = text.replace("'0.11.7'", "'0.11.8'")
    text = text.replace('versionCode, 23', 'versionCode, 24')
    test.write_text(text)

shell_test = root / 'tests/test-wander-app-shell.mjs'
text = shell_test.read_text()
anchor = "const cloudProvisioner = read('scripts/ensure-cloudflare-backup-kv.mjs');"
if anchor not in text:
    raise SystemExit('test-wander-app-shell.mjs: insertion anchor missing')
text = text.replace(anchor, anchor + "\nconst defaultsRuntime = read('runtime-default-migrations.js');", 1)
assertions_anchor = "assert.match(sessionEngine, /type: 'movement'/);"
if assertions_anchor not in text:
    raise SystemExit('test-wander-app-shell.mjs: assertion anchor missing')
assertions = """assert.match(defaultsRuntime, /LAST_24_HOURS_MS = 24 \\* 60 \\* 60 \\* 1000/);
assert.match(defaultsRuntime, /raw\\.profileId === 'balanced'/);
assert.match(app, /if \\(raw === null\\) return DEFAULT_WINDOW_MS/);
assert.match(direction, /renderedHeading \\+= delta/);
assert.match(app, /renderedHeading \\+= delta/);
assert.match(sessionEngine, /minimumIntervalSec: 1/);
assert.match(sessionEngine, /intervalSec: 1, distanceM: 1/);
assert.match(sessionEngine, /addMovementPoint\\(movement, position, at, true\\);\\s*closeMovement\\(at\\)/s);
assert.match(sessionEngine, /lat: finite\\(closedStay\\?\\.center\\?\\.lat\\)/);
assert.match(sensorMotionBridge, /STOP_CONFIRM_MS = 20000/);
assert.match(locationService, /minimumIntervalMs = intent == null \\? 1000/);
assert.match(locationPlugin, /Math\\.max\\(1000, call\\.getInt\\(\"minimumIntervalMs\", 1000\\)\\)/);

""" + assertions_anchor
text = text.replace(assertions_anchor, assertions, 1)
shell_test.write_text(text)
