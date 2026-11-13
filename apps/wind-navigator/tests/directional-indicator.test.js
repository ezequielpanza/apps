import test from 'node:test';
import assert from 'node:assert/strict';
import { directionalIndicatorLayout, directionalIndicatorMarkup } from '../src/directional-indicator.js';

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
