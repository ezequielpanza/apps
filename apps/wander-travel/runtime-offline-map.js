(() => {
  const core = window.WanderMapCore;
  const context = window.WanderContext;
  if (!core || !context || window.WanderOfflineMap) return;

  const nativeTiles = window.Capacitor?.Plugins?.WanderOfflineTiles || null;
  const map = core.map;
  let stats = Object.freeze({ available: Boolean(nativeTiles), tileCount: 0, bytes: 0, maxTileCount: null });
  let tileActivity = Object.freeze({ hits: 0, saved: 0, missing: 0, updatedAt: null });
  let statusElement = null;
  let settingsCard = null;
  let hideTimer = null;

  function formatBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  function writeContext() {
    const online = navigator.onLine !== false;
    const metadata = { source: 'offline-map', kind: 'observed', ttlMs: Infinity, confidence: 1 };
    context.set('connectivity.online', online, metadata);
    context.set('map.offline.nativeCache', Boolean(nativeTiles?.getTile), metadata);
    context.set('map.offline.tileCount', stats.tileCount || 0, metadata);
    context.set('map.offline.bytes', stats.bytes || 0, metadata);
    context.set('map.offline.missingTiles', tileActivity.missing || 0, metadata);
    context.set('map.base.available', online || (stats.tileCount || 0) > 0, metadata);
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
    const native = Boolean(nativeTiles?.getTile);
    if (!online) {
      if ((stats.tileCount || 0) > 0) return { tone: 'offline', text: `Sin conexión · ${stats.tileCount} mapas locales` };
      return { tone: 'warning', text: 'Sin conexión · el recorrido sigue grabándose' };
    }
    if (native) return { tone: 'ready', text: 'Mapa local activo' };
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
    renderSettings();
    writeContext();
    return snapshot;
  }

  function requestServiceWorker(message) {
    return new Promise((resolve) => {
      const controller = navigator.serviceWorker?.controller;
      if (!controller) return resolve(null);
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), 2500);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        resolve(event.data || null);
      };
      controller.postMessage(message, [channel.port2]);
    });
  }

  async function refreshStats() {
    let next = null;
    if (typeof nativeTiles?.getStats === 'function') {
      next = await nativeTiles.getStats().catch(() => null);
    } else {
      next = await requestServiceWorker({ type: 'GET_OSM_TILE_CACHE_STATUS' });
    }
    if (next) stats = Object.freeze({ ...stats, ...next, available: true });
    renderStatus({ persistent: navigator.onLine === false });
    return { ...stats };
  }

  async function clearCache() {
    let result = null;
    if (typeof nativeTiles?.clear === 'function') result = await nativeTiles.clear().catch(() => null);
    else result = await requestServiceWorker({ type: 'CLEAR_OSM_TILE_CACHE' });
    if (result) stats = Object.freeze({ ...stats, tileCount: 0, bytes: 0 });
    tileActivity = Object.freeze({ hits: 0, saved: 0, missing: 0, updatedAt: new Date().toISOString() });
    renderStatus({ persistent: navigator.onLine === false });
    window.WanderUI?.showToast?.('Mapa local borrado', 'El recorrido y las sesiones no fueron modificados');
    return result;
  }

  function ensureSettingsCard() {
    if (settingsCard?.isConnected) return settingsCard;
    const panel = document.querySelector('#settings-panel');
    if (!panel) return null;
    settingsCard = document.createElement('div');
    settingsCard.className = 'screen-card settings-group offline-map-settings';
    settingsCard.innerHTML = `
      <h3>Mapas sin conexión</h3>
      <p class="panel-note">Wander guarda localmente los mapas OSM que vas viendo. El recorrido se registra y se dibuja aunque el mapa base no esté disponible.</p>
      <div class="offline-map-setting-row"><span>Estado</span><strong id="offline-map-setting-state">Preparando</strong></div>
      <div class="offline-map-setting-row"><span>Mapas guardados</span><strong id="offline-map-setting-count">0</strong></div>
      <div class="offline-map-setting-row"><span>Espacio utilizado</span><strong id="offline-map-setting-size">0 B</strong></div>
      <p class="offline-map-policy-note">Solo se guardan las celdas que abrís normalmente. La descarga anticipada de regiones se habilitará cuando Wander use una fuente OSM propia o compatible con uso offline.</p>
      <div class="button-row compact-actions"><button id="offline-map-clear" type="button"><svg class="button-icon"><use href="wander-icons.svg#clear"></use></svg><span>Borrar mapa local</span></button></div>`;
    panel.appendChild(settingsCard);
    settingsCard.querySelector('#offline-map-clear')?.addEventListener('click', clearCache);
    return settingsCard;
  }

  function renderSettings() {
    const card = ensureSettingsCard();
    if (!card) return;
    const snapshot = statusSnapshot();
    const state = card.querySelector('#offline-map-setting-state');
    const count = card.querySelector('#offline-map-setting-count');
    const size = card.querySelector('#offline-map-setting-size');
    if (state) state.textContent = snapshot.text;
    if (count) count.textContent = String(stats.tileCount || 0);
    if (size) size.textContent = formatBytes(stats.bytes || 0);
  }

  function tileEvent(type) {
    const next = { ...tileActivity, updatedAt: new Date().toISOString() };
    if (type === 'hit') next.hits += 1;
    if (type === 'saved') next.saved += 1;
    if (type === 'missing') next.missing += 1;
    tileActivity = Object.freeze(next);
    if (type === 'saved' && next.saved % 12 === 0) refreshStats();
    else if (type === 'missing') renderStatus({ persistent: navigator.onLine === false });
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
  window.addEventListener('wander:screen-change', renderSettings);

  window.WanderOfflineMap = Object.freeze({
    refreshStats,
    clearCache,
    getStats: () => ({ ...stats }),
    getActivity: () => ({ ...tileActivity }),
    isOnline: () => navigator.onLine !== false,
    trackAvailableOffline: () => true,
  });

  renderStatus({ persistent: navigator.onLine === false });
  refreshStats();
})();
