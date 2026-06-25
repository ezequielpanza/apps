(() => {
  const STORAGE_KEY = 'wander-travel-settings';
  const defaults = { gpsEnabled: true };

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
  document.querySelector('#real-poi-button')?.remove();
  document.querySelector('#route-button')?.remove();

  function addCard(id, title, description, checked) {
    if (!settingsList || document.querySelector(`#${id}`)) return null;
    const card = document.createElement('section');
    card.className = 'settings-card';
    card.innerHTML = `<div><h3>${title}</h3><p>${description}</p></div><label class="settings-switch"><input id="${id}" type="checkbox" ${checked ? 'checked' : ''} /><span></span></label>`;
    settingsList.appendChild(card);
    return card.querySelector('input');
  }

  const stored = loadSettings();
  const gpsToggle = addCard('setting-gps-enabled', 'Ubicación GPS', 'Permite usar la ubicación real del dispositivo. Al desactivarlo, Wander usa solo la posición manual o simulada.', Boolean(stored.gpsEnabled));

  function applyGpsState(enabled) {
    if (!locateButton) return;
    locateButton.disabled = !enabled;
    locateButton.setAttribute('aria-disabled', String(!enabled));
    locateButton.title = enabled ? 'Usar ubicación GPS' : 'GPS desactivado desde Configuración';
    locateButton.style.opacity = enabled ? '' : '.45';
    locateButton.style.pointerEvents = enabled ? '' : 'none';
    locateButton.textContent = enabled ? 'Mi ubicación' : 'GPS desactivado';
  }

  gpsToggle?.addEventListener('change', () => {
    const next = loadSettings();
    next.gpsEnabled = gpsToggle.checked;
    saveSettings(next);
    applyGpsState(gpsToggle.checked);
  });

  applyGpsState(Boolean(stored.gpsEnabled));

  const trackButton = document.querySelector('#track-route-button');
  if (!trackButton) return;

  trackButton.textContent = '';
  trackButton.classList.add('rec-control');
  trackButton.setAttribute('aria-label', 'Registrar recorrido');
  trackButton.innerHTML = '<span class="rec-dot" aria-hidden="true"></span><span class="rec-timer">00:00</span>';
  const timer = trackButton.querySelector('.rec-timer');

  const style = document.createElement('style');
  style.textContent = `.map-tools .rec-control{display:inline-flex!important;align-items:center!important;gap:7px!important;min-width:auto!important;padding:8px 10px!important;border-radius:999px!important;background:rgba(255,255,255,.94)!important;color:#626b72!important;font-size:.72rem!important;font-weight:800!important;box-shadow:0 6px 18px rgba(20,35,55,.14)!important}.rec-control .rec-dot{width:12px;height:12px;border-radius:50%;background:#9ca3a8;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}.rec-control.active .rec-dot{background:#e32929;box-shadow:0 0 0 3px rgba(227,41,41,.15)}.rec-control.active{color:#b82020!important}.rec-timer{font-variant-numeric:tabular-nums;min-width:34px;text-align:left}`;
  document.head.appendChild(style);

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
