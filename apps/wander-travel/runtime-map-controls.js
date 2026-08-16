(() => {
  const core = window.WanderMapCore;
  const position = window.WanderMapPosition;
  const context = window.WanderContext;
  if (!core || !position) return;

  const map = core.map;
  const CENTER_MODE_KEY = 'wander.map.centerMode.v1';
  let centerButton = null;
  let anchorFrame = 0;
  let pinchActive = false;
  let pinchMoved = false;
  let pinchStartDistance = 0;
  let pinchStartZoom = 0;
  let pinchAnchor = null;
  let residualTouchLock = false;
  let draggingWasEnabled = false;

  function persistCenterMode() {
    const mode = position.isFollowingPosition() ? 'middle' : 'off';
    try { localStorage.setItem(CENTER_MODE_KEY, mode); } catch {}
    context?.set?.('map.centerMode', mode, { source: 'map-controls', kind: 'confirmed', confidence: 1 });
  }

  function centerIconMarkup(active = false) {
    const dotFill = active ? '#01E0CB' : 'none';
    const dotStroke = active ? '#01E0CB' : 'currentColor';
    return '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="5" fill="' + dotFill + '" stroke="' + dotStroke + '"></circle>' +
      '<path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path>' +
      '</svg>';
  }

  function syncFollowButton() {
    if (!centerButton) return;
    const following = position.isFollowingPosition();
    const label = following
      ? 'Centrado en mi posición. Tocar para liberar el mapa'
      : 'Centrar mi posición en el medio de la pantalla';
    centerButton.setAttribute('aria-pressed', String(following));
    centerButton.setAttribute('aria-label', label);
    centerButton.title = label;
    centerButton.dataset.centerMode = following ? 'middle' : 'off';
    centerButton.innerHTML = centerIconMarkup(following);
    centerButton.style.color = following ? 'var(--accent)' : 'var(--green)';
    centerButton.style.boxShadow = following ? '0 0 0 3px var(--accent-ring), var(--shadow)' : 'var(--shadow)';
    persistCenterMode();
  }

  function centerForAnchor(anchor) {
    return L.latLng(anchor);
  }

  function centersMatch(left, right) {
    if (!left || !right) return false;
    try { return map.distance(left, right) < 0.25; } catch { return false; }
  }

  function followPosition(anchor = position.getPosition?.()) {
    if (!position.isFollowingPosition() || !anchor) return false;
    const target = centerForAnchor(anchor);
    if (!centersMatch(map.getCenter(), target)) map.panTo(target, { animate: false, noMoveStart: true });
    return true;
  }

  function scheduleFollowPosition() {
    if (pinchActive || residualTouchLock || !position.isFollowingPosition()) return;
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

    function releaseResidualTouchLock() {
      residualTouchLock = false;
      if (draggingWasEnabled) map.dragging?.enable?.();
      draggingWasEnabled = false;
      scheduleFollowPosition();
    }

    container.addEventListener('touchstart', (event) => {
      if (residualTouchLock) {
        consumeTouch(event);
        return;
      }
      if (!position.isFollowingPosition() || event.touches.length !== 2) return;
      const anchor = position.getPosition?.();
      if (!anchor) return;
      if (anchorFrame) {
        cancelAnimationFrame(anchorFrame);
        anchorFrame = 0;
      }
      draggingWasEnabled = map.dragging?.enabled?.() === true;
      if (draggingWasEnabled) map.dragging.disable();
      pinchActive = true;
      pinchMoved = false;
      pinchStartDistance = Math.max(1, touchDistance(event.touches));
      pinchStartZoom = map.getZoom();
      pinchAnchor = L.latLng(anchor);
      map._stop?.();
      consumeTouch(event);
    }, { capture: true, passive: false });

    container.addEventListener('touchmove', (event) => {
      if (residualTouchLock) {
        consumeTouch(event);
        return;
      }
      if (!pinchActive || event.touches.length !== 2 || !pinchAnchor) return;
      const scale = touchDistance(event.touches) / pinchStartDistance;
      const rawZoom = pinchStartZoom + Math.log2(Math.max(0.01, scale));
      const zoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), rawZoom));
      const center = centerForAnchor(pinchAnchor);
      if (!pinchMoved) {
        pinchMoved = true;
        map._moveStart?.(true, false);
      }
      map._move(center, zoom, { pinch: true, round: false });
      consumeTouch(event);
    }, { capture: true, passive: false });

    const finishPinch = (event) => {
      if (!pinchActive) {
        if (!residualTouchLock) return;
        consumeTouch(event);
        if (!event.touches || event.touches.length === 0) releaseResidualTouchLock();
        return;
      }
      if (event.touches && event.touches.length >= 2) return;
      consumeTouch(event);
      const anchor = pinchAnchor;
      const moved = pinchMoved;
      residualTouchLock = Boolean(event.touches?.length);
      pinchActive = false;
      pinchMoved = false;
      pinchAnchor = null;
      if (!moved || !anchor) {
        if (!residualTouchLock) releaseResidualTouchLock();
        return;
      }

      const snap = Number(map.options.zoomSnap) || 1;
      const zoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), Math.round(map.getZoom() / snap) * snap));
      requestAnimationFrame(() => {
        map._move(centerForAnchor(anchor), zoom, { pinch: true, round: true });
        map._moveEnd?.(true);
        if (!residualTouchLock) releaseResidualTouchLock();
      });
    };

    container.addEventListener('touchend', finishPinch, { capture: true, passive: false });
    container.addEventListener('touchcancel', finishPinch, { capture: true, passive: false });
  }

  function setFollowMode(next, options = {}) {
    const centerNow = options.centerNow !== false;
    const result = position.setFollowMode(next === true, { centerNow: false });
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

  function activateCentering() {
    if (!setFollowMode(true, { centerNow: false })) {
      window.WanderUI?.showToast?.('Sin ubicación', 'Todavía no hay una posición válida');
      return false;
    }
    scheduleFollowPosition();
    return true;
  }

  function cycleCenterMode() {
    if (position.isFollowingPosition()) {
      setFollowMode(false, { centerNow: false });
      return 'off';
    }
    activateCentering();
    return 'middle';
  }

  function openCenterSettings() { return cycleCenterMode(); }

  const MapActions = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'wander-map-actions wander-standard-map-actions');
      const waypointButton = mapButton('pin', 'Seleccionar punto en el centro del mapa');
      const layerButton = mapButton('layers', 'Cambiar a mapa satélite');
      centerButton = mapButton('center', 'Centrar mi posición');
      centerButton.setAttribute('aria-pressed', 'false');

      waypointButton.classList.add('wander-waypoint-map-action');
      waypointButton.addEventListener('click', (event) => {
        event.preventDefault();
        if (window.WanderMapSelectedPoint?.openAtCenter) window.WanderMapSelectedPoint.openAtCenter();
        else window.dispatchEvent(new CustomEvent('wander:open-waypoint-center'));
      });
      layerButton.addEventListener('click', () => {
        const active = core.toggleBaseLayer();
        const nextLabel = active === 'streets' ? 'Cambiar a mapa satélite' : 'Cambiar a mapa de calles';
        layerButton.setAttribute('aria-label', nextLabel);
        layerButton.title = nextLabel;
      });
      centerButton.addEventListener('click', cycleCenterMode);
      wrap.append(waypointButton, layerButton, centerButton);
      syncFollowButton();
      return wrap;
    },
  });

  map.addControl(new MapActions());
  installLockedPinchZoom();

  map.on('dragstart', () => {
    if (pinchActive || residualTouchLock || !position.isFollowingPosition()) return;
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
    getCenterMode: () => position.isFollowingPosition() ? 'middle' : 'off',
    setCenterMode(mode) {
      if (mode === 'off' || mode === false) {
        setFollowMode(false, { centerNow: false });
        return 'off';
      }
      activateCentering();
      return 'middle';
    },
    cycleCenterMode,
    openCenterSettings,
  };

  try {
    if (localStorage.getItem(CENTER_MODE_KEY) === 'lower') localStorage.setItem(CENTER_MODE_KEY, 'middle');
  } catch {}
  syncZoomAnchorMode();
  setFollowMode(true, { centerNow: true });
})();