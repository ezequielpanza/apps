from pathlib import Path
import re

ROOT = Path('apps/wander-travel')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one literal match, found {count}')
    write(path, text.replace(old, new, 1))


def sub_once(path, pattern, replacement, flags=re.S):
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{path}: expected one regex match, found {count}: {pattern}')
    write(path, updated)


# 1. Session engine: retain every accepted native/effective sample as raw data,
# compact it only when persisted, and leave movement/stay interpretation separate.
replace_once(
    'runtime-session-engine.js',
    "  let sessions = loadArray(SESSIONS_KEY);\n  let active = loadObject(ACTIVE_KEY);",
    "  let sessions = loadArray(SESSIONS_KEY).map(inflateSession).filter(Boolean);\n  let active = inflateSession(loadObject(ACTIVE_KEY));"
)

replace_once(
    'runtime-session-engine.js',
    "    minimumDistanceM: 1,",
    "    minimumDistanceM: 0,"
)
replace_once(
    'runtime-session-engine.js',
    "Object.freeze({ id: 'precise', label: 'Preciso', intervalSec: 1, distanceM: 1, description: 'Un punto por segundo para caminar, giros y recorridos cortos.' })",
    "Object.freeze({ id: 'precise', label: 'Preciso RAW', intervalSec: 1, distanceM: 0, description: 'Guarda cada posición aceptada, una vez por segundo, sin filtrar por distancia.' })"
)
replace_once(
    'runtime-session-engine.js',
    "        1\n      ),\n    };\n  }\n\n  function recordingProfile()",
    "        0\n      ),\n    };\n  }\n\n  function recordingProfile()"
)

sub_once(
    'runtime-session-engine.js',
    r"  function loadObject\(key\) \{.*?\n  \}\n\n  function finite",
    """  function loadObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }

  function inflatePoint(point) {
    if (!Array.isArray(point)) return point && typeof point === 'object' ? point : null;
    const lat = Number(point[0]);
    const lng = Number(point[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat: lat / 1e7,
      lng: lng / 1e7,
      at: Number(point[2]) || Date.now(),
      accuracy: point[3] == null ? null : Number(point[3]),
      speedKmh: point[4] == null ? null : Number(point[4]),
      heading: point[5] == null ? null : Number(point[5]),
      altitude: point[6] == null ? null : Number(point[6]),
      source: point[7] || 'unknown',
      permissionPrecision: point[8] || null,
      raw: true,
    };
  }

  function compactPoint(point) {
    return [
      Math.round(Number(point.lat) * 1e7),
      Math.round(Number(point.lng) * 1e7),
      Number(point.at) || Date.now(),
      point.accuracy == null ? null : Number(point.accuracy),
      point.speedKmh == null ? null : Number(point.speedKmh),
      point.heading == null ? null : Number(point.heading),
      point.altitude == null ? null : Number(point.altitude),
      point.source || null,
      point.permissionPrecision || null,
    ];
  }

  function inflateSession(session) {
    if (!session || typeof session !== 'object' || Array.isArray(session)) return null;
    return {
      ...session,
      schemaVersion: Math.max(2, Number(session.schemaVersion || 1)),
      segments: (Array.isArray(session.segments) ? session.segments : []).map((segment) => ({
        ...segment,
        raw: segment?.type === 'movement' ? true : segment?.raw,
        points: (Array.isArray(segment?.points) ? segment.points : []).map(inflatePoint).filter(Boolean),
      })),
      stays: Array.isArray(session.stays) ? session.stays : [],
      events: Array.isArray(session.events) ? session.events : [],
    };
  }

  function compactSession(session) {
    if (!session || typeof session !== 'object') return session;
    return {
      ...session,
      schemaVersion: 2,
      segments: (session.segments || []).map((segment) => segment?.type === 'movement'
        ? { ...segment, raw: true, points: (segment.points || []).map(compactPoint) }
        : { ...segment }),
    };
  }

  function finite"""
)

replace_once(
    'runtime-session-engine.js',
    "      altitude: finite(location.altitude),\n      heading: finite(location.heading)," if "      altitude: finite(location.altitude),\n      heading: finite(location.heading)," in read('runtime-session-engine.js') else "      heading: finite(location.heading),",
    "      altitude: finite(location.altitude),\n      heading: finite(location.heading),\n      provider: location.provider || null,\n      permissionPrecision: location.permissionPrecision || null," if "      altitude: finite(location.altitude),\n      heading: finite(location.heading)," in read('runtime-session-engine.js') else "      altitude: finite(location.altitude),\n      heading: finite(location.heading),\n      provider: location.provider || null,\n      permissionPrecision: location.permissionPrecision || null,"
)

