const HEIGHT = Math.sqrt(10 * 10 - 2.5 * 2.5);
export function directionalIndicatorLayout(origin, direction, mapBearing, distance, size) {
    const rotation = direction - mapBearing;
    const radians = rotation * Math.PI / 180;
    const height = size * HEIGHT / 5;
    const centerDistance = distance + height / 2;
    return { x: origin.x + centerDistance * Math.sin(radians), y: origin.y - centerDistance * Math.cos(radians), rotation, width: size, height, padding: 0, degreesOffset: size * 0.5 + 10 };
}
export function directionalIndicatorMarkup(fill, letter) {
    return `<b class="route-wind-degrees"></b><svg viewBox="0 0 5 ${HEIGHT}" aria-hidden="true"><path d="M0 0 L5 0 L2.5 ${HEIGHT} Z" fill="${fill}" stroke="#000" stroke-width="0.2" stroke-linejoin="round"/></svg><span>${letter}</span>`;
}
