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
    const lowerMark = active && centerMode === 'lower'
      ? '<path d="M8.5 16.5h7" stroke-width="1.7"></path>'
      : '';
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

  function syncZoomAnchorMode() {
    const following = position.isFollowingPosition();
    const mode = following ? true : true;
    map.options.scrollWheelZoom = following && centerMode === 'middle' ? 'center' : mode;
    map.options.doubleClickZoom = following && centerMode === 'middle' ? 'center' : mode;
    map.options.touchZoom = mode;
  }

  function installLockedTouchZoomPivot() {
    const handler = map.touchZoom;
    if (!handler || handler._wanderPivotLocked || typeof handler._onTouchStart !== 'function' || typeof handler._onTouchMove !== 'function') return;

    const wasEnabled = handler.enabled?.() === true;
    if (wasEnabled) handler.disable();

    const originalTouchStart = handler._onTouchStart;
    const originalTouchMove = handler._onTouchMove;

    function lockTouchesToPivot(event) {
      if (!position.isFollowingPosition() || !event?.touches || event.touches.length !== 2) return event;
      const rect = map.getContainer().getBoundingClientRect();
      const pivot = zoomPivotPoint();
      const targetX = rect.left + pivot.x;
      const targetY = rect.top + pivot.y;
      const a = event.touches[0];
      const b = event.touches[1];
      const midX = (a.clientX + b.clientX) / 2;
      const midY = (a.clientY + b.clientY) / 2;
      const dx = targetX - midX;
      const dy = targetY - midY;
      const shifted = [a, b].map((touch) => ({
        clientX: touch.clientX + dx,
        clientY: touch.clientY + dy,
        pageX: (touch.pageX ?? touch.clientX) + dx,
        pageY: (touch.pageY ?? touch.clientY) + dy,
        screenX: (touch.screenX ?? touch.clientX) + dx,
        screenY: (touch.screenY ?? touch.clientY) + dy,
        identifier: touch.identifier,
        target: touch.target,
      }));
      return {
        ...event,
        touches: shifted,
        changedTouches: shifted,
        preventDefault: () => event.preventDefault(),
        stopPropagation: () => event.stopPropagation(),
      };
    }

    handler._onTouchStart = function (event) {
      return originalTouchStart.call(this, lockTouchesToPivot(event));
    };
    handler._onTouchMove = function (event) {
      return originalTouchMove.call(this, lockTouchesToPivot(event));
    };

    handler._wanderPivotLocked = true;
    if (wasEnabled || map.options.touchZoom) handler.enable();
  }

  function applyCenterAnchor() {
    if (!position.isFollowingPosition() || centerMode !== 'lower') return;
    const point = position.getPosition?.();
    if (!point) return;
    const target = map.latLngToContainerPoint(point);
    const desired = zoomPivotPoint();
    const delta = target.subtract(desired);
    if (Math.abs(delta.x) > 1 || Math.abs(delta.y) > 1) map.panBy(delta, { animate: false });
  }

  function scheduleCenterAnchor() {
    if (zoomAnchorFrame) cancelAnimationFrame(zoomAnchorFrame);
    zoomAnchorFrame = requestAnimationFrame(() => {
      zoomAnchorFrame = 0;
      applyCenterAnchor();
    });
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
    if (followSuspendedByDrag) {
      activateCurrentCenterMode();
      return;
    }

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

  function openCenterSettings() {
    cycleCenterMode();
  }

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
  installLockedTouchZoomPivot();

  map.on('dragstart', () => {
    if (!position.isFollowingPosition()) return;
    followSuspendedByDrag = true;
    position.setFollowMode(false, { centerNow: false });
    syncZoomAnchorMode();
    syncFollowButton();
  });
  map.on('zoom zoomend resize', scheduleCenterAnchor);

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