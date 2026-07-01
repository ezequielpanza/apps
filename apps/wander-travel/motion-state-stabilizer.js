(() => {
  if (window.__wanderMotionStateStabilizer) return;
  window.__wanderMotionStateStabilizer = true;
  if (typeof marker === 'undefined' || typeof L === 'undefined') return;

  let lastMoving = null;
  let lastBearing = null;

  const normalize = (value) => ((Number(value) || 0) % 360 + 360) % 360;
  const delta = (a, b) => Math.abs(((normalize(b) - normalize(a) + 540) % 360) - 180);

  function draw(moving, bearing = 0) {
    const cleanBearing = normalize(bearing);
    if (lastMoving === moving && Number.isFinite(lastBearing) && delta(lastBearing, cleanBearing) <= 8) return;
    marker.setIcon(L.divIcon({
      className: '',
      html: moving ? `<div class="wander-user-arrow" style="--wander-user-bearing:${cleanBearing}deg"></div>` : '<div class="wander-user-dot"></div>',
      iconSize: moving ? [30, 30] : [18, 18],
      iconAnchor: moving ? [15, 15] : [9, 9],
    }));
    lastMoving = moving;
    lastBearing = cleanBearing;
  }

  function update(detail) {
    if (!detail) {
      draw(false, 0);
      return;
    }
    const speed = Number(detail.speed_mps) || 0;
    const moving = detail.moving === true && speed > 0.6;
    draw(moving, detail.heading_degrees || 0);
  }

  draw(false, 0);
  document.addEventListener('wander:motion-context', (event) => update(event.detail));
  setTimeout(() => update(window.wanderMotionContext), 50);
  setTimeout(() => update(window.wanderMotionContext), 500);
})();