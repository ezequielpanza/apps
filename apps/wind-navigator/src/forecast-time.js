const HOUR_MS = 60 * 60 * 1000;
const MAX_INTERPOLATION_GAP_MS = 6 * HOUR_MS;

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return timestamp < 1e12 ? timestamp * 1000 : timestamp;
}

/** Interpolate a compass direction at a timestamp along the shortest turn. */
export function interpolateForecastDirection(timestamps, directions, target) {
  if (!Array.isArray(timestamps) || !Array.isArray(directions) || !Number.isFinite(target)) return null;

  const samples = [];
  const length = Math.min(timestamps.length, directions.length);
  for (let index = 0; index < length; index++) {
    const time = normalizeTimestamp(timestamps[index]);
    const rawDirection = directions[index];
    if (time === null || rawDirection === null || rawDirection === undefined || rawDirection === '') continue;
    const direction = Number(rawDirection);
    if (Number.isFinite(direction)) samples.push({ time, direction: normalizeDegrees(direction) });
  }
  if (!samples.length) return null;
  samples.sort((a, b) => a.time - b.time);

  let before = null;
  let after = null;
  for (const sample of samples) {
    if (sample.time === target) return sample.direction;
    if (sample.time < target) before = sample;
    else {
      after = sample;
      break;
    }
  }
  if (!before || !after) return null;

  const gap = after.time - before.time;
  if (gap <= 0 || gap > MAX_INTERPOLATION_GAP_MS) return null;

  const rawDelta = normalizeDegrees(after.direction - before.direction);
  // Exactly opposite directions have two equally short paths; leave those to fallback.
  if (rawDelta === 180) return null;
  const delta = rawDelta > 180 ? rawDelta - 360 : rawDelta;
  const fraction = (target - before.time) / gap;
  return normalizeDegrees(before.direction + delta * fraction);
}
