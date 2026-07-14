(() => {
  const map = window.WanderBase?.map;
  const personalPOIs = window.WanderPersonalPOIs;
  if (!map || !personalPOIs?.createAt) return;

  const container = map.getContainer();
  const MOVE_TOLERANCE_PX = 18;
  let gesture = null;
  let handledAt = 0;

  function placementButton() {
    return container.querySelector('.wander-personal-map-actions .wander-map-action.is-armed');
  }

  function isPlacementArmed() {
    return Boolean(placementButton());
  }

  function insideMap(x, y) {
    const rect = container.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function isExcludedTarget(target) {
    return Boolean(target?.closest?.(
      '.leaflet-control, .leaflet-marker-icon, .wander-top-controls, .wander-card, #context-dashboard, .simulation-map-controls, .personal-poi-sheet'
    ));
  }

  function pointFromEvent(event) {
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      return { x: event.clientX, y: event.clientY };
    }
    const touch = event.changedTouches?.[0] || event.touches?.[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function begin(event) {
    if (!isPlacementArmed() || isExcludedTarget(event.target)) return;
    const point = pointFromEvent(event);
    if (!point || !insideMap(point.x, point.y)) return;
    gesture = { x: point.x, y: point.y, moved: false };
  }

  function move(event) {
    if (!gesture) return;
    const point = pointFromEvent(event);
    if (!point) return;
    if (Math.hypot(point.x - gesture.x, point.y - gesture.y) > MOVE_TOLERANCE_PX) gesture.moved = true;
  }

  function finish(event) {
    if (!gesture) return;
    const start = gesture;
    gesture = null;
    const point = pointFromEvent(event);
    if (!point || start.moved || !isPlacementArmed() || !insideMap(point.x, point.y) || isExcludedTarget(event.target)) return;

    const rect = container.getBoundingClientRect();
    const containerPoint = L.point(point.x - rect.left, point.y - rect.top);
    const latLng = map.containerPointToLatLng(containerPoint);

    placementButton()?.classList.remove('is-armed');
    handledAt = Date.now();

    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();

    const saved = personalPOIs.createAt(latLng);
    if (saved) {
      const card = document.querySelector('#wander-card');
      if (card) card.hidden = true;
      navigator.vibrate?.(25);
    }
  }

  function clickFallback(event) {
    if (Date.now() - handledAt < 1000) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      return;
    }
    if (!isPlacementArmed() || isExcludedTarget(event.target)) return;
    const point = pointFromEvent(event);
    if (!point || !insideMap(point.x, point.y)) return;
    gesture = { x: point.x, y: point.y, moved: false };
    finish(event);
  }

  document.addEventListener('pointerdown', begin, true);
  document.addEventListener('pointermove', move, true);
  document.addEventListener('pointerup', finish, true);
  document.addEventListener('pointercancel', () => { gesture = null; }, true);
  document.addEventListener('touchstart', begin, { capture: true, passive: true });
  document.addEventListener('touchmove', move, { capture: true, passive: true });
  document.addEventListener('touchend', finish, { capture: true, passive: false });
  document.addEventListener('click', clickFallback, true);

  window.WanderPersonalPOITapFix = Object.freeze({ isPlacementArmed });
})();