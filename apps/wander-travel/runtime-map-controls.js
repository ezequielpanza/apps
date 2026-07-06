(() => {
  const core = window.WanderMapCore;
  const position = window.WanderMapPosition;
  if (!core || !position) return;

  const map = core.map;
  let centerButton = null;

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

  function setFollowMode(next, options = {}) {
    const result = position.setFollowMode(next, options);
    syncZoomAnchorMode();
    syncFollowButton();
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

  const MapActions = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'wander-map-actions');
      const layerButton = mapButton('layers', 'Cambiar a mapa satélite');
      centerButton = mapButton('center', 'Centrar y seguir mi posición');
      centerButton.setAttribute('aria-pressed', 'false');

      layerButton.addEventListener('click', () => {
        const active = core.toggleBaseLayer();
        const nextLabel = active === 'streets' ? 'Cambiar a mapa satélite' : 'Cambiar a mapa de calles';
        layerButton.setAttribute('aria-label', nextLabel);
        layerButton.title = nextLabel;
      });

      centerButton.addEventListener('click', () => {
        if (position.isFollowingPosition()) return void setFollowMode(false, { centerNow: false });
        if (!setFollowMode(true)) {
          window.WanderUI?.showWander('Sin ubicación', 'Todavía no hay una ubicación efectiva válida para activar el seguimiento.');
        }
      });

      wrap.append(layerButton, centerButton);
      syncFollowButton();
      return wrap;
    },
  });

  map.addControl(new MapActions());
  map.on('dragstart', () => {
    if (position.isFollowingPosition()) setFollowMode(false, { centerNow: false });
  });

  window.WanderMapControls = {
    setFollowMode,
    syncFollowButton,
    syncZoomAnchorMode,
  };

  syncZoomAnchorMode();
})();
