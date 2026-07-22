(() => {
  const settingsPanel = document.querySelector('#settings-panel');
  const ui = window.WanderUI;
  if (!settingsPanel || !('serviceWorker' in navigator) || window.WanderMapCacheSettings) return;

  const STORAGE_KEY = 'wander.mapCache.retentionDays.v1';
  const DEFAULT_DAYS = 30;
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

  async function worker() {
    const registration = await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller || registration.active || registration.waiting || null;
  }

  async function request(type, payload = {}) {
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

  const card = document.createElement('div');
  card.className = 'screen-card settings-group map-cache-settings';
  card.innerHTML = `
    <h3>Mapa guardado</h3>
    <p class="panel-note">Wander conserva los sectores del mapa que vas viendo para poder mostrarlos nuevamente cuando no haya cobertura. No descarga zonas por adelantado.</p>
    <div class="message-timeout-setting-row">
      <div>
        <strong>Conservar mapas</strong>
        <span>Tiempo durante el cual se guardan los tiles ya visualizados.</span>
      </div>
      <select id="map-cache-retention-select" aria-label="Tiempo de conservación del mapa">
        <option value="0">Solo caché del sistema</option>
        <option value="7">7 días</option>
        <option value="30">30 días</option>
        <option value="90">90 días</option>
        <option value="180">180 días</option>
        <option value="365">1 año</option>
      </select>
    </div>
    <div class="simulator-state-row"><span>Tiles guardados</span><strong id="map-cache-count">Comprobando</strong></div>
    <div class="simulator-state-row"><span>Política activa</span><strong id="map-cache-policy">—</strong></div>
    <div class="button-row compact-actions screen-card-actions">
      <button id="map-cache-clear" type="button">Vaciar mapas guardados</button>
    </div>
  `;
  settingsPanel.prepend(card);

  const select = card.querySelector('#map-cache-retention-select');
  const count = card.querySelector('#map-cache-count');
  const policy = card.querySelector('#map-cache-policy');
  const clearButton = card.querySelector('#map-cache-clear');

  function policyLabel(days) {
    if (days === 0) return 'Caché normal del navegador';
    if (days === 365) return 'Hasta 1 año';
    return `${days} días · disponible sin conexión`;
  }

  function render(status = {}) {
    const days = Number.isFinite(Number(status.retentionDays)) ? Number(status.retentionDays) : storedDays();
    select.value = String(days);
    count.textContent = `${Number(status.count) || 0} tiles`;
    policy.textContent = policyLabel(days);
    clearButton.disabled = !(Number(status.count) > 0);
    window.WanderContext?.set?.('map.cache', {
      retentionDays: days,
      count: Number(status.count) || 0,
      maxEntries: Number(status.maxEntries) || null,
      updatedAt: new Date().toISOString(),
    }, { source: 'map-cache-settings', kind: 'observed', ttlMs: 10 * 60 * 1000, confidence: 1 });
    return status;
  }

  async function refresh() {
    try {
      return render(await request('WANDER_MAP_CACHE_STATUS'));
    } catch {
      count.textContent = 'No disponible';
      policy.textContent = policyLabel(storedDays());
      return null;
    }
  }

  async function applyRetention(days) {
    const retentionDays = saveDays(days);
    select.disabled = true;
    try {
      const status = await request('WANDER_MAP_CACHE_CONFIG', { retentionDays });
      render(status);
      ui?.showWander?.(
        'Mapa guardado actualizado',
        retentionDays === 0
          ? 'Wander dejó de mantener una caché propia de mapas. El navegador seguirá usando su caché normal.'
          : `Los sectores del mapa que mires se conservarán durante ${retentionDays === 365 ? 'un año' : `${retentionDays} días`}.`,
        { timeoutMs: 6500 }
      );
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
      ui?.showWander?.('Mapas eliminados', 'Se vació la caché propia de mapas. Se volverán a guardar las zonas que recorras o consultes.', { timeoutMs: 6500 });
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
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    setTimeout(() => applyRetention(storedDays()), 300);
  });

  window.WanderMapCacheSettings = Object.freeze({
    refresh,
    clear,
    setRetentionDays: applyRetention,
    getRetentionDays: storedDays,
  });

  navigator.serviceWorker.ready
    .then(() => applyRetention(storedDays()))
    .catch(() => refresh());
})();