replace_once(
    'runtime-session-engine.js',
    "      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));\n      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));\n      if (active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));",
    "      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.map(compactSession)));\n      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));\n      if (active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(compactSession(active)));"
)

replace_once('runtime-session-engine.js', '      schemaVersion: 1,', '      schemaVersion: 2,')
replace_once(
    'runtime-session-engine.js',
    "      recording: recordingConfig(),\n      points: [],",
    "      recording: recordingConfig(),\n      raw: true,\n      points: [],"
)

sub_once(
    'runtime-session-engine.js',
    r"  function addMovementPoint\(segment, position, at, force = false\) \{.*?\n  \}\n\n  function closeMovement",
    """  function addMovementPoint(segment, position, at, force = false) {
    if (!segment || !validPosition(position)) return false;
    const point = {
      lat: Number(position.lat.toFixed(7)),
      lng: Number(position.lng.toFixed(7)),
      at,
      accuracy: finite(position.accuracy),
      speedKmh: finite(position.speedKmh),
      heading: finite(position.heading),
      altitude: finite(position.altitude),
      source: position.provider || position.source || 'unknown',
      permissionPrecision: position.permissionPrecision || null,
      raw: true,
    };
    const last = segment.points[segment.points.length - 1];
    if (last) {
      const sameTimestamp = Number(last.at) === Number(point.at);
      const sameCoordinate = Number(last.lat) === point.lat && Number(last.lng) === point.lng;
      if (sameTimestamp && sameCoordinate) return false;
      const distance = distanceMeters(last, point);
      const elapsedMs = Math.max(1, at - Number(last.at || at));
      const plausibleSpeedKmh = (distance / 1000) / (elapsedMs / 3600000);
      if (elapsedMs >= 250 && plausibleSpeedKmh <= 250) {
        segment.distanceM = Math.round(Number(segment.distanceM || 0) + distance);
      }
    }
    segment.points.push(point);
    return true;
  }

  function closeMovement"""
)

# 2. Native sampling: precise/raw means time based, with no minimum movement distance.
replace_once(
    'runtime-native-location-source.js',
    "precise: Object.freeze({ intervalSec: 1, distanceM: 1 })",
    "precise: Object.freeze({ intervalSec: 1, distanceM: 0 })"
)
replace_once(
    'runtime-native-location-source.js',
    "distanceM: clampInteger(stored?.manualDistanceM, 1, 100, 1)",
    "distanceM: clampInteger(stored?.manualDistanceM, 0, 100, 0)"
)
replace_once(
    'runtime-native-location-source.js',
    "minimumDistanceM: clampInteger(config?.distanceM, 1, 100, 1)",
    "minimumDistanceM: clampInteger(config?.distanceM, 0, 100, 0)"
)
replace_once(
    'android/app/src/main/java/app/wandertravel/mobile/WanderLocationService.java',
    'float minimumDistanceM = intent == null ? 1 : intent.getIntExtra("minimumDistanceM", 1);',
    'float minimumDistanceM = intent == null ? 0 : intent.getIntExtra("minimumDistanceM", 0);'
)
replace_once(
    'android/app/src/main/java/app/wandertravel/mobile/WanderLocationPlugin.java',
    'call.getInt("minimumDistanceM", 1)',
    'call.getInt("minimumDistanceM", 0)'
)

# Keep enough native raw journal capacity for roughly a full day at one sample/second.
replace_once(
    'android/app/src/main/java/app/wandertravel/mobile/WanderLocationJournal.java',
    'private static final long MAX_BYTES = 12L * 1024L * 1024L;\n    private static final int RETAINED_ROWS = 40000;',
    'private static final long MAX_BYTES = 32L * 1024L * 1024L;\n    private static final int RETAINED_ROWS = 100000;'
)

