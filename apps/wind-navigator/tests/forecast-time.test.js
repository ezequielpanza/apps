import test from 'node:test';
import assert from 'node:assert/strict';
import { interpolateForecastDirection } from '../src/forecast-time.js';

const hour = 60 * 60 * 1000;
const timestamps = [Date.UTC(2026, 0, 1, 10), Date.UTC(2026, 0, 1, 11)];

test('interpolates directions between hourly forecast samples', () => {
  assert.equal(interpolateForecastDirection(timestamps, [120, 140], timestamps[0] + hour / 2), 130);
  assert.ok(Math.abs(interpolateForecastDirection(timestamps, [120, 140], timestamps[0] + 35 * 60 * 1000) - 131.6666667) < 1e-6);
});

test('interpolates across north using the shortest compass turn', () => {
  assert.equal(interpolateForecastDirection(timestamps, [350, 10], timestamps[0] + hour / 2), 0);
  assert.equal(interpolateForecastDirection(timestamps, [10, 350], timestamps[0] + hour / 2), 0);
});

test('returns exact samples and refuses extrapolation or ambiguous opposite bearings', () => {
  assert.equal(interpolateForecastDirection(timestamps, [725, 140], timestamps[0]), 5);
  assert.equal(interpolateForecastDirection(timestamps, [120, 140], timestamps[0] - 1), null);
  assert.equal(interpolateForecastDirection(timestamps, [0, 180], timestamps[0] + hour / 2), null);
});

test('normalizes second-based model timestamps', () => {
  const seconds = timestamps.map(value => value / 1000);
  assert.equal(interpolateForecastDirection(seconds, [120, 140], timestamps[0] + hour / 2), 130);
});
