(() => {
  const core = window.WanderMapCore;
  const context = window.WanderContext;
  if (!core || !context || window.WanderOfflineMap) return;

  const nativeTiles = window.Capacitor?.Plugins?.WanderOfflineTiles || null;
  let stats = Object.freeze({ available: Boolean(nativeTiles), count: 0, bytes: 0, maxEntries: null });
  let tileActivity = Object.freeze({ hits: 0, saved: 0, missing: 0, updatedAt: null });
  let statusElement = null;
  let hideTimer = null;

  function writeContext() {
    const online = navigator.onLine !== false;
    const count = Number(stats.count ?? stats.tileCount) || 0;
    const metadata = { source: 'offline-map', kind: 'observed', ttlMs: Infinity, confidence: 1 };
    context.set('connectivity.online', online, metadata);
    context.set('map.offline.nativeCache', Boolean(nativeTiles?.getTile), metadata);
    context.set('map.offline.tileCount', count, metadata);
    context.set('map.offline.bytes', Number(stats.bytes) || 0, metadata);
    context.set('map.offline.missingTiles', tileActivity.missing || 0, metadata);
    context.set('map.base.available', online || count > 0, metadata);
    context.set('map.track.available', true, metadata);
  }

  function ensureStatusElement() {
    if (statusElement?.isConnected) return statusElement;
    statusElement = document.createElement('div');
    statusElement.id = 'offline-map-status';
    statusElement.className = 'offline-map-status';
    statusElement.setAttribute('role', 'status');
    statusElement.setAttribute('aria-live', 'polite');
    document.querySelector('#map-screen')?.appendChild(statusElement);
    return statusElement;
  }

  function statusSnapshot() {
    const online = navigator.onLine !== false;
    const count = Number(stats.count ?? stats.tileCount) || 0;
    if (!online) {
      if (count > 0) return { tone: 'offline', text: `Sin conexión · mapa local (${count} tiles)` };
      return { tone: 'warning', text: 'Sin conexión · el recorrido sigue grabándose' };
    }
    if (nativeTiles) return { tone: 'ready', text: 'Mapa local activo' };
    return { tone: 'online', text: 'Mapa conectado' };
  }

  function renderStatus({ persistent = false } = {}) {
    const element = ensureStatusElement();
    const snapshot = statusSnapshot();
    element.textContent = snapshot.text;
    element.dataset.tone = snapshot.tone;
    element.hidden = false;
    clearTimeout(hideTimer);
    if (!persistent && navigator.onLine !== false) {
      hideTimer = setTimeout(() => { if (navigator.onLine !== false) element.hidden = true; }, 4500);
    }
    writeContext();
    return snapshot;
  }

  function requestWorker(type) {
    return new Promise((resolve) => {
      const controller = navigator.serviceWorker?.controller;
      if (!controller) return resolve(null);
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), 2500);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        resolve(event.data || null);
      };
      controller.postMessage({ type }, [channel.port2]);
    });
  }

  async function refreshStats() {
    let next = null;
    if (typeof nativeTiles?.getStats === 'function') next = await nativeTiles.getStats().catch(() => null);
    else next = await requestWorker('WANDER_MAP_CACHE_STATUS');
    if (next) stats = Object.freeze({ ...stats, ...next, available: true });
    renderStatus({ persistent: navigator.onLine === false });
    return { ...stats };
  }

  function tileEvent(type) {
    const next = { ...tileActivity, updatedAt: new Date().toISOString() };
    if (type === 'hit') next.hits += 1;
    if (type === 'saved') next.saved += 1;
    if (type === 'missing') next.missing += 1;
    tileActivity = Object.freeze(next);
    if (type === 'saved' && next.saved % 12 === 0) refreshStats();
    if (type === 'missing') renderStatus({ persistent: navigator.onLine === false });
  }

  const streetLayer = core.baseLayers?.streets;
  streetLayer?.on?.('tilecachehit', () => tileEvent('hit'));
  streetLayer?.on?.('tilecached', () => tileEvent('saved'));
  streetLayer?.on?.('tilemissing', () => tileEvent('missing'));
  streetLayer?.on?.('tileload', () => tileEvent('hit'));
  streetLayer?.on?.('tileerror', () => tileEvent('missing'));

  window.addEventListener('offline', () => {
    if (core.getBaseLayer?.() === 'satellite') core.setBaseLayer?.('streets');
    renderStatus({ persistent: true });
  });
  window.addEventListener('online', () => {
    renderStatus();
    refreshStats();
  });
  window.addEventListener('wander:base-layer-change', () => renderStatus({ persistent: navigator.onLine === false }));
  window.addEventListener('wander:map-cache-status', (event) => {
    stats = Object.freeze({ ...stats, ...(event.detail || {}) });
    renderStatus({ persistent: navigator.onLine === false });
  });

  window.WanderOfflineMap = Object.freeze({
    refreshStats,
    getStats: () => ({ ...stats }),
    getActivity: () => ({ ...tileActivity }),
    isOnline: () => navigator.onLine !== false,
    trackAvailableOffline: () => true,
  });

  renderStatus({ persistent: navigator.onLine === false });
  refreshStats();
})();