# 3. Stop confirmation: dynamic accuracy-aware radius, speed by mode and accelerometer corroboration.
replace_once(
    'runtime-sensor-motion-bridge.js',
    "  const STOP_CONFIRM_MS = 20000;",
    "  const STOP_CONFIRM_MS = 20000;\n  const STOP_MIN_RADIUS_M = 8;\n  const STOP_MAX_RADIUS_M = 25;\n  const STOP_MAX_ACCURACY_M = 40;\n  const WALK_STOP_SPEED_KMH = 1.5;\n  const VEHICLE_STOP_SPEED_KMH = 3;"
)
sub_once(
    'runtime-sensor-motion-bridge.js',
    r"  function stationaryEvidence\(result\) \{.*?\n  \}\n\n  function applyStableMotion",
    """  function stopSpeedThresholdKmh() {
    const mode = String(context.value('mobility.methodId') || context.value('mobility.mode') || '').toLowerCase();
    return ['car', 'driving', 'vehicle', 'boat', 'sailing', 'motorboat', 'cycling', 'bicycle', 'bus', 'train'].includes(mode)
      ? VEHICLE_STOP_SPEED_KMH
      : WALK_STOP_SPEED_KMH;
  }

  function stationaryEvidence(result) {
    const evidence = result?.motionEvidence || {};
    const motionStatus = String(result?.motion?.status || '').toLowerCase();
    const speed = finite(result?.speedKmh) || 0;
    const spread = finite(evidence.stationaryWindowSpreadM);
    const accuracy = Math.max(3, finite(evidence.accuracyM) || 10);
    if (accuracy > STOP_MAX_ACCURACY_M) return false;
    const radiusM = Math.max(STOP_MIN_RADIUS_M, Math.min(STOP_MAX_RADIUS_M, accuracy * 1.5));
    const stableCluster = Number.isFinite(spread) && spread <= radiusM;
    const lowSpeed = speed <= stopSpeedThresholdKmh();
    const sensorQuiet = !state.active;
    return stableCluster && (motionStatus === 'stationary' || (lowSpeed && sensorQuiet));
  }

  function applyStableMotion"""
)
replace_once(
    'runtime-sensor-motion-bridge.js',
    "      STOP_CONFIRM_MS,\n    },",
    "      STOP_CONFIRM_MS,\n      STOP_MIN_RADIUS_M,\n      STOP_MAX_RADIUS_M,\n      STOP_MAX_ACCURACY_M,\n      WALK_STOP_SPEED_KMH,\n      VEHICLE_STOP_SPEED_KMH,\n    },"
)

# 4. Track rendering: raw is the source of truth; smoothing is visual and opt-in.
replace_once(
    'runtime-tracks.js',
    "  const CURRENT_TRACK_VISIBLE_KEY = 'wander.tracks.current.visible.v1';\n  let currentTrackVisible = loadCurrentTrackVisibility();",
    "  const CURRENT_TRACK_VISIBLE_KEY = 'wander.tracks.current.visible.v1';\n  const TRACK_SMOOTHING_KEY = 'wander.tracks.display.smoothing.v1';\n  let currentTrackVisible = loadCurrentTrackVisibility();\n  let smoothingEnabled = loadSmoothingEnabled();"
)
sub_once(
    'runtime-tracks.js',
    r"  function persistCurrentTrackVisibility\(\) \{.*?\n  \}\n\n  function validPoint",
    """  function persistCurrentTrackVisibility() {
    try { localStorage.setItem(CURRENT_TRACK_VISIBLE_KEY, String(currentTrackVisible)); } catch {}
    window.WanderContext?.set?.('sessions.currentTrackVisible', currentTrackVisible, {
      source: 'tracks-ui',
      kind: 'confirmed',
      confidence: 1,
      ttlMs: Infinity,
    });
  }

  function loadSmoothingEnabled() {
    try { return localStorage.getItem(TRACK_SMOOTHING_KEY) === 'true'; }
    catch { return false; }
  }

  function persistSmoothingEnabled() {
    try { localStorage.setItem(TRACK_SMOOTHING_KEY, String(smoothingEnabled)); } catch {}
    window.WanderContext?.set?.('sessions.trackSmoothingEnabled', smoothingEnabled, {
      source: 'tracks-ui', kind: 'confirmed', confidence: 1, ttlMs: Infinity,
    });
  }

  function validPoint"""
)

