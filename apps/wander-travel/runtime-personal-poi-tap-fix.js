(() => {
  const map = window.WanderBase?.map;
  const personalPOIs = window.WanderPersonalPOIs;
  if (!map || !personalPOIs?.createAt) return;

  const container = map.getContainer();
  const MOVE_TOLERANCE_PX = 14;
  let pointerState = null;
  let handledAt = 0;

  function placementButton() {
    return container.querySelector('.wander-personal-map-actions .wander-map-action.is-armed');
  }

  function isPlacementArmed() {
    return Boolean(placementButton());
  }

  function isExcludedTarget(target) {
    return Boolean(target?.closest?.(
      '.leaflet-control, .leaflet-marker-icon, .wander-top-controls, .wander-card, #context-dashboard, .simulation-map-controls'
    ));
  }

  function cancelPointer(pointerId = null) {
    if (!pointerState) return;
    if (pointerId !== null && pointerState.pointerId !== pointerId) return;
    pointerState = null;
  }

  function beginPointer(event) {
    if (!isPlacementArmed() || event.isPrimary === false || event.button > 0 || isExcludedTarget(event.target)) return;
    pointerState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  }

  function movePointer(event) {
    if (!pointerState || event.pointerId !== pointerState.pointerId) return;
    const distance = Math.hypot(event.clientX - pointerState.startX, event.clientY - pointerState.startY);
    if (distance > MOVE_TOLERANCE_PX) pointerState.moved = true;
  }

  function finishPointer(event) {
    if (!pointerState || event.pointerId !== pointerState.pointerId) return;
    const state = pointerState;
    pointerState = null;
    if (state.moved || !isPlacementArmed() || isExcludedTarget(event.target)) return;

    const rect = container.getBoundingClientRect();
    const point = L.point(event.clientX - rect.left, event.clientY - rect.top);
    const latLng = map.containerPointToLatLng(point);

    const button = placementButton();
    button?.classList.remove('is-armed');
    handledAt = Date.now();

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    personalPOIs.createAt(latLng);
  }

  function suppressSyntheticClick(event) {
    if (Date.now() - handledAt > 900) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  container.addEventListener('pointerdown', beginPointer, true);
  container.addEventListener('pointermove', movePointer, true);
  container.addEventListener('pointerup', finishPointer, true);
  container.addEventListener('pointercancel', (event) => cancelPointer(event.pointerId), true);
  container.addEventListener('click', suppressSyntheticClick, true);

  window.WanderPersonalPOITapFix = Object.freeze({
    isPlacementArmed,
  });
})();