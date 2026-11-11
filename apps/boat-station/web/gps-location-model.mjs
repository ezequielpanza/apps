export const LOCATION_RETENTION_HOURS = Object.freeze([0, 1, 3, 6, 12, 24]);
const finite = (value, fallback) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
export function normalizeVesselConfig(value = {}) {
  return { type: value.type === 'cat' ? 'cat' : 'mono',
    length: Math.min(100, Math.max(2, finite(value.length, 12.5))),
    beam: Math.min(30, Math.max(1, finite(value.beam, 4.2))),
    phoneForward: Math.min(100, Math.max(-100, finite(value.phoneForward, 0))),
    phoneStarboard: Math.min(100, Math.max(-100, finite(value.phoneStarboard, 0))),
    magneticCorrection: Math.min(360, Math.max(-360, finite(value.magneticCorrection, 0))) };
}
export function normalizeAnchorSettings(value = {}) {
  const lat = value.lat === null || value.lat === undefined ? NaN : Number(value.lat), lon = value.lon === null || value.lon === undefined ? NaN : Number(value.lon);
  const hasPoint = Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lon) && lon >= -180 && lon <= 180;
  return { enabled: Boolean(value.enabled) && hasPoint, hasPoint, lat: hasPoint ? lat : null, lon: hasPoint ? lon : null,
    radius: Math.min(5000, Math.max(5, Math.round(finite(value.radius, 30)))) };
}
export function distanceMeters(a, b) {
  const latA = Number(a?.lat), lonA = Number(a?.lon), latB = Number(b?.lat), lonB = Number(b?.lon);
  if (![latA, lonA, latB, lonB].every(Number.isFinite)) return null;
  const rad = Math.PI / 180, dLat = (latB - latA) * rad, dLon = (lonB - lonA) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function evaluateAnchorBoundary(anchorValue, fix, tripped = false) {
  const anchor = normalizeAnchorSettings(anchorValue), accuracy = Math.max(0, finite(fix?.accuracy, 0));
  const distance = anchor.hasPoint ? distanceMeters(anchor, fix) : null;
  if (!anchor.enabled || distance === null) return { distance, alarm: false, tripped: false, rearmed: false };
  const outside = distance - accuracy > anchor.radius;
  const inside = distance < Math.max(3, anchor.radius * 0.5);
  if (!tripped && outside) return { distance, alarm: true, tripped: true, rearmed: false };
  if (tripped && inside) return { distance, alarm: false, tripped: false, rearmed: true };
  return { distance, alarm: false, tripped, rearmed: false };
}