replace_once(
    'runtime-tracks.js',
    "  function sessionLatLngSegments(session) {\n    return sessionMovementSegments(session)\n      .map((segment) => segment.points.map((point) => [Number(point.lat), Number(point.lng)]));\n  }",
    """  function displayLatLngs(points, options = {}) {
    const raw = (points || []).filter(validPoint);
    const smooth = options.smooth ?? smoothingEnabled;
    if (!smooth || raw.length < 3) return raw.map((point) => [Number(point.lat), Number(point.lng)]);
    const radius = 2;
    return raw.map((point, index) => {
      if (index === 0 || index === raw.length - 1) return [Number(point.lat), Number(point.lng)];
      let lat = 0;
      let lng = 0;
      let total = 0;
      const start = Math.max(0, index - radius);
      const end = Math.min(raw.length - 1, index + radius);
      for (let sampleIndex = start; sampleIndex <= end; sampleIndex += 1) {
        const sample = raw[sampleIndex];
        const triangular = radius + 1 - Math.abs(sampleIndex - index);
        const accuracy = Number(sample.accuracy);
        const accuracyWeight = 1 / Math.max(4, Number.isFinite(accuracy) ? accuracy : 8);
        const weight = triangular * accuracyWeight;
        lat += Number(sample.lat) * weight;
        lng += Number(sample.lng) * weight;
        total += weight;
      }
      return total > 0 ? [lat / total, lng / total] : [Number(point.lat), Number(point.lng)];
    });
  }

  function sessionLatLngSegments(session, options = {}) {
    return sessionMovementSegments(session)
      .map((segment) => displayLatLngs(segment.points, options));
  }"""
)

sub_once(
    'runtime-tracks.js',
    r"  function setCurrentTrackVisible\(visible\) \{.*?\n  \}\n\n  function sessionById",
    """  function setCurrentTrackVisible(visible) {
    currentTrackVisible = Boolean(visible);
    persistCurrentTrackVisibility();
    document.querySelectorAll?.('#session-map-toggle, #travel-log-map-toggle').forEach((toggle) => {
      toggle.checked = currentTrackVisible;
    });
    syncCurrentTrack();
    return currentTrackVisible;
  }

  function setSmoothingEnabled(enabled) {
    smoothingEnabled = Boolean(enabled);
    persistSmoothingEnabled();
    document.querySelectorAll?.('#travel-log-track-smoothing-toggle').forEach((toggle) => {
      toggle.checked = smoothingEnabled;
    });
    syncCurrentTrack();
    window.WanderRecentTracks?.refresh?.();
    window.dispatchEvent(new CustomEvent('wander:track-smoothing-changed', {
      detail: { enabled: smoothingEnabled, visualOnly: true },
    }));
    return smoothingEnabled;
  }

  function sessionById"""
)

replace_once(
    'runtime-tracks.js',
    "    if (Number.isFinite(Number(point?.heading))) values.push(`<wander:heading>${Number(point.heading).toFixed(1)}</wander:heading>`);",
    "    if (Number.isFinite(Number(point?.heading))) values.push(`<wander:heading>${Number(point.heading).toFixed(1)}</wander:heading>`);\n    if (point?.source) values.push(`<wander:source>${xmlEscape(point.source)}</wander:source>`);\n    if (point?.permissionPrecision) values.push(`<wander:permissionPrecision>${xmlEscape(point.permissionPrecision)}</wander:permissionPrecision>`);\n    values.push('<wander:raw>true</wander:raw>');"
)
replace_once(
    'runtime-tracks.js',
    "    const time = Number.isFinite(at) ? `<time>${new Date(at).toISOString()}</time>` : '';\n    return `<trkpt lat=\"${lat}\" lon=\"${lng}\">${time}${pointExtensions(point)}</trkpt>`;",
    "    const time = Number.isFinite(at) ? `<time>${new Date(at).toISOString()}</time>` : '';\n    const altitude = Number(point?.altitude);\n    const elevation = Number.isFinite(altitude) ? `<ele>${altitude.toFixed(2)}</ele>` : '';\n    return `<trkpt lat=\"${lat}\" lon=\"${lng}\">${elevation}${time}${pointExtensions(point)}</trkpt>`;"
)

