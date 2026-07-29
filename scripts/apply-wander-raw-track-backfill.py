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

def sub_once(path, pattern, replacement):
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'{path}: expected one regex match, found {count}: {pattern}')
    write(path, updated)

replace_once(
    'runtime-session-engine.js',
    '  const MAX_ACCURACY_M = 120;',
    '  const MAX_ACCURACY_M = 120;\n  const MOVEMENT_BACKFILL_MS = 12000;\n  const POSITION_BUFFER_MS = 30000;'
)
replace_once(
    'runtime-session-engine.js',
    '  let parkedCandidate = active?.parkedCandidate || null;',
    '  let parkedCandidate = active?.parkedCandidate || null;\n  let recentPositions = [];'
)

sub_once(
    'runtime-session-engine.js',
    r"  function currentPosition\(\) \{.*?\n  \}\n\n  function currentPOI",
    """  function currentPosition() {
    const location = context.getEffectiveLocation?.();
    if (!validPosition(location)) return null;
    return {
      lat: Number(location.lat),
      lng: Number(location.lng),
      accuracy: finite(location.accuracy),
      speedKmh: finite(context.value?.('motion.speedKmh')),
      altitude: finite(location.altitude),
      heading: finite(location.heading),
      provider: location.provider || null,
      permissionPrecision: location.permissionPrecision || null,
      at: Date.parse(location.updatedAt || '') || Date.now(),
      source: location.source || 'unknown',
    };
  }

  function rememberPosition(position) {
    if (!validPosition(position)) return;
    const previous = recentPositions[recentPositions.length - 1];
    if (previous && Number(previous.at) === Number(position.at)
      && Number(previous.lat) === Number(position.lat) && Number(previous.lng) === Number(position.lng)) return;
    recentPositions.push({ ...position });
    const cutoff = Number(position.at || Date.now()) - POSITION_BUFFER_MS;
    recentPositions = recentPositions.filter((sample) => Number(sample.at || 0) >= cutoff).slice(-120);
  }

  function movementBackfill(stay, position) {
    const at = Number(position?.at || Date.now());
    const candidates = recentPositions.filter((sample) => Number(sample.at || 0) >= at - MOVEMENT_BACKFILL_MS && Number(sample.at || 0) <= at);
    if (!candidates.length) return [position];
    if (stay?.center) {
      const firstOutside = candidates.findIndex((sample) => distanceMeters(stay.center, sample) > stayAllowance(stay, sample));
      if (firstOutside >= 0) return candidates.slice(Math.max(0, firstOutside - 1));
      return [position];
    }
    const latest = candidates[candidates.length - 1];
    const accuracy = Math.max(3, finite(latest?.accuracy) || 10);
    const movementRadius = Math.max(8, Math.min(25, accuracy * 1.5));
    const firstSeparated = candidates.findIndex((sample) => distanceMeters(sample, latest) >= movementRadius);
    const startIndex = firstSeparated >= 0 ? Math.max(0, firstSeparated - 1) : Math.max(0, candidates.length - 8);
    return candidates.slice(startIndex);
  }

  function appendBackfill(segment, points) {
    (points || []).forEach((point) => addMovementPoint(segment, point, Number(point?.at || Date.now()), true));
    return segment;
  }

  function currentPOI"""
)

sub_once(
    'runtime-session-engine.js',
    r"    const motion = String\(context\.value\?\.\('motion\.status'\) \|\| 'pending'\)\.toLowerCase\(\);.*?\n    if \(motion === 'moving'\) \{.*?\n      phase = 'moving';\n    \} else if \(motion === 'stationary'\) \{",
    """    const motion = String(context.value?.('motion.status') || 'pending').toLowerCase();
    const position = currentPosition();
    const at = position?.at || Date.now();
    if (!position) {
      phase = 'preparing';
      publishContext();
      return;
    }
    if (at === lastObservedAt && reason === 'location') return;
    lastObservedAt = at;
    rememberPosition(position);
    if (motion === 'pending') {
      phase = 'preparing';
      publishContext();
      return;
    }

    if (motion === 'moving') {
      const previousStay = active ? openStay(active) : null;
      const backfill = movementBackfill(previousStay, position);
      const firstPoint = backfill[0] || position;
      if (!active) startSession(firstPoint, Number(firstPoint.at || at));
      let movement = openMovement(active);
      const stay = openStay(active);
      if (stay) closeStay(Number(firstPoint.at || at));
      if (!attachedVehicleId) attachVehicleFromPOI(position, at);
      if (!movement) {
        movement = createMovement(firstPoint, Number(firstPoint.at || at));
        appendBackfill(movement, backfill.slice(1));
      } else {
        addMovementPoint(movement, position, at, Boolean(stay));
      }
      updateAttachedVehicle(position, motion, at);
      phase = 'moving';
    } else if (motion === 'stationary') {"""
)

