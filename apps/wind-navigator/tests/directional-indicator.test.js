import test from 'node:test';
import assert from 'node:assert/strict';
import { directionalIndicatorLayout, directionalIndicatorMarkup, fitIndicatorText } from '../src/directional-indicator.js';

test('the triangle tip stays at the configured distance for every size and map bearing', () => {
    const origin = { x: 324, y: 491 };
    for (const direction of [0, 24, 164, 270]) for (const bearing of [0, 35]) for (const size of [5, 20, 60]) {
        const layout = directionalIndicatorLayout(origin, direction, bearing, 80, size);
        const angle = layout.rotation * Math.PI / 180;
        const tipX = layout.x - Math.sin(angle) * layout.height / 2;
        const tipY = layout.y + Math.cos(angle) * layout.height / 2;
        assert.ok(Math.abs(Math.hypot(tipX - origin.x, tipY - origin.y) - 80) < 1e-10);
        assert.equal(layout.width, size);
    }
});

test('wind and wave marker SVGs differ only by color and letter', () => {
    const wind = directionalIndicatorMarkup('#087bd1', 'T');
    const wave = directionalIndicatorMarkup('#f4d03f', 'W');
    const normalize = (markup) => markup.replace('#087bd1', '[fill]').replace('#f4d03f', '[fill]').replace('>T</span>', '>[letter]</span>').replace('>W</span>', '>[letter]</span>');
    assert.equal(normalize(wind), normalize(wave));
});

test('the base triangle has equal 10 px sides and a 5 px base', () => {
    const layout = directionalIndicatorLayout({x: 0, y: 0}, 0, 0, 80, 5);
    assert.equal(layout.width, 5);
    assert.ok(Math.abs(Math.hypot(layout.width / 2, layout.height) - 10) < 1e-10);
});

test('text fits with equal perpendicular margins at the base and sloping sides', () => {
    for (const size of [20, 50, 80]) for (const margin of [0, 2, 4]) for (const width of [0.5, 2, 5]) {
        const metrics = { left: 0, right: width, ascent: 0.75, descent: 0.2 };
        const result = fitIndicatorText(size, margin, metrics);
        if (result.fontSize <= 0) continue;
        const bottom = result.y + metrics.descent * result.fontSize;
        const left = result.x - metrics.left * result.fontSize;
        const slope = size / (2 * result.height);
        const sideClearance = (left - slope * bottom) / Math.hypot(1, slope);
        assert.ok(Math.abs((result.y - metrics.ascent * result.fontSize) - margin) < 1e-9);
        assert.ok(Math.abs(sideClearance - margin) < 1e-9);
    }
    assert.equal(fitIndicatorText(5, 2, {left: 0, right: 1, ascent: .8, descent: .2}).fontSize, 0);
});
