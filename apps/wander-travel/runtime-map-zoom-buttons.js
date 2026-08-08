(() => {
  const INSTALL_INTERVAL_MS = 250;
  const INSTALL_TIMEOUT_MS = 15000;
  const TARGET_RESET_MS = 180;
  const startedAt = Date.now();
  let targetZoom = null;
  let targetResetTimer = 0;

  function clampZoom(map, zoom) {
    return Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), zoom));
  }

  function followingAnchor() {
    const position = window.WanderMapPosition;
    if (!position?.isFollowingPosition?.()) return null;
    return position.getPosition?.() || null;
  }

  function centerForAnchor(map, anchor, zoom) {
    if (!anchor) return map.getCenter();
    if (window.WanderMapControls?.getCenterMode?.() !== 'lower') return L.latLng(anchor);
    const size = map.getSize();
    const lowerPivot = L.point(size.x / 2, size.y * 0.72);
    const projectedAnchor = map.project(anchor, zoom);
    return map.unproject(projectedAnchor.add(size.divideBy(2)).subtract(lowerPivot), zoom);
  }

  function applyZoom(map, zoom) {
    const anchor = followingAnchor();
    const center = centerForAnchor(map, anchor, zoom);
    map._stop?.();
    // Button zoom is intentionally atomic. Overlapping Leaflet zoom animations were
    // briefly moving the camera to an intermediate center before follow-mode restored it.
    map.setView(center, zoom, { animate: false });
    if (anchor) window.WanderMapControls?.followPosition?.(anchor);
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