replace_once(
    'tests/app-shell.mjs',
    "assert.match(sources.sessionEngine, /sessions\\.map\\(compactSession\\)/);",
    "assert.match(sources.sessionEngine, /sessions\\.map\\(compactSession\\)/);\nassert.match(sources.sessionEngine, /MOVEMENT_BACKFILL_MS = 12000/);\nassert.match(sources.sessionEngine, /function movementBackfill\\(/);\nassert.match(sources.sessionEngine, /appendBackfill\\(movement, backfill\\.slice\\(1\\)\\)/);"
)

replace_once(
    'runtime-tracks.js',
    "    if (Number.isFinite(Number(point?.accuracy))) values.push(`<wander:accuracy>${Number(point.accuracy).toFixed(1)}</wander:accuracy>`);\n    if (Number.isFinite(Number(point?.speedKmh))) values.push(`<wander:speedKmh>${Number(point.speedKmh).toFixed(2)}</wander:speedKmh>`);\n    if (Number.isFinite(Number(point?.heading))) values.push(`<wander:heading>${Number(point.heading).toFixed(1)}</wander:heading>`);",
    "    if (point?.accuracy != null && Number.isFinite(Number(point.accuracy))) values.push(`<wander:accuracy>${Number(point.accuracy).toFixed(1)}</wander:accuracy>`);\n    if (point?.speedKmh != null && Number.isFinite(Number(point.speedKmh))) values.push(`<wander:speedKmh>${Number(point.speedKmh).toFixed(2)}</wander:speedKmh>`);\n    if (point?.heading != null && Number.isFinite(Number(point.heading))) values.push(`<wander:heading>${Number(point.heading).toFixed(1)}</wander:heading>`);"
)
replace_once(
    'runtime-tracks.js',
    "        const accuracy = Number(sample.accuracy);\n        const accuracyWeight = 1 / Math.max(4, Number.isFinite(accuracy) ? accuracy : 8);",
    "        const accuracy = sample.accuracy == null ? NaN : Number(sample.accuracy);\n        const accuracyWeight = 1 / Math.max(4, Number.isFinite(accuracy) ? accuracy : 8);"
)
replace_once(
    'runtime-tracks.js',
    "    const altitude = Number(point?.altitude);\n    const elevation = Number.isFinite(altitude) ? `<ele>${altitude.toFixed(2)}</ele>` : '';",
    "    const altitude = point?.altitude == null ? NaN : Number(point.altitude);\n    const elevation = Number.isFinite(altitude) ? `<ele>${altitude.toFixed(2)}</ele>` : '';"
)

replace_once(
    'android/app/src/main/java/app/wandertravel/mobile/WanderLocationPlugin.java',
    'private static final int MAX_GPX_BYTES = 10 * 1024 * 1024;',
    'private static final int MAX_GPX_BYTES = 50 * 1024 * 1024;'
)
replace_once(
    'tests/app-shell.mjs',
    "assert.match(sources.locationPlugin, /Math\\.max\\(1000, call\\.getInt\\(\"minimumIntervalMs\", 1000\\)\\)/);",
    "assert.match(sources.locationPlugin, /Math\\.max\\(1000, call\\.getInt\\(\"minimumIntervalMs\", 1000\\)\\)/);\nassert.match(sources.locationPlugin, /MAX_GPX_BYTES = 50 \\* 1024 \\* 1024/);"
)

print('Applied movement backfill and raw GPX null-safety.')
