import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestHourlyDeparture } from '../src/departure-timeline.js';

function localDateTime(hour, minute, second = 0, millisecond = 0) {
    return new Date(2026, 10, 10, hour, minute, second, millisecond);
}

test('rounds a clean-route departure to the nearest local hour', () => {
    assert.equal(nearestHourlyDeparture(localDateTime(11, 20)).getHours(), 11);
    assert.equal(nearestHourlyDeparture(localDateTime(11, 20)).getMinutes(), 0);
    assert.equal(nearestHourlyDeparture(localDateTime(11, 35)).getHours(), 12);
    assert.equal(nearestHourlyDeparture(localDateTime(11, 35)).getDate(), 10);
});

test('keeps an exact half-hour tie on the earlier hour and carries after midnight', () => {
    assert.equal(nearestHourlyDeparture(localDateTime(11, 30)).getHours(), 11);
    assert.equal(nearestHourlyDeparture(localDateTime(11, 30, 1)).getHours(), 12);
    const afterMidnight = nearestHourlyDeparture(localDateTime(23, 35));
    assert.equal(afterMidnight.getHours(), 0);
    assert.equal(afterMidnight.getDate(), 11);
});
