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

  function syncZoomAnchorMode() {
    const mode = position.isFollowingPosition() ? 'center' : true;
    map.options.scrollWheelZoom = mode;
    map.options.doubleClickZoom = mode;
    map.options.touchZoom = mode;
  }

  function applyCenterAnchor() {
    if (!position.isFollowingPosition() || centerMode !== 'lower') return;
    const point = position.getPosition?.();
    if (!point) return;
    const size = map.getSize();
    const target = map.latLngToContainerPoint(point);
    const desired = L.point(size.x / 2, size.y * 0.72);
    const delta = target.subtract(desired);
    if (Math.abs(delta.x) > 1 || Math.abs(delta.y) > 1) map.panBy(delta, { animate: false });
  }

  function setFollowMode(next, options = {}) {
    const result = position.setFollowMode(next, options);
    if (next) followSuspendedByDrag = false;
    syncZoomAnchorMode();
    syncFollowButton();
    requestAnimationFrame(applyCenterAnchor);
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
    requestAnimationFrame(applyCenterAnchor);
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
      position.centerOnPosition?.();
      requestAnimationFrame(applyCenterAnchor);
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
  map.on('dragstart', () => {
    if (!position.isFollowingPosition()) return;
    followSuspendedByDrag = true;
    position.setFollowMode(false, { centerNow: false });
    syncZoomAnchorMode();
    syncFollowButton();
  });

  context?.subscribe?.((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) requestAnimationFrame(applyCenterAnchor);
  });

  window.WanderMapControls = {
    setFollowMode,
    syncFollowButton,
    syncZoomAnchorMode,
    getCenterMode: () => centerMode,
    setCenterMode(mode) {
      centerMode = mode === 'lower' ? 'lower' : 'middle';
      persistCenterMode();
      requestAnimationFrame(applyCenterAnchor);
      syncFollowButton();
      return centerMode;
    },
    cycleCenterMode,
    openCenterSettings,
  };

  persistCenterMode();
  syncZoomAnchorMode();
})();