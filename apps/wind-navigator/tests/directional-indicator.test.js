import test from 'node:test';
import assert from 'node:assert/strict';
import { directionalIndicatorLayout, directionalIndicatorMarkup } from '../src/directional-indicator.js';

test('directional markers use the same size and radial offset at every bearing', () => {
    const origin = { x: 324, y: 491 };
    for (const direction of [24, 164]) {
        const layout = directionalIndicatorLayout(origin, direction, 0, 80, 20);
        assert.ok(Math.abs(Math.hypot(layout.x - origin.x, layout.y - origin.y) - 80) < 1e-10);
        assert.equal(layout.width, 20);
        assert.equal(layout.height, 20 * 30 / 26);
    }
});

test('wind and wave marker SVGs differ only by color and letter', () => {
    const wind = directionalIndicatorMarkup('#087bd1', 'T');
    const wave = directionalIndicatorMarkup('#f4d03f', 'W');
    const normalize = (markup) => markup.replace('#087bd1', '[fill]').replace('#f4d03f', '[fill]').replace('>T</span>', '>[letter]</span>').replace('>W</span>', '>[letter]</span>');
    assert.equal(normalize(wind), normalize(wave));
});