sub_once(
    'runtime-tracks.js',
    r"  function installTravelLogDownloads\(\) \{",
    """  function ensureSmoothingControl() {
    const toggles = document.querySelector?.('[data-app-screen="travel-log"] .travel-log-recorder-toggles');
    if (!toggles || typeof document.createElement !== 'function') return false;
    let control = toggles.querySelector?.('[data-track-smoothing-control]');
    if (!control) {
      control = document.createElement('label');
      control.className = 'travel-log-recorder-toggle';
      control.dataset.trackSmoothingControl = 'true';
      control.innerHTML = '<span>Suavizar recorrido <small>Solo visual</small></span><span class="switch-control"><input id="travel-log-track-smoothing-toggle" type="checkbox" role="switch" aria-label="Suavizar recorrido solo en pantalla"><span class="switch-track"><span class="switch-thumb"></span></span></span>';
      toggles.appendChild(control);
      control.querySelector('input')?.addEventListener('change', (event) => setSmoothingEnabled(event.target.checked));
    }
    const input = control.querySelector?.('input');
    if (input) input.checked = smoothingEnabled;
    return true;
  }

  function installTravelLogDownloads() {"""
)
replace_once(
    'runtime-tracks.js',
    "      window.addEventListener(name, () => setTimeout(enhanceTravelLogDownloads, 0));",
    "      window.addEventListener(name, () => setTimeout(() => { enhanceTravelLogDownloads(); ensureSmoothingControl(); }, 0));"
)
replace_once(
    'runtime-tracks.js',
    "  function render(state = null) {\n    syncCurrentTrack(state);\n    enhanceTravelLogDownloads();\n  }",
    "  function render(state = null) {\n    syncCurrentTrack(state);\n    enhanceTravelLogDownloads();\n    ensureSmoothingControl();\n  }"
)
replace_once(
    'runtime-tracks.js',
    "    persistCurrentTrackVisibility();\n    engine().subscribe?.(render);",
    "    persistCurrentTrackVisibility();\n    persistSmoothingEnabled();\n    engine().subscribe?.(render);"
)
replace_once(
    'runtime-tracks.js',
    "    setCurrentTrackVisible,\n    isCurrentTrackVisible: () => currentTrackVisible,\n    segmentLatLngs: sessionLatLngSegments,",
    "    setCurrentTrackVisible,\n    isCurrentTrackVisible: () => currentTrackVisible,\n    setSmoothingEnabled,\n    isSmoothingEnabled: () => smoothingEnabled,\n    displayLatLngs,\n    segmentLatLngs: sessionLatLngSegments,"
)

# 5. Selected and recent tracks use the same optional visual smoothing.
sub_once(
    'app.js',
    r"    function validPoints\(segment\) \{.*?\n    \}\n\n    function recentSegments",
    """    function validPoints(segment) {
      const points = (segment?.points || []).filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)));
      return window.WanderTracks?.displayLatLngs?.(points) || points.map((point) => [Number(point.lat), Number(point.lng)]);
    }

    function recentSegments"""
)
replace_once(
    'app.js',
    "    engine.subscribe?.((snapshot) => refresh(snapshot));\n    window.addEventListener('wander:screen-change',",
    "    engine.subscribe?.((snapshot) => refresh(snapshot));\n    window.addEventListener('wander:track-smoothing-changed', () => refresh());\n    window.addEventListener('wander:screen-change',"
)

sub_once(
    'runtime-travel-log-screen.js',
    r"    const latLngs = \(segment\?\.points \|\| \[\]\)\n      \.filter\(\(point\) => Number\.isFinite\(Number\(point\?\.lat\)\) && Number\.isFinite\(Number\(point\?\.lng\)\)\)\n      \.map\(\(point\) => \[Number\(point\.lat\), Number\(point\.lng\)\]\);",
    """    const rawPoints = (segment?.points || [])
      .filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)));
    const latLngs = window.WanderTracks?.displayLatLngs?.(rawPoints)
      || rawPoints.map((point) => [Number(point.lat), Number(point.lng)]);"""
)
replace_once(
    'runtime-travel-log-screen.js',
    'id="travel-log-recording-interval" type="number" min="2"',
    'id="travel-log-recording-interval" type="number" min="1"'
)
replace_once(
    'runtime-travel-log-screen.js',
    'id="travel-log-recording-min-distance" type="number" min="1"',
    'id="travel-log-recording-min-distance" type="number" min="0"'
)

# 6. Tests and version expectations.
for test_path in ['tests/app-shell.mjs', 'tests/travel-log-memory.mjs']:
    text = read(test_path)
    text = text.replace('v0.109.7', 'v0.109.8')
    text = text.replace('0.109.7', '0.109.8')
    if test_path.endswith('app-shell.mjs'):
      text = text.replace("'0.11.8'", "'0.11.9'")
      text = text.replace('versionCode, 24', 'versionCode, 25')
    write(test_path, text)

replace_once(
    'tests/native-background-location.mjs',
    'assert.equal(startedWith.minimumDistanceM, 1);',
    'assert.equal(startedWith.minimumDistanceM, 0);'
)

