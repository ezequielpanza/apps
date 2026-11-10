// Keep the visible seven days before today selectable on the departure dial.
export function earliestDeparture(now = new Date(), savedTimestamp = null) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 7);
    return Number.isFinite(savedTimestamp) ? Math.min(start.getTime(), savedTimestamp) : start.getTime();
}

export function restoredDeparture(value, now = Date.now()) {
    const saved = typeof value === 'string' ? new Date(value).getTime() : NaN;
    return Number.isFinite(saved) ? saved : Math.floor(now / 60000) * 60000;
}

export function nearestHourlyDeparture(value = new Date()) {
    const current = new Date(value instanceof Date ? value.getTime() : value);
    if (!Number.isFinite(current.getTime())) return null;
    const roundUp = current.getMinutes() > 30
        || (current.getMinutes() === 30 && (current.getSeconds() > 0 || current.getMilliseconds() > 0));
    current.setMinutes(0, 0, 0);
    if (roundUp) current.setHours(current.getHours() + 1);
    return current;
}

export function nearestForecastIndex(timestamps, target, now = Date.now()) {
    if (!Array.isArray(timestamps) || !timestamps.length || !Number.isFinite(target)) return -1;
    let closest = -1, delta = Infinity, earliest = Infinity;
    timestamps.forEach((raw, index) => {
        const value = Number(raw);
        if (!Number.isFinite(value) || value <= 0) return;
        const timestamp = value < 1e12 ? value * 1000 : value;
        earliest = Math.min(earliest, timestamp);
        const distance = Math.abs(timestamp - target);
        if (distance < delta) { delta = distance; closest = index; }
    });
    // Never fill a past time outside the model's coverage with a later forecast.
    if (target < now && target < earliest) return -1;
    return delta <= 4 * 3600000 ? closest : -1;
}

// A model's last available value must not be carried beyond its coverage.
export function coveredForecastIndex(timestamps, target, now = Date.now()) {
    if (!Array.isArray(timestamps) || !Number.isFinite(target)) return -1;
    const valid = timestamps.map(Number).filter(value => Number.isFinite(value) && value > 0)
        .map(value => value < 1e12 ? value * 1000 : value);
    if (!valid.length || target < Math.min(...valid) || target > Math.max(...valid)) return -1;
    return nearestForecastIndex(timestamps, target, now);
}
