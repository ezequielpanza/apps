const rad = degrees => degrees * Math.PI / 180;
export function visibleMapCenter(mapRect, viewport, topPanel, bottomPanel) {
    const left = Math.max(mapRect.left, viewport.left), right = Math.min(mapRect.right, viewport.right);
    let top = Math.max(mapRect.top, viewport.top), bottom = Math.min(mapRect.bottom, viewport.bottom);
    if (right <= left || bottom <= top) return null;
    if (topPanel && topPanel.right > left && topPanel.left < right && topPanel.bottom > top && topPanel.top < bottom) top = Math.min(bottom, topPanel.bottom);
    if (bottomPanel && bottomPanel.right > left && bottomPanel.left < right && bottomPanel.bottom > top && bottomPanel.top < bottom) bottom = Math.max(top, bottomPanel.top);
    if (bottom <= top) return null;
    return { x: (left + right) / 2 - mapRect.left, y: (top + bottom) / 2 - mapRect.top };
}
export function destinationAtBearing(start, bearing, distance) {
    const latitude = rad(start.lat), longitude = rad(start.lon), angle = rad(bearing), arc = distance / 3440.065;
    const endLat = Math.asin(Math.sin(latitude) * Math.cos(arc) + Math.cos(latitude) * Math.sin(arc) * Math.cos(angle));
    const endLon = longitude + Math.atan2(Math.sin(angle) * Math.sin(arc) * Math.cos(latitude), Math.cos(arc) - Math.sin(latitude) * Math.sin(endLat));
    return { lat: endLat * 180 / Math.PI, lon: endLon * 180 / Math.PI };
}
export function distanceNm(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 3440.065 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
}
export function bearingTrue(a, b) {
    const dLon = rad(b.lon - a.lon), lat1 = rad(a.lat), lat2 = rad(b.lat);
    return (Math.atan2(Math.sin(dLon) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)) * 180 / Math.PI + 360) % 360;
}
export function courseFromFixes(previous, current) {
    if (!previous || !current || current.timestamp <= previous.timestamp) return null;
    const distanceMeters = distanceNm(previous, current) * 1852;
    const uncertaintyMeters = Math.max(5, previous.accuracy || 0, current.accuracy || 0);
    if (!Number.isFinite(distanceMeters) || distanceMeters < uncertaintyMeters) return null;
    return bearingTrue(previous, current);
}
function projectOnLeg(position, start, end) {
    const scale = Math.cos(rad(position.lat));
    const x = point => (((point.lon - position.lon + 540) % 360) - 180) * scale * 60;
    const y = point => (point.lat - position.lat) * 60;
    const ax = x(start), ay = y(start), bx = x(end), by = y(end);
    const dx = bx - ax, dy = by - ay, lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < 1e-12) return { fraction: 0, crossTrack: Math.hypot(ax, ay) };
    const fraction = -(ax * dx + ay * dy) / lengthSquared;
    return { fraction, crossTrack: Math.abs(ax * dy - ay * dx) / Math.sqrt(lengthSquared) };
}
export function routeProgress(position, points, targetIndex) {
    if (!position || points.length < 2 || targetIndex < 0 || targetIndex >= points.length) return null;
    const lengths = points.slice(1).map((point, i) => distanceNm(points[i], point));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    if (!Number.isFinite(total) || total <= 0) return null;
    if (targetIndex === 0) return 0;
    const leg = targetIndex - 1;
    const fraction = Math.max(0, Math.min(1, projectOnLeg(position, points[leg], points[targetIndex]).fraction));
    return (lengths.slice(0, leg).reduce((sum, length) => sum + length, 0) + lengths[leg] * fraction) / total;
}
export function averageRouteSpeed(position, points, targetIndex, departureTime, fixTime) {
    if (!Number.isFinite(departureTime) || !Number.isFinite(fixTime) || fixTime - departureTime < 60000) return null;
    const progress = routeProgress(position, points, targetIndex);
    if (progress === null) return null;
    const total = points.slice(1).reduce((sum, point, i) => sum + distanceNm(points[i], point), 0);
    const speed = progress * total / ((fixTime - departureTime) / 3600000);
    return Number.isFinite(speed) ? speed : null;
}
export function chooseNextWaypoint(position, points) {
    if (!position || !points.length) return -1;
    if (points.length === 1) return 0;
    let best = Infinity, index = 1;
    for (let i = 0; i < points.length - 1; i++) {
        const leg = projectOnLeg(position, points[i], points[i + 1]);
        const fraction = Math.max(0, Math.min(1, leg.fraction));
        const alongBeyond = Math.abs(leg.fraction - fraction) * distanceNm(points[i], points[i + 1]);
        const distance = Math.hypot(leg.crossTrack, alongBeyond);
        if (distance < best) { best = distance; index = i === 0 && leg.fraction < 0 ? 0 : i + 1; }
    }
    return index;
}
export function reachedWaypoint(position, points, index) {
    if (!position || index < 0 || index >= points.length - 1) return false;
    const distance = distanceNm(position, points[index]);
    if (distance <= 0.1) return true;
    if (index === 0 || distance > 1) return false;
    const leg = projectOnLeg(position, points[index - 1], points[index]);
    return leg.fraction >= 1 && leg.crossTrack <= 0.3;
}
export function advanceWaypoint(position, points, index, confirmations) {
    const nextConfirmations = reachedWaypoint(position, points, index) ? confirmations + 1 : 0;
    return nextConfirmations >= 2 && index < points.length - 1
        ? { index: index + 1, confirmations: 0 }
        : { index, confirmations: nextConfirmations };
}
export function navigationMetrics(position, points, index, speedKnots) {
    if (!position || index < 0 || index >= points.length) return null;
    const distanceNext = distanceNm(position, points[index]);
    let distanceFinal = distanceNext;
    for (let i = index; i < points.length - 1; i++) distanceFinal += distanceNm(points[i], points[i + 1]);
    const speed = Number.isFinite(speedKnots) && speedKnots >= 0.5 ? speedKnots : null;
    return { bearing: distanceNext > 0.001 ? bearingTrue(position, points[index]) : null, distanceNext, distanceFinal, hoursNext: speed ? distanceNext / speed : null, hoursFinal: speed ? distanceFinal / speed : null };
}
