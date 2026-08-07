(() => {
  const settingsPanel = document.querySelector('#settings-panel');
  const ui = window.WanderUI;
  if (!settingsPanel || window.WanderMapCacheSettings) return;

  const nativeTiles = window.Capacitor?.isNativePlatform?.() === true ? window.Capacitor?.Plugins?.WanderOfflineTiles || null : null;
  const STORAGE_KEY = 'wander.mapCache.retentionDays.v1';
  const MIGRATION_KEY = 'wander.mapCache.retentionDefaultFixed.v1';
  const DEFAULT_DAYS = nativeTiles ? 90 : 30;
  const ALLOWED_DAYS = new Set([0, 7, 30, 90, 180, 365]);

  function storedDays() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return DEFAULT_DAYS;
      const value = Number(raw);
      if (!ALLOWED_DAYS.has(value)) return DEFAULT_DAYS;
      const migrated = localStorage.getItem(MIGRATION_KEY) === 'done';
      if (value === 0 && !migrated) return DEFAULT_DAYS;
      return value;
    } catch { return DEFAULT_DAYS; }
  }
  function saveDays(value) {
    const numeric = Number(value);
    const days = ALLOWED_DAYS.has(numeric) ? numeric : DEFAULT_DAYS;
    try { localStorage.setItem(STORAGE_KEY, String(days)); localStorage.setItem(MIGRATION_KEY, 'done'); } catch {}
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
    <div class="message-timeout-setting-row"><div><strong>Conservar mapas</strong><span>Tiempo durante el cual se guardan los sectores ya visualizados.</span></div><select id="map-cache-retention-select" aria-label="Tiempo de conservación del mapa"><option value="0">No guardar</option><option value="7">7 días</option><option value="30">30 días</option><option value="90">90 días</option><option value="180">180 días</option><option value="365">1 año</option></select></div>
    <div class="simulator-state-row"><span>Tiles guardados</span><strong id="map-cache-count">Comprobando</strong></div>
    <div class="simulator-state-row"><span>Espacio local</span><strong id="map-cache-size">—</strong></div>
    <div class="simulator-state-row"><span>Almacenamiento</span><strong id="map-cache-storage">—</strong></div>
    <div class="simulator-state-row"><span>Política activa</span><strong id="map-cache-policy">—</strong></div>
    <p class="panel-note">Wander solo guarda mapas que abrís normalmente. La descarga anticipada de regiones requiere una fuente que autorice expresamente el uso offline.</p>
    <div class="button-row compact-actions screen-card-actions"><button id="map-cache-clear" type="button">Vaciar mapa local</button></div>`;
  settingsPanel.prepend(card);
  const select = card.querySelector('#map-cache-retention-select');
  const count = card.querySelector('#map-cache-count');
  const size = card.querySelector('#map-cache-size');
  const storage = card.querySelector('#map-cache-storage');
  const policy = card.querySelector('#map-cache-policy');
  const clearButton = card.querySelector('#map-cache-clear');
  function policyLabel(days) { if (days === 0) return 'No se guardan tiles nuevos'; if (days === 365) return 'Hasta 1 año'; return `${days} días · disponible sin conexión`; }
  function render(status = {}) {
    const days = Number.isFinite(Number(status.retentionDays)) ? Number(status.retentionDays) : storedDays();
    const tileCount = Number(status.count ?? status.tileCount) || 0;
    const bytes = Number(status.bytes) || 0;
    select.value = String(days); count.textContent = `${tileCount} tiles`; size.textContent = bytes > 0 ? formatBytes(bytes) : 'Sin datos';
    storage.textContent = status.native === true || nativeTiles ? 'App local' : 'Caché web'; policy.textContent = policyLabel(days); clearButton.disabled = tileCount <= 0;
    window.WanderContext?.set?.('map.cache', { retentionDays: days, count: tileCount, bytes, native: status.native === true || Boolean(nativeTiles), maxEntries: Number(status.maxEntries ?? status.maxTileCount) || null, updatedAt: new Date().toISOString() }, { source: 'map-cache-settings', kind: 'observed', ttlMs: 10 * 60 * 1000, confidence: 1 });
    window.WanderContext?.set?.('map.track.available', true, { source: 'map-cache-settings', kind: 'observed', ttlMs: Infinity, confidence: 1 });
    window.dispatchEvent(new CustomEvent('wander:map-cache-status', { detail: { ...status, count: tileCount, bytes, retentionDays: days } }));
    return status;
  }
  async function refresh() {
    try { return render(await request('WANDER_MAP_CACHE_STATUS')); }
    catch { count.textContent = 'No disponible'; size.textContent = '—'; storage.textContent = nativeTiles ? 'App local' : 'Caché web'; policy.textContent = policyLabel(storedDays()); return null; }
  }
  async function applyRetention(days, options = {}) {
    const retentionDays = saveDays(days); select.disabled = true;
    try {
      const status = await request('WANDER_MAP_CACHE_CONFIG', { retentionDays }); render(status);
      if (options.silent !== true) ui?.showWander?.('Mapa local actualizado', retentionDays === 0 ? 'Wander dejó de guardar nuevos sectores del mapa. El recorrido seguirá registrándose normalmente.' : `Los sectores que mires se conservarán durante ${retentionDays === 365 ? 'un año' : `${retentionDays} días`}.`, { timeoutMs: 6500 });
      return status;
    } finally { select.disabled = false; }
  }
  async function clear() {
    clearButton.disabled = true;
    try { const status = await request('WANDER_MAP_CACHE_CLEAR'); render(status); ui?.showWander?.('Mapa local eliminado', 'Se borraron los tiles guardados. Las sesiones y los recorridos no fueron modificados.', { timeoutMs: 6500 }); return status; }
    finally { clearButton.disabled = false; }
  }
  select.value = String(storedDays());
  select.addEventListener('change', () => applyRetention(Number(select.value)));
  clearButton.addEventListener('click', clear);
  window.addEventListener('wander:screen-change', (event) => { if (event.detail?.to === 'settings') refresh(); });
  navigator.serviceWorker?.addEventListener?.('controllerchange', () => { setTimeout(() => applyRetention(storedDays(), { silent: true }), 300); });
  window.WanderMapCacheSettings = Object.freeze({ refresh, clear, setRetentionDays: applyRetention, getRetentionDays: storedDays, usesNativeStorage: () => Boolean(nativeTiles) });
  applyRetention(storedDays(), { silent: true }).catch(() => refresh());
})();

(() => {
  const settingsPanel = document.querySelector('#settings-panel');
  const engine = window.WanderSessionEngine;
  if (!settingsPanel || !engine || window.WanderRecordingSettings) return;

  const style = document.createElement('style');
  style.id = 'wander-clean-bitacora-style';
  style.textContent = '[data-app-screen="travel-log"] .travel-log-recorder{display:none!important}';
  document.head.appendChild(style);

  const profiles = engine.recordingProfiles?.() || [];
  const card = document.createElement('div');
  card.className = 'screen-card settings-group recording-settings';
  card.innerHTML = `
    <h3>Grabación y Bitácora</h3>
    <p class="panel-note">La Bitácora queda dedicada al viaje. La captura y el muestreo se configuran acá.</p>
    <div class="direction-setting-row"><div><strong>Registrar viaje</strong><span>Inicia y cierra recorridos automáticamente según el movimiento.</span></div><label class="switch-control"><input id="recording-auto-enabled" type="checkbox"><span class="switch-track"><span class="switch-thumb"></span></span></label></div>
    <div class="direction-setting-row"><div><strong>Mostrar track actual</strong><span>Dibuja el recorrido activo sobre el mapa.</span></div><label class="switch-control"><input id="recording-show-current" type="checkbox"><span class="switch-track"><span class="switch-thumb"></span></span></label></div>
    <div class="direction-setting-row"><div><strong>Suavizar recorrido</strong><span>Solo cambia la visualización; los puntos guardados no se alteran.</span></div><label class="switch-control"><input id="recording-smoothing" type="checkbox"><span class="switch-track"><span class="switch-thumb"></span></span></label></div>
    <div class="message-timeout-setting-row"><div><strong>Muestreo</strong><span id="recording-profile-description"></span></div><select id="recording-profile-select" aria-label="Perfil de grabación">${profiles.map((profile) => `<option value="${profile.id}">${profile.label}</option>`).join('')}</select></div>
    <div id="recording-manual-row" hidden><div class="direction-setting-row"><div><strong>Intervalo mínimo</strong><span>Segundos entre puntos.</span></div><input id="recording-manual-seconds" type="number" min="1" max="60" step="1"></div><div class="direction-setting-row"><div><strong>Distancia mínima</strong><span>Metros entre puntos.</span></div><input id="recording-manual-meters" type="number" min="0" max="100" step="1"></div></div>
    <div class="simulator-state-row"><span>Política activa</span><strong id="recording-active-policy">—</strong></div>
    <div class="button-row compact-actions screen-card-actions"><button id="recording-finish" type="button">Finalizar recorrido</button><button id="recording-export-last" type="button">Exportar último GPX</button></div>`;
  settingsPanel.prepend(card);

  const autoInput = card.querySelector('#recording-auto-enabled');
  const showInput = card.querySelector('#recording-show-current');
  const smoothingInput = card.querySelector('#recording-smoothing');
  const profileSelect = card.querySelector('#recording-profile-select');
  const description = card.querySelector('#recording-profile-description');
  const manualRow = card.querySelector('#recording-manual-row');
  const secondsInput = card.querySelector('#recording-manual-seconds');
  const metersInput = card.querySelector('#recording-manual-meters');
  const policy = card.querySelector('#recording-active-policy');
  const finishButton = card.querySelector('#recording-finish');
  const exportButton = card.querySelector('#recording-export-last');

  function render() {
    const state = engine.snapshot?.() || {};
    const recording = engine.getRecordingState?.() || state.recording || {};
    const config = recording.config || engine.getRecordingConfig?.() || {};
    autoInput.checked = engine.isAutoEnabled?.() !== false;
    showInput.checked = window.WanderTracks?.isCurrentTrackVisible?.() !== false;
    smoothingInput.checked = window.WanderTracks?.isSmoothingEnabled?.() === true;
    profileSelect.value = config.profileId || recording.profileId || 'balanced';
    description.textContent = config.description || 'Equilibrio entre detalle y consumo.';
    manualRow.hidden = profileSelect.value !== 'manual';
    secondsInput.value = String(recording.manualIntervalSec ?? config.intervalSec ?? 5);
    metersInput.value = String(recording.manualDistanceM ?? config.distanceM ?? 5);
    policy.textContent = `${config.intervalSec ?? 5} s / ${config.distanceM ?? 5} m · máximo 1 punto/s`;
    finishButton.disabled = !state.active;
    exportButton.disabled = !(state.sessions || []).length;
  }

  autoInput.addEventListener('change', () => { engine.setAutoEnabled?.(autoInput.checked); render(); });
  showInput.addEventListener('change', () => { window.WanderTracks?.setCurrentTrackVisible?.(showInput.checked); render(); });
  smoothingInput.addEventListener('change', () => { window.WanderTracks?.setSmoothingEnabled?.(smoothingInput.checked); render(); });
  profileSelect.addEventListener('change', () => {
    try { localStorage.setItem('wander.recording.userChosen.v1', '1'); } catch {}
    engine.setRecordingProfile?.(profileSelect.value);
    render();
  });
  function applyManual() {
    try { localStorage.setItem('wander.recording.userChosen.v1', '1'); } catch {}
    engine.setManualRecordingConfig?.({ intervalSec: Number(secondsInput.value) || 5, distanceM: Number(metersInput.value) || 0 });
    render();
  }
  secondsInput.addEventListener('change', applyManual);
  metersInput.addEventListener('change', applyManual);
  finishButton.addEventListener('click', () => { engine.finishSession?.('manual'); render(); });
  exportButton.addEventListener('click', () => {
    const sessions = engine.list?.() || [];
    const last = sessions.slice().sort((a, b) => Number(b.endedAt || b.updatedAt || 0) - Number(a.endedAt || a.updatedAt || 0))[0];
    if (last) window.WanderTracks?.exportTrack?.(last);
  });
  engine.subscribe?.(render);
  window.addEventListener('wander:recording-profile-changed', render);
  window.addEventListener('wander:track-smoothing-changed', render);
  render();
  window.WanderRecordingSettings = Object.freeze({ render });
})();
