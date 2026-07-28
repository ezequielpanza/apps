(() => {
  const settingsPanel = document.querySelector('#settings-panel');
  const ui = window.WanderUI;
  if (!settingsPanel || window.WanderMapCacheSettings) return;

  const nativeTiles = window.Capacitor?.isNativePlatform?.() === true
    ? window.Capacitor?.Plugins?.WanderOfflineTiles || null
    : null;
  const STORAGE_KEY = 'wander.mapCache.retentionDays.v1';
  const DEFAULT_DAYS = nativeTiles ? 90 : 30;
  const ALLOWED_DAYS = new Set([0, 7, 30, 90, 180, 365]);

  function storedDays() {
    try {
      const value = Number(localStorage.getItem(STORAGE_KEY));
      return ALLOWED_DAYS.has(value) ? value : DEFAULT_DAYS;
    } catch {
      return DEFAULT_DAYS;
    }
  }

  function saveDays(value) {
    const days = ALLOWED_DAYS.has(Number(value)) ? Number(value) : DEFAULT_DAYS;
    try { localStorage.setItem(STORAGE_KEY, String(days)); } catch {}
    return days;
  }

  function formatBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  async function worker() {
    if (!('serviceWorker' in navigator)) return null;
    const registration = await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller || registration.active || registration.waiting || null;
  }

  async function workerRequest(type, payload = {}) {
    const target = await worker();
    if (!target) throw new Error('Service worker unavailable');
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => reject(new Error('Map cache request timed out')), 5000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        if (event.data?.ok === false) reject(new Error(event.data.error || 'Map cache request failed'));
        else resolve(event.data || {});
      };
      target.postMessage({ type, ...payload }, [channel.port2]);
    });
  }

  async function request(type, payload = {}) {
    if (typeof nativeTiles?.getStats === 'function') {
      if (type === 'WANDER_MAP_CACHE_STATUS') return nativeTiles.getStats();
      if (type === 'WANDER_MAP_CACHE_CONFIG') return nativeTiles.configure({ retentionDays: payload.retentionDays });
      if (type === 'WANDER_MAP_CACHE_CLEAR') return nativeTiles.clear();
    }
    return workerRequest(type, payload);
  }

  const card = document.createElement('div');
  card.className = 'screen-card settings-group map-cache-settings';
  card.innerHTML = `
    <h3>Mapa local</h3>
    <p class="panel-note">Wander conserva los sectores de calles y satélite que vas viendo y los vuelve a mostrar sin cobertura. El recorrido se registra y se dibuja incluso cuando no hay ningún tile disponible.</p>
    <div class="message-timeout-setting-row">
      <div>
        <strong>Conservar mapas</strong>
        <span>Tiempo durante el cual se guardan los sectores ya visualizados.</span>
      </div>
      <select id="map-cache-retention-select" aria-label="Tiempo de conservación del mapa">
        <option value="0">No guardar</option>
        <option value="7">7 días</option>
        <option value="30">30 días</option>
        <option value="90">90 días</option>
        <option value="180">180 días</option>
        <option value="365">1 año</option>
      </select>
    </div>
    <div class="simulator-state-row"><span>Tiles guardados</span><strong id="map-cache-count">Comprobando</strong></div>
    <div class="simulator-state-row"><span>Espacio local</span><strong id="map-cache-size">—</strong></div>
    <div class="simulator-state-row"><span>Almacenamiento</span><strong id="map-cache-storage">—</strong></div>
    <div class="simulator-state-row"><span>Política activa</span><strong id="map-cache-policy">—</strong></div>
    <p class="panel-note">Wander solo guarda mapas que abrís normalmente. La descarga anticipada de regiones requiere una fuente que autorice expresamente el uso offline.</p>
    <div class="button-row compact-actions screen-card-actions">
      <button id="map-cache-clear" type="button">Vaciar mapa local</button>
    </div>
  `;
  settingsPanel.prepend(card);

  const select = card.querySelector('#map-cache-retention-select');
  const count = card.querySelector('#map-cache-count');
  const size = card.querySelector('#map-cache-size');
  const storage = card.querySelector('#map-cache-storage');
  const policy = card.querySelector('#map-cache-policy');
  const clearButton = card.querySelector('#map-cache-clear');

  function policyLabel(days) {
    if (days === 0) return 'No se guardan tiles nuevos';
    if (days === 365) return 'Hasta 1 año';
    return `${days} días · disponible sin conexión`;
  }

  function render(status = {}) {
    const days = Number.isFinite(Number(status.retentionDays)) ? Number(status.retentionDays) : storedDays();
    const tileCount = Number(status.count ?? status.tileCount) || 0;
    const bytes = Number(status.bytes) || 0;
    select.value = String(days);
    count.textContent = `${tileCount} tiles`;
    size.textContent = bytes > 0 ? formatBytes(bytes) : 'Sin datos';
    storage.textContent = status.native === true || nativeTiles ? 'App local' : 'Caché web';
    policy.textContent = policyLabel(days);
    clearButton.disabled = tileCount <= 0;
    window.WanderContext?.set?.('map.cache', {
      retentionDays: days,
      count: tileCount,
      bytes,
      native: status.native === true || Boolean(nativeTiles),
      maxEntries: Number(status.maxEntries ?? status.maxTileCount) || null,
      updatedAt: new Date().toISOString(),
    }, { source: 'map-cache-settings', kind: 'observed', ttlMs: 10 * 60 * 1000, confidence: 1 });
    window.WanderContext?.set?.('map.track.available', true, { source: 'map-cache-settings', kind: 'observed', ttlMs: Infinity, confidence: 1 });
    window.dispatchEvent(new CustomEvent('wander:map-cache-status', { detail: { ...status, count: tileCount, bytes, retentionDays: days } }));
    return status;
  }

  async function refresh() {
    try {
      return render(await request('WANDER_MAP_CACHE_STATUS'));
    } catch {
      count.textContent = 'No disponible';
      size.textContent = '—';
      storage.textContent = nativeTiles ? 'App local' : 'Caché web';
      policy.textContent = policyLabel(storedDays());
      return null;
    }
  }

  async function applyRetention(days, options = {}) {
    const retentionDays = saveDays(days);
    select.disabled = true;
    try {
      const status = await request('WANDER_MAP_CACHE_CONFIG', { retentionDays });
      render(status);
      if (options.silent !== true) {
        ui?.showWander?.(
          'Mapa local actualizado',
          retentionDays === 0
            ? 'Wander dejó de guardar nuevos sectores del mapa. El recorrido seguirá registrándose normalmente.'
            : `Los sectores que mires se conservarán durante ${retentionDays === 365 ? 'un año' : `${retentionDays} días`}.`,
          { timeoutMs: 6500 }
        );
      }
      return status;
    } finally {
      select.disabled = false;
    }
  }

  async function clear() {
    clearButton.disabled = true;
    try {
      const status = await request('WANDER_MAP_CACHE_CLEAR');
      render(status);
      ui?.showWander?.('Mapa local eliminado', 'Se borraron los tiles guardados. Las sesiones y los recorridos no fueron modificados.', { timeoutMs: 6500 });
      return status;
    } finally {
      clearButton.disabled = false;
    }
  }

  select.value = String(storedDays());
  select.addEventListener('change', () => applyRetention(Number(select.value)));
  clearButton.addEventListener('click', clear);
  window.addEventListener('wander:screen-change', (event) => {
    if (event.detail?.to === 'settings') refresh();
  });
  navigator.serviceWorker?.addEventListener?.('controllerchange', () => {
    setTimeout(() => applyRetention(storedDays(), { silent: true }), 300);
  });

  window.WanderMapCacheSettings = Object.freeze({
    refresh,
    clear,
    setRetentionDays: applyRetention,
    getRetentionDays: storedDays,
    usesNativeStorage: () => Boolean(nativeTiles),
  });

  applyRetention(storedDays(), { silent: true }).catch(() => refresh());
})();
