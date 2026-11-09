// Helpers for a live forecast; these never modify the saved route.
export const LIVE_SPEED_WINDOW_MS = 5 * 1000;
export const TEMPORARY_PLAN_KEY = 'route-builder-live-plan-backup-v1';

export function currentRouteSpeed(speed) {
    return typeof speed === 'number' && Number.isFinite(speed) && speed >= 0.1 ? speed : null;
}

export function prepareLiveRefresh(position, points, targetId, now) {
    const targetIndex = points.findIndex(point => point.id === targetId);
    const speed = currentRouteSpeed(position?.speed);
    if (!position || !Number.isFinite(position.timestamp) || position.timestamp > now || now - position.timestamp > 30000 ||
        !Number.isFinite(position.lat) || !Number.isFinite(position.lon) || targetIndex < 1 || speed === null) return null;
    return { points: [{ ...points[0], lat: position.lat, lon: position.lon }, ...points.slice(targetIndex)], speed };
}

// Reconstruct a complete route from the hidden live start, its passed points,
// and the remaining route. The boat position can be the last live fix when
// leaving live mode, or a newly validated fix when saving a slot.
export function buildLiveRoutePoints(pastWaypoints, points, targetId, boatPosition = points?.[0]) {
    if (!Array.isArray(pastWaypoints) || !Array.isArray(points) || !boatPosition ||
        !Number.isFinite(boatPosition.lat) || Math.abs(boatPosition.lat) > 90 ||
        !Number.isFinite(boatPosition.lon) || Math.abs(boatPosition.lon) > 180) return null;
    const targetIndex = points.findIndex(point => point.id === targetId);
    if (targetIndex < 1) return null;
    const passed = [...pastWaypoints.map(entry => entry.point), ...points.slice(1, targetIndex)];
    const seen = new Set();
    const uniquePassed = passed.filter(point => {
        if (!point || seen.has(point.id)) return false;
        seen.add(point.id);
        return true;
    });
    const snapshotPoints = [...uniquePassed, { ...points[0], lat: boatPosition.lat, lon: boatPosition.lon }, ...points.slice(targetIndex)]
        .map(point => ({ id: point.id, lat: point.lat, lon: point.lon }));
    const ids = snapshotPoints.map(point => point.id);
    if (ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length ||
        snapshotPoints.some(point => !Number.isFinite(point.lat) || Math.abs(point.lat) > 90 || !Number.isFinite(point.lon) || Math.abs(point.lon) > 180)) return null;
    return snapshotPoints;
}

// User-requested saves require a fresh GPS position. Leaving live mode uses
// buildLiveRoutePoints directly so a brief GPS timeout does not discard the
// last position already applied to the hidden start point.
export function buildLiveRouteSnapshot(pastWaypoints, points, position, targetId, now) {
    if (!position || !Number.isFinite(now) || !Number.isFinite(position.timestamp) || position.timestamp > now || now - position.timestamp > 30000 ||
        !Number.isFinite(position.lat) || Math.abs(position.lat) > 90 || !Number.isFinite(position.lon) || Math.abs(position.lon) > 180) return null;
    return buildLiveRoutePoints(pastWaypoints, points, targetId, position);
}

export function capturePlanningSnapshot(plan) {
    if (!plan || !Array.isArray(plan.points) || !Number.isSafeInteger(plan.nextPointId) ||
        typeof plan.departureDateTime !== 'string' || !Number.isFinite(new Date(plan.departureDateTime).getTime()) ||
        !Number.isFinite(plan.speedKnots) || plan.speedKnots <= 0) return null;
    return {
        version: 1,
        points: plan.points.map(point => ({ ...point })),
        nextPointId: plan.nextPointId,
        departureDateTime: plan.departureDateTime,
        speedKnots: plan.speedKnots,
    };
}

export function saveTemporaryPlan(storage, plan) {
    const snapshot = capturePlanningSnapshot(plan);
    if (!snapshot) return false;
    try {
        storage.setItem(TEMPORARY_PLAN_KEY, JSON.stringify(snapshot));
        return true;
    } catch { return false; }
}

export function loadTemporaryPlan(storage, parseSnapshot) {
    try { return parseSnapshot(storage.getItem(TEMPORARY_PLAN_KEY)); }
    catch { return null; }
}

export function clearTemporaryPlan(storage) {
    try { storage.removeItem(TEMPORARY_PLAN_KEY); return true; }
    catch { return false; }
}

export function liveAverageSpeed(samples, now, windowMs = LIVE_SPEED_WINDOW_MS) {
    if (!Number.isFinite(now) || !Number.isFinite(windowMs) || windowMs <= 0) return null;
    const valid = samples.filter(s => Number.isFinite(s.timestamp) && s.timestamp <= now && s.timestamp >= now - windowMs && Number.isFinite(s.speed) && s.speed >= 0);
    if (!valid.length || !valid.some(sample => now - sample.timestamp <= 30000)) return null;
    return valid.reduce((sum, s) => sum + s.speed, 0) / valid.length;
}

export function buildLiveRoute(position, points, targetIndex, now, speedSamples) {
    if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lon) ||
        !Number.isFinite(position.timestamp) || !Number.isFinite(now) || now - position.timestamp > 30000 || position.timestamp > now ||
        !Array.isArray(points) || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= points.length) return null;
    const speed = liveAverageSpeed(speedSamples, now);
    if (speed === null || speed < 0.5) return null;
    const remaining = points.slice(targetIndex).map(point => ({ ...point }));
    return { points: [{ id: 0, lat: position.lat, lon: position.lon }, ...remaining], departure: new Date(now), speed };
}
