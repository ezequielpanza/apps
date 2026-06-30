(() => {
  if (window.__wanderMotionStateStabilizer) return;
  window.__wanderMotionStateStabilizer = true;
  if (typeof marker === 'undefined' || typeof L === 'undefined') return;

  const MOVING_SPEED_MPS = 0.85;
  const STILL_SPEED_MPS = 0.25;
  const MOVING_DISTANCE_M = 3;
  const STILL_DISTANCE_M = 1.2;
  const MOVING_CONFIRMATIONS = 2;
  const STILL_CONFIRMATIONS = 5;
  const STILL_TIME_MS = 4500;

  let stableMoving = false;
  let movingScore = 0;
  let stillScore = 0;
  let lastPoint = null;
  let lastStillAt = Date.now();
  let lastRenderedMoving = null;
  let lastRenderedBearing = null;

  function normalize(value) {
    return ((Number(value) || 0) % 360 + 360) % 360;
  }

  function delta(from, to) {
    return Math.abs(((normalize(to) - normalize(from) + 540) % 360) - 180);
  }

  function distanceMeters(a, b) {
    try {
      if (!a || !b || typeof map === 'undefined') return 0;
      return map.distance(L.latLng(a.lat, a.lng), L.latLng(b.lat, b.lng));
    } catch {
      return 0;
    }
  }

  function setStableIcon(moving, bearing) {
    const cleanBearing = normalize(bearing);
    const shouldRender = lastRenderedMoving !== moving || !Number.isFinite(lastRenderedBearing) || delta(lastRenderedBearing, cleanBearing) > 8;
    if (!shouldRender) return;

    const icon = L.divIcon({
      className: '',
      html: moving ? `<div class="wander-user-arrow" style="--wander-user-bearing:${cleanBearing}deg"></div>` : '<div class="wander-user-dot"></div>',
      iconSize: moving ? [30, 30] : [18, 18],
      iconAnchor: moving ? [15, 15] : [9, 9],
    });
    marker.setIcon(icon);
    lastRenderedMoving = moving;
    lastRenderedBearing = cleanBearing;
  }

  function update(detail) {
    if (!detail) return;
    const speed = Number(detail.speed_mps) || 0;
    const point = detail.location;
    const moved = distanceMeters(lastPoint, point);
    const now = Date.now();
    const movingSignal = speed >= MOVING_SPEED_MPS || moved >= MOVING_DISTANCE_M;
    const stillSignal = speed <= STILL_SPEED_MPS && moved <= STILL_DISTANCE_M;

    if (movingSignal) {
      movingScore += 1;
      stillScore = 0;
      lastStillAt = now;
    } else if (stillSignal) {
      stillScore += 1;
      movingScore = Math.max(0, movingScore - 1);
    } else {
      movingScore = Math.max(0, movingScore - 1);
      stillScore = Math.max(0, stillScore - 1);
    }

    if (!stableMoving && movingScore >= MOVING_CONFIRMATIONS) {
      stableMoving = true;
      movingScore = MOVING_CONFIRMATIONS;
      stillScore = 0;
    }

    if (stableMoving && stillScore >= STILL_CONFIRMATIONS && now - lastStillAt >= STILL_TIME_MS) {
      stableMoving = false;
      stillScore = STILL_CONFIRMATIONS;
      movingScore = 0;
    }

    setStableIcon(stableMoving, detail.heading_degrees || 0);
    if (point) lastPoint = { lat: point.lat, lng: point.lng };
  }

  document.addEventListener('wander:motion-context', (event) => update(event.detail));
  window.setTimeout(() => update(window.wanderMotionContext), 50);
})();