replace_once(
    'tests/app-shell.mjs',
    "assert.match(sources.sensorMotionBridge, /STOP_CONFIRM_MS = 20000/);",
    "assert.match(sources.sensorMotionBridge, /STOP_CONFIRM_MS = 20000/);\nassert.match(sources.sensorMotionBridge, /STOP_MIN_RADIUS_M = 8/);\nassert.match(sources.sensorMotionBridge, /STOP_MAX_RADIUS_M = 25/);\nassert.match(sources.sensorMotionBridge, /STOP_MAX_ACCURACY_M = 40/);\nassert.match(sources.sensorMotionBridge, /WALK_STOP_SPEED_KMH = 1\\.5/);\nassert.match(sources.sensorMotionBridge, /VEHICLE_STOP_SPEED_KMH = 3/);"
)
replace_once(
    'tests/app-shell.mjs',
    "assert.match(sources.nativeLocationSource, /precise: Object\\.freeze\\(\\{ intervalSec: 1, distanceM: 1 \\}\\)/);",
    "assert.match(sources.nativeLocationSource, /precise: Object\\.freeze\\(\\{ intervalSec: 1, distanceM: 0 \\}\\)/);"
)
replace_once(
    'tests/app-shell.mjs',
    "assert.match(sources.locationService, /minimumIntervalMs = intent == null \\? 1000/);",
    "assert.match(sources.locationService, /minimumIntervalMs = intent == null \\? 1000/);\nassert.match(sources.locationService, /minimumDistanceM = intent == null \\? 0/);"
)
replace_once(
    'tests/app-shell.mjs',
    "assert.match(sources.sessionEngine, /intervalSec: 1, distanceM: 1/);",
    "assert.match(sources.sessionEngine, /intervalSec: 1, distanceM: 0/);\nassert.match(sources.sessionEngine, /raw: true/);\nassert.match(sources.sessionEngine, /sessions\\.map\\(compactSession\\)/);\nassert.doesNotMatch(sources.sessionEngine, /elapsedMs < config\\.intervalSec/);\nassert.doesNotMatch(sources.sessionEngine, /distance < config\\.distanceM/);"
)
replace_once(
    'tests/app-shell.mjs',
    "assert.match(sources.tracks, /function sessionLatLngSegments\\(/);",
    "assert.match(sources.tracks, /function sessionLatLngSegments\\(/);\nassert.match(sources.tracks, /TRACK_SMOOTHING_KEY/);\nassert.match(sources.tracks, /Suavizar recorrido/);\nassert.match(sources.tracks, /visualOnly: true/);\nassert.match(sources.tracks, /function displayLatLngs\\(/);\nassert.match(sources.tracks, /wander:track-smoothing-changed/);"
)
replace_once(
    'tests/app-shell.mjs',
    "assert.match(sources.travelLogScreen, /showMovement/);",
    "assert.match(sources.travelLogScreen, /showMovement/);\nassert.match(sources.travelLogScreen, /WanderTracks\\?\\.displayLatLngs/);"
)

insert_after = """assert.notDeepEqual(segments[0][segments[0].length - 1], segments[1][0]);
"""
addition = """assert.equal(sandbox.WanderTracks.isSmoothingEnabled(), false);
const jitterPoints = [
  { lat: 18.3500, lng: -68.8270, accuracy: 5 },
  { lat: 18.3508, lng: -68.8262, accuracy: 18 },
  { lat: 18.3502, lng: -68.8268, accuracy: 5 },
  { lat: 18.3504, lng: -68.8266, accuracy: 5 },
];
const rawDisplay = sandbox.WanderTracks.displayLatLngs(jitterPoints);
assert.deepEqual(JSON.parse(JSON.stringify(rawDisplay)), jitterPoints.map((point) => [point.lat, point.lng]));
sandbox.WanderTracks.setSmoothingEnabled(true);
const smoothedDisplay = sandbox.WanderTracks.displayLatLngs(jitterPoints);
assert.notDeepEqual(JSON.parse(JSON.stringify(smoothedDisplay)), JSON.parse(JSON.stringify(rawDisplay)));
assert.deepEqual(smoothedDisplay[0], rawDisplay[0]);
assert.deepEqual(smoothedDisplay.at(-1), rawDisplay.at(-1));
sandbox.WanderTracks.setSmoothingEnabled(false);
"""
replace_once('tests/direction-track-rendering.mjs', insert_after, insert_after + addition)
replace_once(
    'tests/direction-track-rendering.mjs',
    "console.log('PASS dashboard uses hybrid direction, track segments remain disconnected, and Bitácora tracks export valid GPX files');",
    "console.log('PASS tracks retain raw points, optionally smooth only the map display, remain segmented at stops, and export raw GPX files');"
)

print('Applied raw track recording, 20-second stop detection, compact persistence and visual smoothing.')
