(() => {
  const core = window.WanderMapCore;
  const position = window.WanderMapPosition;
  const context = window.WanderContext;
  if (!core || !position) return;

  const map = core.map;
  const CENTER_MODE_KEY = 'wander.map.centerMode.v1';
  const HOLD_MS = 650;
  let centerButton = null;
  let suppressCenterClick = false;
  let centerMode = loadCenterMode();

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
    return '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="5" fill="' + dotFill + '" stroke="' + dotStroke + '"></circle>' +
      '<path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path>' +
      '</svg>';
  }

  function syncFollowButton() {
    if (!centerButton) return;
    const followMode = position.isFollowingPosition();
    centerButton.setAttribute('aria-pressed', String(followMode));
    centerButton.setAttribute('aria-label', followMode ? 'Desactivar seguimiento centrado' : 'Centrar y seguir mi posición');
    centerButton.title = followMode ? 'Desactivar seguimiento centrado' : 'Centrar y seguir mi posición';
    centerButton.innerHTML = centerIconMarkup(followMode);
    centerButton.style.color = followMode ? 'var(--accent)' : 'var(--green)';
    centerButton.style.boxShadow = followMode ? '0 0 0 3px var(--accent-ring), var(--shadow)' : 'var(--shadow)';
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

  function openCenterSettings() {
    suppressCenterClick = true;
    navigator.vibrate?.(35);
    const selected = window.prompt(
      'Configuración de centrado:\n\n1. Medio de la pantalla\n2. Parte inferior para ver hacia adelante\n\nEscribí 1 o 2.',
      centerMode === 'lower' ? '2' : '1'
    );
    if (selected === null) return;
    centerMode = String(selected).trim() === '2' ? 'lower' : 'middle';
    persistCenterMode();
    if (position.isFollowingPosition()) {
      position.centerOnPosition?.();
      requestAnimationFrame(applyCenterAnchor);
    }
    window.WanderUI?.showWander(
      'Centrado actualizado',
      centerMode === 'lower' ? 'Tu posición quedará en la parte inferior para mostrar más mapa hacia adelante.' : 'Tu posición quedará en el centro del mapa.'
    );
  }

  function bindCenterHold(button) {
    let timer = null;
    let held = false;
    const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
    button.addEventListener('pointerdown', () => {
      held = false;
      cancel();
      timer = setTimeout(() => { held = true; openCenterSettings(); }, HOLD_MS);
    });
    button.addEventListener('pointerup', cancel);
    button.addEventListener('pointercancel', cancel);
    button.addEventListener('pointerleave', cancel);
    button.addEventListener('click', () => {
      if (held || suppressCenterClick) { suppressCenterClick = false; return; }
      if (position.isFollowingPosition()) return void setFollowMode(false, { centerNow: false });
      if (!setFollowMode(true)) {
        window.WanderUI?.showWander('Sin ubicación', 'Todavía no hay una ubicación efectiva válida para activar el seguimiento.');
      }
    });
  }

  const MapActions = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'wander-map-actions wander-standard-map-actions');
      const layerButton = mapButton('layers', 'Cambiar a mapa satélite');
      centerButton = mapButton('center', 'Centrar y seguir mi posición');
      centerButton.setAttribute('aria-pressed', 'false');

      layerButton.addEventListener('click', () => {
        const active = core.toggleBaseLayer();
        const nextLabel = active === 'streets' ? 'Cambiar a mapa satélite' : 'Cambiar a mapa de calles';
        layerButton.setAttribute('aria-label', nextLabel);
        layerButton.title = nextLabel;
      });

      bindCenterHold(centerButton);
      wrap.append(layerButton, centerButton);
      syncFollowButton();
      return wrap;
    },
  });

  map.addControl(new MapActions());
  map.on('dragstart', () => {
    if (position.isFollowingPosition()) setFollowMode(false, { centerNow: false });
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
      return centerMode;
    },
    openCenterSettings,
  };

  persistCenterMode();
  syncZoomAnchorMode();
})();