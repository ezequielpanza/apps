import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveRoute, liveAverageSpeed, capturePlanningSnapshot, saveTemporaryPlan, loadTemporaryPlan, clearTemporaryPlan, currentRouteSpeed, prepareLiveRefresh } from '../src/live-route.js';

test('refresh keeps remaining waypoint IDs and uses current GPS speed', () => {
    const now = 1000000, points = [{ id: 8, lat: 0, lon: 0 }, { id: 3, lat: 1, lon: 1 }, { id: 4, lat: 2, lon: 2 }];
    const fix = { timestamp: now, lat: 1.3, lon: 1.4, speed: 6.7 };
    const updated = prepareLiveRefresh(fix, points, 4, now);
    assert.deepEqual(updated.points.map(p => p.id), [8, 4]);
    assert.equal(updated.points[0].lat, 1.3);
    assert.equal(updated.speed, 6.7);
    assert.equal(points[0].lat, 0);
    assert.equal(prepareLiveRefresh({ ...fix, timestamp: now - 31000 }, points, 4, now), null);
    assert.equal(prepareLiveRefresh({ ...fix, speed: 0 }, points, 4, now), null);
    assert.equal(prepareLiveRefresh(fix, points, 8, now), null);
});

test('after advancing, the passed waypoint is removed from the live route', () => {
    const now = 1000000;
    const route = [{ id: 10, lat: 0, lon: 0 }, { id: 3, lat: 1, lon: 1 }, { id: 4, lat: 2, lon: 2 }, { id: 5, lat: 3, lon: 3 }];
    const updated = prepareLiveRefresh({ timestamp: now, lat: 1.1, lon: 1.1, speed: 5 }, route, 4, now);
    assert.deepEqual(updated.points.map(p => p.id), [10, 4, 5]);
    assert.deepEqual(route.map(p => p.id), [10, 3, 4, 5]);
});

test('uses the current GPS speed without averaging or inventing a value', () => {
    assert.equal(currentRouteSpeed(6.234), 6.234);
    assert.equal(currentRouteSpeed(null), null);
    assert.equal(currentRouteSpeed(0), null);
    assert.equal(currentRouteSpeed(Infinity), null);
    assert.equal(currentRouteSpeed(0.1), 0.1);
});

test('temporary slot is independent of the three saved routes and preserves past dates', () => {
    const records = new Map([['route-1', 'saved route']]);
    const storage = { setItem: (k, v) => records.set(k, v), getItem: k => records.get(k) ?? null, removeItem: k => records.delete(k) };
    const plan = { points: [{ id: 1, lat: 1, lon: 2 }], nextPointId: 2, departureDateTime: '2026-10-01T08:13', speedKnots: 6 };
    assert.equal(saveTemporaryPlan(storage, plan), true);
    const restored = loadTemporaryPlan(storage, JSON.parse);
    assert.deepEqual(restored, { version: 1, ...plan });
    assert.equal(records.get('route-1'), 'saved route');
    assert.equal(clearTemporaryPlan(storage), true);
    assert.equal(records.get('route-1'), 'saved route');
});

test('storage failures are reported without overwriting the planning data', () => {
    const broken = { setItem() { throw new Error('unavailable'); }, getItem() { throw new Error('unavailable'); } };
    const plan = { points: [], nextPointId: 1, departureDateTime: '2026-10-01T08:13', speedKnots: 6 };
    assert.equal(saveTemporaryPlan(broken, plan), false);
    assert.equal(loadTemporaryPlan(broken, JSON.parse), null);
});

test('temporary snapshot preserves original route, speed and departure', () => {
    const plan = { points: [{ id: 1, lat: 1, lon: 2 }], nextPointId: 2, departureDateTime: '2026-11-05T08:00', speedKnots: 6 };
    const snapshot = capturePlanningSnapshot(plan);
    plan.points[0].lat = 20;
    plan.speedKnots = 8;
    assert.equal(snapshot.points[0].lat, 1);
    assert.equal(snapshot.speedKnots, 6);
    assert.equal(snapshot.departureDateTime, '2026-11-05T08:00');
    assert.equal(capturePlanningSnapshot({ ...plan, speedKnots: 0 }), null);
});

test('averages only valid recent GPS speed readings', () => {
    const now = 1_000_000;
    assert.equal(liveAverageSpeed([{ timestamp: now - 310000, speed: 50 }, { timestamp: now - 1000, speed: 4 }, { timestamp: now, speed: 6 }], now), 5);
    assert.equal(liveAverageSpeed([{ timestamp: now, speed: null }], now), null);
});

test('averages the last five seconds and rejects older GPS readings', () => {
    const now = 100000;
    assert.equal(liveAverageSpeed([{ timestamp: now - 6000, speed: 20 }, { timestamp: now - 5000, speed: 4 }, { timestamp: now, speed: 6 }], now), 5);
    assert.equal(liveAverageSpeed([{ timestamp: now - 5001, speed: 4 }], now), null);
    assert.equal(liveAverageSpeed([{ timestamp: now - 31000, speed: 4 }], now, 300000), null);
});

test('builds a separate remaining route from the GPS position', () => {
    const now = 1_000_000;
    const points = [{ id: 1, lat: 1, lon: 1 }, { id: 2, lat: 2, lon: 2 }, { id: 3, lat: 3, lon: 3 }];
    const snapshot = JSON.stringify(points);
    const live = buildLiveRoute({ lat: 1.5, lon: 1.5, timestamp: now }, points, 1, now, [{ timestamp: now, speed: 5 }]);
    assert.deepEqual(live.points.map(p => p.id), [0, 2, 3]);
    live.points[1].lat = 10;
    assert.equal(JSON.stringify(points), snapshot);
    assert.equal(live.speed, 5);
    assert.equal(live.departure.getTime(), now);
});

test('does not calculate with stale GPS, missing waypoint or stopped boat', () => {
    const now = 1_000_000, points = [{ id: 1, lat: 1, lon: 1 }], fix = { lat: 1, lon: 1, timestamp: now };
    assert.equal(buildLiveRoute({ ...fix, timestamp: now - 31000 }, points, 0, now, [{ timestamp: now, speed: 5 }]), null);
    assert.equal(buildLiveRoute(fix, points, -1, now, [{ timestamp: now, speed: 5 }]), null);
    assert.equal(buildLiveRoute(fix, points, 0, now, [{ timestamp: now, speed: 0 }]), null);
});
