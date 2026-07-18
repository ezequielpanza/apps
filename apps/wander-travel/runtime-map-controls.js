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
  let anchorFrame = 0;
  let pinchActive = false;
  let pinchMoved = false;
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

  function lowerPivotPoint() {
    const size = map.getSize();
    return L.point(size.x / 2, size.y * 0.72);
  }

  function centerForAnchor(anchor, zoom = map.getZoom()) {
    if (centerMode !== 'lower') return L.latLng(anchor);
    const size = map.getSize();
    const projectedAnchor = map.project(anchor, zoom);
    return map.unproject(projectedAnchor.add(size.divideBy(2)).subtract(lowerPivotPoint()), zoom);
  }

  function centersMatch(left, right) {
    if (!left || !right) return false;
    try { return map.distance(left, right) < 0.25; } catch { return false; }
  }

  function followPosition(anchor = position.getPosition?.()) {
    if (!position.isFollowingPosition() || !anchor) return false;
    const target = centerForAnchor(anchor, map.getZoom());
    if (!centersMatch(map.getCenter(), target)) {
      map.panTo(target, { animate: false, noMoveStart: true });
    }
    return true;
  }

  function scheduleFollowPosition() {
    if (pinchActive || !position.isFollowingPosition()) return;
    if (anchorFrame) cancelAnimationFrame(anchorFrame);
    anchorFrame = requestAnimationFrame(() => {
      anchorFrame = 0;
      followPosition();
    });
  }

  function syncZoomAnchorMode() {
    map.options.scrollWheelZoom = true;
    map.options.doubleClickZoom = true;
    map.options.touchZoom = true;
  }

  function touchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function consumeTouch(event) {
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
      if (anchorFrame) {
        cancelAnimationFrame(anchorFrame);
        anchorFrame = 0;
      }
      pinchActive = true;
      pinchMoved = false;
      pinchStartDistance = Math.max(1, touchDistance(event.touches));
      pinchStartZoom = map.getZoom();
      pinchAnchor = L.latLng(anchor);
      map._stop?.();
      consumeTouch(event);
    }, { capture: true, passive: false });

    container.addEventListener('touchmove', (event) => {
      if (!pinchActive || event.touches.length !== 2 || !pinchAnchor) return;
      const scale = touchDistance(event.touches) / pinchStartDistance;
      const rawZoom = pinchStartZoom + Math.log2(Math.max(0.01, scale));
      const zoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), rawZoom));
      const center = centerForAnchor(pinchAnchor, zoom);
      if (!pinchMoved) {
        pinchMoved = true;
        map._moveStart?.(true, false);
      }
      map._move(center, zoom, { pinch: true, round: false });
      consumeTouch(event);
    }, { capture: true, passive: false });

    const finishPinch = (event) => {
      if (!pinchActive) return;
      if (event.touches && event.touches.length >= 2) return;
      consumeTouch(event);
      const anchor = pinchAnchor;
      const moved = pinchMoved;
      pinchActive = false;
      pinchMoved = false;
      pinchAnchor = null;
      if (!moved || !anchor) return;

      const snap = Number(map.options.zoomSnap) || 1;
      const zoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), Math.round(map.getZoom() / snap) * snap));
      const center = centerForAnchor(anchor, zoom);
      requestAnimationFrame(() => {
        map._move(center, zoom, { pinch: true, round: true });
        map._moveEnd?.(true);
        scheduleFollowPosition();
      });
    };

    container.addEventListener('touchend', finishPinch, { capture: true, passive: false });
    container.addEventListener('touchcancel', finishPinch, { capture: true, passive: false });
  }

  function setFollowMode(next, options = {}) {
    const centerNow = options.centerNow !== false;
    const result = position.setFollowMode(next, { centerNow: false });
    if (next && result) followSuspendedByDrag = false;
    syncZoomAnchorMode();
    syncFollowButton();
    if (result && centerNow) scheduleFollowPosition();
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
    if (!setFollowMode(true, { centerNow: false })) {
      window.WanderUI?.showToast?.('Sin ubicación', 'Todavía no hay una posición válida');
      return false;
    }
    scheduleFollowPosition();
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
      scheduleFollowPosition();
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

  map.on('zoomend resize', scheduleFollowPosition);

  context?.subscribe?.((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) scheduleFollowPosition();
  });

  window.WanderMapControls = {
    setFollowMode,
    followPosition,
    syncFollowButton,
    syncZoomAnchorMode,
    getCenterMode: () => centerMode,
    setCenterMode(mode) {
      centerMode = mode === 'lower' ? 'lower' : 'middle';
      persistCenterMode();
      syncZoomAnchorMode();
      scheduleFollowPosition();
      syncFollowButton();
      return centerMode;
    },
    cycleCenterMode,
    openCenterSettings,
  };

  persistCenterMode();
  syncZoomAnchorMode();
})();
