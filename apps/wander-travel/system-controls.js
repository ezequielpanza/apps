(() => {
  const STORAGE_KEY = 'wander-travel-settings';
  const defaults = {
    gpsEnabled: true,
    zoomControlsVisible: false,
    coordinatesVisible: false,
    coordinateFormat: 'DDM',
    noForeignLandEnabled: true,
    iOverlanderEnabled: true,
  };

  function loadSettings() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
    catch { return { ...defaults }; }
  }

  function saveSettings(next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    document.dispatchEvent(new CustomEvent('wander:system-settings-changed', { detail: next }));
  }

  const settingsList = document.querySelector('#settings-panel .settings-list');
  const locateButton = document.querySelector('#locate-button');
  const zoomTools = document.querySelector('.zoom-tools');
  const locationReadout = document.querySelector('#location-readout');
  document.querySelector('#real-poi-button')?.remove();
  document.querySelector('#route-button')?.remove();

  function addCard(id, title, description, checked, statusText = '') {
    if (!settingsList || document.querySelector(`#${id}`)) return null;
    const card = document.createElement('section');
    card.className = 'settings-card';
    card.innerHTML = `<div><h3>${title}</h3><p>${description}</p>${statusText ? `<small style="display:block;margin-top:7px;color:#8a6c43;line-height:1.35">${statusText}</small>` : ''}</div><label class="settings-switch"><input id="${id}" type="checkbox" ${checked ? 'checked' : ''} /><span></span></label>`;
    settingsList.appendChild(card);
    return card.querySelector('input');
  }

  function addSelectCard(id, title, description, value) {
    if (!settingsList || document.querySelector(`#${id}`)) return null;
    const card = document.createElement('section');
    card.className = 'settings-card coordinate-format-card';
    card.innerHTML = `<div><h3>${title}</h3><p>${description}</p></div><select id="${id}" style="min-width:126px;border:1px solid #d7dee6;border-radius:10px;padding:9px;background:#fff"><option value="DMS">DD° MM′ SS″</option><option value="DDM">DD° MM.MMM′</option></select>`;
    settingsList.appendChild(card);
    const select = card.querySelector('select');
    select.value = value;
    return select;
  }

  const stored = loadSettings();
  const gpsToggle = addCard('setting-gps-enabled', 'Ubicación GPS', 'Permite usar la ubicación real del dispositivo. Al desactivarlo, Wander usa solo la posición manual o simulada.', Boolean(stored.gpsEnabled));
  const zoomToggle = addCard('setting-zoom-controls-visible', 'Mostrar controles de zoom', 'Muestra los botones + y − en el borde inferior izquierdo del mapa.', Boolean(stored.zoomControlsVisible));
  const coordinatesToggle = addCard('setting-coordinates-visible', 'Mostrar coordenadas GPS', 'Muestra u oculta la tarjeta con las coordenadas actuales en el mapa.', Boolean(stored.coordinatesVisible));
  const coordinateFormat = addSelectCard('setting-coordinate-format', 'Formato de coordenadas', 'Elegí cómo mostrar latitud y longitud.', stored.coordinateFormat);
  const nflToggle = addCard('setting-noforeignland-enabled', 'POIs de NoForeignLand', 'Activa esta fuente cuando exista un conector oficial disponible para Wander.', Boolean(stored.noForeignLandEnabled), 'Fuente preparada, todavía sin conexión activa.');
  const iOverlanderToggle = addCard('setting-ioverlander-enabled', 'POIs de iOverlander', 'Activa esta fuente cuando exista un conector oficial disponible para Wander.', Boolean(stored.iOverlanderEnabled), 'Fuente preparada, todavía sin conexión activa.');

  const style = document.createElement('style');
  style.textContent = `
    .zoom-tools{position:fixed!important;left:0!important;bottom:18px!important;top:auto!important;display:flex!important;flex-direction:column!important;border-radius:0 12px 12px 0!important;overflow:hidden!important;z-index:620!important}
    .zoom-tool+.zoom-tool{border-left:0!important;border-top:1px solid #e5e9ee!important}
    body.zoom-controls-hidden .zoom-tools{display:none!important}
    body.zoom-controls-visible .status-rail{left:60px!important}
    body.coordinates-hidden #location-readout{display:none!important}
    .coordinate-format-card select:disabled{opacity:.5;cursor:not-allowed}
  `;
  document.head.appendChild(style);

  function applyGpsState(enabled) {
    if (!locateButton) return;
    locateButton.disabled = !enabled;
    locateButton.setAttribute('aria-disabled', String(!enabled));
    locateButton.title = enabled ? 'Usar ubicación GPS' : 'GPS desactivado desde Configuración';
    locateButton.style.opacity = enabled ? '' : '.45';
    locateButton.style.pointerEvents = enabled ? '' : 'none';
    locateButton.textContent = enabled ? 'Mi ubicación' : 'GPS desactivado';
  }

  function applyZoomState(visible) {
    document.body.classList.toggle('zoom-controls-visible', visible);
    document.body.classList.toggle('zoom-controls-hidden', !visible);
    if (zoomTools) zoomTools.setAttribute('aria-hidden', String(!visible));
  }

  function applyCoordinateVisibility(visible) {
    document.body.classList.toggle('coordinates-hidden', !visible);
    if (locationReadout) locationReadout.setAttribute('aria-hidden', String(!visible));
    if (coordinateFormat) coordinateFormat.disabled = !visible;
    coordinateFormat?.closest('.settings-card')?.classList.toggle('is-disabled', !visible);
  }

  function toDms(value, positive, negative) {
    const hemisphere = value >= 0 ? positive : negative;
    const absolute = Math.abs(value);
    const degrees = Math.floor(absolute);
    const minutesFloat = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = (minutesFloat - minutes) * 60;
    return `${degrees}° ${String(minutes).padStart(2, '0')}′ ${seconds.toFixed(1).padStart(4, '0')}″ ${hemisphere}`;
  }

  function toDdm(value, positive, negative) {
    const hemisphere = value >= 0 ? positive : negative;
    const absolute = Math.abs(value);
    const degrees = Math.floor(absolute);
    const minutes = (absolute - degrees) * 60;
    return `${degrees}° ${minutes.toFixed(3).padStart(6, '0')}′ ${hemisphere}`;
  }

  function formatCoordinates(point, format) {
    if (!point) return '';
    if (format === 'DMS') return `${toDms(point.lat, 'N', 'S')} · ${toDms(point.lng, 'E', 'W')}`;
    return `${toDdm(point.lat, 'N', 'S')} · ${toDdm(point.lng, 'E', 'W')}`;
  }

  function refreshCoordinates() {
    if (!locationReadout || typeof marker === 'undefined') return;
    const strong = locationReadout.querySelector('strong');
    if (!strong) return;
    strong.textContent = formatCoordinates(marker.getLatLng(), loadSettings().coordinateFormat);
  }

  function persist() {
    const next = loadSettings();
    next.gpsEnabled = Boolean(gpsToggle?.checked);
    next.zoomControlsVisible = Boolean(zoomToggle?.checked);
    next.coordinatesVisible = Boolean(coordinatesToggle?.checked);
    next.coordinateFormat = coordinateFormat?.value || 'DDM';
    next.noForeignLandEnabled = Boolean(nflToggle?.checked);
    next.iOverlanderEnabled = Boolean(iOverlanderToggle?.checked);
    saveSettings(next);
    applyGpsState(next.gpsEnabled);
    applyZoomState(next.zoomControlsVisible);
    applyCoordinateVisibility(next.coordinatesVisible);
    refreshCoordinates();
  }

  gpsToggle?.addEventListener('change', persist);
  zoomToggle?.addEventListener('change', persist);
  coordinatesToggle?.addEventListener('change', persist);
  coordinateFormat?.addEventListener('change', persist);
  nflToggle?.addEventListener('change', persist);
  iOverlanderToggle?.addEventListener('change', persist);

  applyGpsState(Boolean(stored.gpsEnabled));
  applyZoomState(Boolean(stored.zoomControlsVisible));
  applyCoordinateVisibility(Boolean(stored.coordinatesVisible));
  refreshCoordinates();
  marker?.on?.('move', refreshCoordinates);
  marker?.on?.('moveend', refreshCoordinates);
  window.setInterval(refreshCoordinates, 1500);

  const trackButton = document.querySelector('#track-route-button');
  if (!trackButton) return;

  trackButton.textContent = '';
  trackButton.classList.add('rec-control');
  trackButton.setAttribute('aria-label', 'Registrar recorrido');
  trackButton.innerHTML = '<span class="rec-dot" aria-hidden="true"></span><span class="rec-timer">00:00</span>';
  const timer = trackButton.querySelector('.rec-timer');

  style.textContent += `.map-tools .rec-control{display:inline-flex!important;align-items:center!important;gap:7px!important;min-width:auto!important;padding:8px 10px!important;border-radius:999px!important;background:rgba(255,255,255,.94)!important;color:#626b72!important;font-size:.72rem!important;font-weight:800!important;box-shadow:0 6px 18px rgba(20,35,55,.14)!important}.rec-control .rec-dot{width:12px;height:12px;border-radius:50%;background:#9ca3a8;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}.rec-control.active .rec-dot{background:#e32929;box-shadow:0 0 0 3px rgba(227,41,41,.15)}.rec-control.active{color:#b82020!important}.rec-timer{font-variant-numeric:tabular-nums;min-width:34px;text-align:left}`;

  let startedAt = null;
  let accumulatedMs = 0;
  let interval = null;

  function format(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0 ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function refreshTimer() {
    const current = accumulatedMs + (startedAt ? Date.now() - startedAt : 0);
    timer.textContent = format(current);
  }

  function syncRecording() {
    const active = trackButton.classList.contains('active');
    if (active && !startedAt) {
      startedAt = Date.now();
      interval = window.setInterval(refreshTimer, 1000);
    } else if (!active && startedAt) {
      accumulatedMs += Date.now() - startedAt;
      startedAt = null;
      if (interval) window.clearInterval(interval);
      interval = null;
    }
    refreshTimer();
  }

  trackButton.addEventListener('click', () => window.setTimeout(syncRecording, 0));
  new MutationObserver(syncRecording).observe(trackButton, { attributes: true, attributeFilter: ['class'] });
  syncRecording();
})();
