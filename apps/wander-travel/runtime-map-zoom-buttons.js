(() => {
  const INSTALL_INTERVAL_MS = 250;
  const INSTALL_TIMEOUT_MS = 15000;
  const startedAt = Date.now();

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
      const nextZoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + zoomDelta));
      if (nextZoom === map.getZoom()) return;
      map.setZoom(nextZoom, { animate: true });
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
