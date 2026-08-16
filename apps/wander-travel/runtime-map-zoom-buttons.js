(() => {
  const INSTALL_INTERVAL_MS = 250;
  const INSTALL_TIMEOUT_MS = 15000;
  const TARGET_RESET_MS = 360;
  const ZOOM_DURATION_SEC = 0.22;
  const startedAt = Date.now();
  let targetZoom = null;
  let targetResetTimer = 0;

  function clampZoom(map, zoom) {
    return Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), zoom));
  }

  function followingAnchor() {
    const position = window.WanderMapPosition;
    if (!position?.isFollowingPosition?.()) return null;
    return position.getPosition?.() || position.getRememberedPosition?.() || null;
  }

  function centerForAnchor(map, anchor, zoom) {
    if (!anchor) return map.getCenter();
    return L.latLng(anchor);
  }

  function applyZoom(map, zoom) {
    const anchor = followingAnchor();
    const center = centerForAnchor(map, anchor, zoom);

    // Keep Leaflet's old tile level transformed on screen while the next level
    // becomes available. This is the same visual path used by normal animated
    // zooms and avoids the blank/flash produced by the previous atomic setView.
    map._stop?.();
    map.setView(center, zoom, {
      animate: true,
      duration: ZOOM_DURATION_SEC,
      easeLinearity: 0.25,
    });

    if (anchor) {
      map.once('zoomend', () => {
        if (window.WanderMapPosition?.isFollowingPosition?.()) {
          window.WanderMapControls?.followPosition?.(anchor);
        }
      });
    }
  }

  function queueTargetReset() {
    if (targetResetTimer) clearTimeout(targetResetTimer);
    targetResetTimer = setTimeout(() => {
      targetResetTimer = 0;
      targetZoom = null;
    }, TARGET_RESET_MS);
  }

  function makeButton(symbol, label, zoomDelta) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wander-map-action wander-map-zoom-action';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.textContent = symbol;
    button.style.fontSize = '26px';
    button.style.fontWeight = '500';
    button.style.lineHeight = '1';
    button.style.padding = '0 0 2px';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const map = window.WanderMapCore?.map;
      if (!map) return;
      const baseZoom = Number.isFinite(targetZoom) ? targetZoom : Math.round(map.getZoom());
      const nextZoom = clampZoom(map, baseZoom + zoomDelta);
      if (nextZoom === baseZoom) return;
      targetZoom = nextZoom;
      applyZoom(map, nextZoom);
      queueTargetReset();
    });
    return button;
  }

  function install() {
    const wrap = document.querySelector('.wander-standard-map-actions');
    if (!wrap || wrap.querySelector('.wander-map-zoom-action')) return false;

    const zoomIn = makeButton('+', 'Acercar mapa', 1);
    const zoomOut = makeButton('−', 'Alejar mapa', -1);
    wrap.append(zoomIn, zoomOut);
    return true;
  }

  if (install()) return;
  const timer = setInterval(() => {
    if (install() || Date.now() - startedAt >= INSTALL_TIMEOUT_MS) clearInterval(timer);
  }, INSTALL_INTERVAL_MS);
})();
