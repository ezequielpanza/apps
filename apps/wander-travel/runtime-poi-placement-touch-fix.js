(() => {
  const base = window.WanderBase;
  const map = base?.map;
  const container = map?.getContainer?.();
  if (!map || !container) return;

  let pointerDown = null;

  function placementIsActive() {
    const title = document.querySelector('#wander-title')?.textContent?.trim();
    return title === 'Elegí la ubicación';
  }

  function isBlockedTarget(target) {
    return Boolean(target?.closest?.(
      '.leaflet-control, .wander-top-controls, .wander-card, #context-dashboard, .simulation-map-controls'
    ));
  }

  container.addEventListener('pointerdown', (event) => {
    if (!placementIsActive() || isBlockedTarget(event.target)) {
      pointerDown = null;
      return;
    }
    pointerDown = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, { passive: true });

  container.addEventListener('pointerup', (event) => {
    const start = pointerDown;
    pointerDown = null;
    if (!start || start.id !== event.pointerId || !placementIsActive() || isBlockedTarget(event.target)) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 14) return;

    const rect = container.getBoundingClientRect();
    const point = L.point(event.clientX - rect.left, event.clientY - rect.top);
    const latlng = map.containerPointToLatLng(point);

    window.setTimeout(() => {
      if (!placementIsActive()) return;
      map.fire('click', {
        latlng,
        layerPoint: map.latLngToLayerPoint(latlng),
        containerPoint: point,
        originalEvent: event,
      });
    }, 80);
  }, { passive: true });

  window.WanderPOIPlacementTouchFix = Object.freeze({ active: true });
})();