import test from 'node:test';
import assert from 'node:assert/strict';
import { directionalIndicatorLayout, directionalIndicatorMarkup, fitIndicatorText, indicatorValuePosition, indicatorLabelOffsets, readableIndicatorRotation } from '../src/directional-indicator.js';

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

test('visible text contour clears all three stroked edges by the configured margin', () => {
    const slope = 5 / (2 * Math.sqrt(100 - 2.5 * 2.5));
    for (const size of [20, 50, 80]) for (const margin of [0, 2, 4]) {
        const ink = { minY: -0.7, left: -0.08, right: 1.5 };
        const result = fitIndicatorText(size, margin, ink);
        if (result.fontSize <= 0) continue;
        const effective = margin + size * 0.02;
        const leftClearance = (result.x - slope * result.y + result.fontSize * ink.left) / Math.hypot(1, slope);
        const rightClearance = (size - result.x - slope * result.y - result.fontSize * ink.right) / Math.hypot(1, slope);
        assert.ok(Math.abs(result.y + result.fontSize * ink.minY - effective) < 1e-9);
        assert.ok(Math.abs(leftClearance - effective) < 1e-9);
        assert.ok(Math.abs(rightClearance - effective) < 1e-9);
    }
    assert.equal(fitIndicatorText(5, 2, {minY: -0.8, left: -0.2, right: 1}).fontSize, 0);
});

test('height can change independently while the tip distance remains fixed', () => {
    for (const size of [10, 40, 80]) for (const height of [8, 40, 160]) for (const bearing of [0, 120, 270]) {
        const o = {x: 10, y: 20};
        const v = directionalIndicatorLayout(o, bearing, 0, 35, size, height);
        const theta = v.rotation * Math.PI / 180;
        const tx = v.x - Math.sin(theta) * height / 2;
        const ty = v.y + Math.cos(theta) * height / 2;
        assert.equal(v.width, size);
        assert.equal(v.height, height);
        assert.ok(Math.abs(Math.hypot(tx - o.x, ty - o.y) - 35) < 1e-9);
    }
});

test('text clearance follows the selected triangle height', () => {
    const size = 50, margin = 2, ink = { minY: -0.7, left: -0.08, right: 1.5 };
    for (const height of [20, 50, 100, 200]) {
        const slope = size / (2 * height), effective = margin + size * 0.02;
        const v = fitIndicatorText(size, margin, ink, height);
        assert.equal(v.height, height);
        if (!v.fontSize) continue;
        assert.ok(Math.abs(v.y + v.fontSize * ink.minY - effective) < 1e-9);
        assert.ok(Math.abs((v.x - slope * v.y + v.fontSize * ink.left) / Math.hypot(1, slope) - effective) < 1e-9);
        assert.ok(Math.abs((size - v.x - slope * v.y - v.fontSize * ink.right) / Math.hypot(1, slope) - effective) < 1e-9);
    }
});

test('value labels follow direction, leaving the configured gap outside direction labels', () => {
    for (const rotation of [0, 45, 90, 180, 270]) {
        const pos = indicatorValuePosition(rotation, 20, 14, 18, 3, true);
        assert.ok(Math.abs(pos.distance - 39) < 1e-10);
        assert.ok(Math.abs(Math.hypot(pos.x, pos.y) - 39) < 1e-10);
        assert.ok(Math.abs(pos.x - 39 * Math.sin(rotation * Math.PI / 180)) < 1e-10);
        assert.ok(Math.abs(pos.y + 39 * Math.cos(rotation * Math.PI / 180)) < 1e-10);
    }
    assert.equal(indicatorValuePosition(0, 20, 0, 18, 3, false).distance, 20);
});

test('configured margin separates triangle, direction and value at all sizes', () => {
    for (const height of [10, 40, 180]) for (const gap of [0, 2, 8]) for (const dirSize of [10, 22]) for (const valueSize of [12, 28]) {
        const both = indicatorLabelOffsets(height, gap, dirSize, valueSize, true, true);
        assert.equal(both.direction - dirSize / 2 - height / 2, gap);
        assert.equal(both.value - valueSize / 2 - (both.direction + dirSize / 2), gap);
        const directionOnly = indicatorLabelOffsets(height, gap, dirSize, valueSize, true, false);
        assert.equal(directionOnly.direction - dirSize / 2 - height / 2, gap);
        assert.equal(directionOnly.value, null);
        const valueOnly = indicatorLabelOffsets(height, gap, dirSize, valueSize, false, true);
        assert.equal(valueOnly.value - valueSize / 2 - height / 2, gap);
        assert.equal(valueOnly.direction, null);
    }
});

test('direction and value labels remain readable and perpendicular at any rotation', () => {
    for (let rotation = -1080; rotation <= 1080; rotation += 5) {
        const result = readableIndicatorRotation(rotation);
        assert.ok(result >= -90 && result <= 90);
        assert.ok(Math.abs(Math.sin((rotation - result) * Math.PI / 180)) < 1e-10);
    }
    assert.equal(readableIndicatorRotation(180), 0);
    assert.equal(readableIndicatorRotation(135), -45);
    assert.equal(readableIndicatorRotation(225), 45);
});
