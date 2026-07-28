(() => {
  if (window.WanderMapCrosshair) return;

  const core = window.WanderMapCore;
  const position = window.WanderMapPosition;
  const context = window.WanderContext;
  if (!core?.map || !position || !window.L) return;

  const map = core.map;
  const container = map.getContainer();
  let frame = 0;
  let state = Object.freeze({ visible: false, distanceM: null, bearingDeg: null, target: null });

  const overlay = document.createElement('div');
  overlay.className = 'wander-map-crosshair';
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="wander-map-crosshair-mark map-point-marker"><span></span></div>
    <div class="wander-map-crosshair-metrics">
      <strong data-crosshair-bearing>—</strong>
      <span data-crosshair-distance>—</span>
    </div>`;
  container.appendChild(overlay);

  const bearingElement = overlay.querySelector('[data-crosshair-bearing]');
  const distanceElement = overlay.querySelector('[data-crosshair-distance]');

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function bearingTo(from, to) {
    const lat1 = from.lat * Math.PI / 180;
    const lat2 = to.lat * Math.PI / 180;
    const deltaLng = (to.lng - from.lng) * Math.PI / 180;
    const y = Math.sin(deltaLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function distanceLabel(meters) {
    if (!Number.isFinite(meters)) return '—';
    if (meters >= 10000) return `${Math.round(meters / 1000)} km`;
    if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
    return `${Math.round(meters)} m`;
  }

  function mapScreenVisible() {
    const screen = window.WanderScreen?.current?.() || document.querySelector('.wander-app')?.dataset?.screen || 'map';
    return screen === 'map';
  }

  function shouldShow() {
    if (!mapScreenVisible()) return false;
    if (window.WanderMapSelectedPoint?.isOpen?.()) return false;
    return position.isFollowingPosition?.() !== true;
  }

  function render() {
    frame = 0;
    const here = position.getPosition?.();
    const target = map.getCenter();
    const visible = Boolean(shouldShow() && here && target);
    overlay.hidden = !visible;

    if (!visible) {
      state = Object.freeze({ visible: false, distanceM: null, bearingDeg: null, target: null });
      context?.remove?.('map.crosshair');
      return state;
    }

    const distanceM = map.distance(here, target);
    const bearingDeg = bearingTo(here, target);
    bearingElement.textContent = `${Math.round(bearingDeg)}°`;
    distanceElement.textContent = distanceLabel(distanceM);
    state = Object.freeze({
      visible: true,
      distanceM,
      bearingDeg,
      target: { lat: Number(target.lat), lng: Number(target.lng) },
    });
    context?.set?.('map.crosshair', { ...state }, { source: 'map-crosshair', kind: 'derived', ttlMs: Infinity, confidence: 1 });
    window.dispatchEvent(new CustomEvent('wander:map-crosshair-change', { detail: { ...state } }));
    return state;
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(render);
  }

  map.on('move zoom resize moveend zoomend', schedule);
  context?.subscribe?.((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) schedule();
  });
  window.addEventListener('wander:screen-change', schedule);
  window.addEventListener('wander:waypoint-selector-ready', schedule);
  window.addEventListener('wander:map-follow-change', schedule);
  document.addEventListener('visibilitychange', schedule);

  const followPoll = window.setInterval(() => {
    if (document.visibilityState !== 'hidden') schedule();
  }, 750);

  window.WanderMapCrosshair = Object.freeze({
    render,
    getState: () => ({ ...state }),
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      clearInterval(followPoll);
      overlay.remove();
      context?.remove?.('map.crosshair');
    },
  });

  render();
})();