const TRIANGLE_PATH = 'M2 2 L24 2 L13 28 Z';

/** Shared screen-space placement for wind and wave direction markers. */
export function directionalIndicatorLayout(origin, direction, mapBearing, distance, size) {
    const rotation = direction - mapBearing;
    const radians = rotation * Math.PI / 180;
    return {
        x: origin.x + distance * Math.sin(radians),
        y: origin.y - distance * Math.cos(radians),
        rotation,
        width: size,
        height: size * 30 / 26,
        padding: size * 5 / 26,
        degreesOffset: size * 0.5 + 10,
    };
}

/** The only visual differences between these markers are their fill and letter. */
export function directionalIndicatorMarkup(fill, letter) {
    return `<b class="route-wind-degrees"></b><svg viewBox="0 0 26 30" aria-hidden="true"><path d="${TRIANGLE_PATH}" fill="${fill}" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg><span>${letter}</span>`;
}
