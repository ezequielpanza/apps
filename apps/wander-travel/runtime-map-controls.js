(() => {
  const core = window.WanderMapCore;
  const position = window.WanderMapPosition;
  const context = window.WanderContext;
  if (!core || !position) return;

  const map = core.map;
  const CENTER_MODE_KEY = 'wander.map.centerMode.v1';
  let centerButton = null;
  let centerMode = loadCenterMode();
  let followSuspendedByDrag = false;
  let zoomAnchorFrame = 0;
  let pinchActive = false;
  let pinchStartDistance = 0;
  let pinchStartZoom = 0;
  let pinchAnchor = null;

  function loadCenterMode() {
    try {
      const stored = localStorage.getItem(CENTER_MODE_KEY);
      return stored === 'lower' ? 'lower' : 'middle';
    } catch { return 'middle'; }
  }

  function persistCenterMode() {
    try { localStorage.setItem(CENTER_MODE_KEY, centerMode); } catch {}
    context?.set?.('map.centerMode', centerMode, { source: 'map-controls', kind: 'confirmed', confidence: 1 });
  }

  function centerIconMarkup(active = false) {
    const dotFill = active ? '#01E0CB' : 'none';
    const dotStroke = active ? '#01E0CB' : 'currentColor';
    const lowerMark = active && centerMode === 'lower' ? '<path d="M8.5 16.5h7" stroke-width="1.7"></path>' : '';
    return '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="5" fill="' + dotFill + '" stroke="' + dotStroke + '"></circle>' +
      '<path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path>' + lowerMark +
      '</svg>';
  }

  function syncFollowButton() {
    if (!centerButton) return;
    const following = position.isFollowingPosition();
    let label = 'Centrar mi posición';
    if (following && centerMode === 'middle') label = 'Centrado normal. Tocar para centrar abajo';
    if (following && centerMode === 'lower') label = 'Centrado inferior. Tocar para desactivar';
    if (!following && followSuspendedByDrag) label = 'Recuperar el centrado anterior';
    centerButton.setAttribute('aria-pressed', String(following));
    centerButton.setAttribute('aria-label', label);
    centerButton.title = label;
    centerButton.dataset.centerMode = following ? centerMode : (followSuspendedByDrag ? 'suspended' : 'off');
    centerButton.innerHTML = centerIconMarkup(following);
    centerButton.style.color = following ? 'var(--accent)' : 'var(--green)';
    centerButton.style.boxShadow = following ? '0 0 0 3px var(--accent-ring), var(--shadow)' : 'var(--shadow)';
  }

  function zoomPivotPoint() {
    const size = map.getSize();
    const y = position.isFollowingPosition() && centerMode === 'lower' ? size.y * 0.72 : size.y / 2;
    return L.point(size.x / 2, y);
  }

  function centerForAnchor(anchor, zoom) {
    const size = map.getSize();
    const pivot = zoomPivotPoint();
    const projectedAnchor = map.project(anchor, zoom);
    return map.unproject(projectedAnchor.add(size.divideBy(2)).subtract(pivot), zoom);
  }

  function syncZoomAnchorMode() {
    const following = position.isFollowingPosition();
    map.options.scrollWheelZoom = following && centerMode === 'middle' ? 'center' : true;
    map.options.doubleClickZoom = following && centerMode === 'middle' ? 'center' : true;
    map.options.touchZoom = true;
  }

  function applyCenterAnchor() {
    if (pinchActive || !position.isFollowingPosition() || centerMode !== 'lower') return;
    const point = position.getPosition?.();
    if (!point) return;
    const exactCenter = centerForAnchor(point, map.getZoom());
    if (!map.getCenter().equals(exactCenter, 1e-9)) map.panTo(exactCenter, { animate: false, noMoveStart: true });
  }

  function scheduleCenterAnchor() {
    if (pinchActive) return;
    if (zoomAnchorFrame) cancelAnimationFrame(zoomAnchorFrame);
    zoomAnchorFrame = requestAnimationFrame(() => {
      zoomAnchorFrame = 0;
      applyCenterAnchor();
    });
  }

  function touchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function stopTouch(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function installLockedPinchZoom() {
    const container = map.getContainer();
    if (container.dataset.wanderLockedPinch === 'true') return;
    container.dataset.wanderLockedPinch = 'true';

    container.addEventListener('touchstart', (event) => {
      if (!position.isFollowingPosition() || event.touches.length !== 2) return;
      const anchor = position.getPosition?.();
      if (!anchor) return;
      pinchActive = true;
      pinchStartDistance = Math.max(1, touchDistance(event.touches));
      pinchStartZoom = map.getZoom();
      pinchAnchor = L.latLng(anchor);
      map._stop?.();
      map.fire('zoomstart');
      stopTouch(event);
    }, { capture: true, passive: false });

    container.addEventListener('touchmove', (event) => {
      if (!pinchActive || event.touches.length !== 2 || !pinchAnchor) return;
      const scale = touchDistance(event.touches) / pinchStartDistance;
      const rawZoom = pinchStartZoom + Math.log2(Math.max(0.01, scale));
      const zoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), rawZoom));
      const center = centerForAnchor(pinchAnchor, zoom);
      map._move(center, zoom, { pinch: true, round: false });
      stopTouch(event);
    }, { capture: true, passive: false });

    const finishPinch = (event) => {
      if (!pinchActive) return;
      if (event.touches && event.touches.length >= 2) return;
      stopTouch(event);
      const snap = Number(map.options.zoomSnap) || 1;
      const zoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), Math.round(map.getZoom() / snap) * snap));
      const center = pinchAnchor ? centerForAnchor(pinchAnchor, zoom) : map.getCenter();
      pinchActive = false;
      pinchAnchor = null;
      map.setView(center, zoom, { animate: false, reset: false });
      map.fire('zoomend');
    };

    container.addEventListener('touchend', finishPinch, { capture: true, passive: false });
    container.addEventListener('touchcancel', finishPinch, { capture: true, passive: false });
  }

  function setFollowMode(next, options = {}) {
    const result = position.setFollowMode(next, options);
    if (next) followSuspendedByDrag = false;
    syncZoomAnchorMode();
    syncFollowButton();
    scheduleCenterAnchor();
    return result;
  }

  function mapButton(iconName, label) {
    const button = L.DomUtil.create('button', 'wander-map-action');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="wander-icons.svg#' + iconName + '"></use></svg>';
    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.disableScrollPropagation(button);
    return button;
  }

  function activateCurrentCenterMode() {
    if (!setFollowMode(true)) {
      window.WanderUI?.showWander('Sin ubicación', 'Todavía no hay una ubicación efectiva válida para activar el seguimiento.');
      return false;
    }
    position.centerOnPosition?.();
    scheduleCenterAnchor();
    return true;
  }

  function cycleCenterMode() {
    if (followSuspendedByDrag) return void activateCurrentCenterMode();
    if (!position.isFollowingPosition()) {
      centerMode = 'middle';
      persistCenterMode();
      activateCurrentCenterMode();
      return;
    }
    if (centerMode === 'middle') {
      centerMode = 'lower';
      persistCenterMode();
      syncZoomAnchorMode();
      position.centerOnPosition?.();
      scheduleCenterAnchor();
      syncFollowButton();
      return;
    }
    setFollowMode(false, { centerNow: false });
  }

  function openCenterSettings() { cycleCenterMode(); }

  const MapActions = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'wander-map-actions wander-standard-map-actions');
      const layerButton = mapButton('layers', 'Cambiar a mapa satélite');
      centerButton = mapButton('center', 'Centrar mi posición');
      centerButton.setAttribute('aria-pressed', 'false');
      layerButton.addEventListener('click', () => {
        const active = core.toggleBaseLayer();
        const nextLabel = active === 'streets' ? 'Cambiar a mapa satélite' : 'Cambiar a mapa de calles';
        layerButton.setAttribute('aria-label', nextLabel);
        layerButton.title = nextLabel;
      });
      centerButton.addEventListener('click', cycleCenterMode);
      wrap.append(layerButton, centerButton);
      syncFollowButton();
      return wrap;
    },
  });

  map.addControl(new MapActions());
  installLockedPinchZoom();

  map.on('dragstart', () => {
    if (pinchActive || !position.isFollowingPosition()) return;
    followSuspendedByDrag = true;
    position.setFollowMode(false, { centerNow: false });
    syncZoomAnchorMode();
    syncFollowButton();
  });
  map.on('zoomend resize', scheduleCenterAnchor);

  context?.subscribe?.((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) scheduleCenterAnchor();
  });

  window.WanderMapControls = {
    setFollowMode,
    syncFollowButton,
    syncZoomAnchorMode,
    getCenterMode: () => centerMode,
    setCenterMode(mode) {
      centerMode = mode === 'lower' ? 'lower' : 'middle';
      persistCenterMode();
      syncZoomAnchorMode();
      scheduleCenterAnchor();
      syncFollowButton();
      return centerMode;
    },
    cycleCenterMode,
    openCenterSettings,
  };

  persistCenterMode();
  syncZoomAnchorMode();
})();