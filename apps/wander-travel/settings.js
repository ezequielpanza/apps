(() => {
  const VERSION = 'v0.30.0';
  const STORAGE_KEY = 'wander-travel-settings';
  const defaults = {
    trackRouteByDefault: true,
    developerModeEnabled: true,
    poiSources: {
      osm: true,
      internet: true,
      noForeignLand: false,
      iOverlander: false,
      tripadvisor: false,
    },
  };

  const badge = document.querySelector('.app-version');
  if (badge) badge.textContent = VERSION;
  document.title = `Wander Travel ${VERSION}`;

  const panel = document.querySelector('#settings-panel');
  const settingsList = document.querySelector('#settings-panel .settings-list');
  const trackToggle = document.querySelector('#setting-track-default');
  const developerToggle = document.querySelector('#setting-developer-mode');
  const status = document.querySelector('#settings-save-status');
  const trackButton = document.querySelector('#track-route-button');
  const trackBadge = document.querySelector('#track-status-badge');

  if (!panel || !settingsList || !trackToggle || !developerToggle) return;

  function mergeSettings(saved = {}) {
    return {
      ...defaults,
      ...saved,
      poiSources: { ...defaults.poiSources, ...(saved.poiSources || {}) },
    };
  }

  function loadSettings() {
    try {
      return mergeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    } catch {
      return mergeSettings();
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mergeSettings(settings)));
    if (status) {
      status.textContent = 'Guardado';
      status.classList.add('is-visible');
      window.setTimeout(() => status.classList.remove('is-visible'), 1200);
    }
  }

  function ensureTrackingEnabled() {
    if (!trackButton) return;
    const isActive = trackButton.classList.contains('active') || trackBadge?.textContent === 'ON';
    if (!isActive) trackButton.click();
  }

  function applyDeveloperMode(enabled) {
    const devPanel = document.querySelector('#developer-panel');
    const devTab = document.querySelector('#show-dev-panel');
    const overlay = document.querySelector('#movement-simulator-overlay');

    if (!enabled && document.body.classList.contains('dev-panel-open')) {
      devTab?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }

    document.body.classList.toggle('developer-mode-disabled', !enabled);

    [devPanel, devTab, overlay].forEach((element) => {
      if (!element) return;
      if (enabled) {
        element.style.removeProperty('display');
        element.removeAttribute('aria-hidden');
      } else {
        element.style.setProperty('display', 'none', 'important');
        element.setAttribute('aria-hidden', 'true');
      }
    });

    document.dispatchEvent(new CustomEvent('wander:developer-mode-setting', { detail: { enabled } }));
  }

  function addPoiSourcesSettings() {
    if (document.querySelector('#setting-poi-source-osm')) return;
    const card = document.createElement('section');
    card.className = 'settings-card poi-source-card';
    card.innerHTML = `
      <div>
        <h3>Fuentes de POIs</h3>
        <p>Selecciona qué fuentes usa Wander para descubrir lugares. Las fuentes pendientes quedan preparadas para futuras integraciones.</p>
        <div class="poi-source-grid">
          <label><input id="setting-poi-source-osm" type="checkbox" data-poi-source="osm" checked /> OpenStreetMap</label>
          <label><input id="setting-poi-source-internet" type="checkbox" data-poi-source="internet" checked /> Internet / Wikipedia</label>
          <label><input id="setting-poi-source-noforeignland" type="checkbox" data-poi-source="noForeignLand" /> NoForeignLand</label>
          <label><input id="setting-poi-source-ioverlander" type="checkbox" data-poi-source="iOverlander" /> iOverlander</label>
          <label><input id="setting-poi-source-tripadvisor" type="checkbox" data-poi-source="tripadvisor" /> Tripadvisor</label>
        </div>
      </div>
    `;
    settingsList.appendChild(card);
  }

  const style = document.createElement('style');
  style.textContent = `
    .settings-list{display:grid;gap:12px}.developer-mode-disabled #show-dev-panel,.developer-mode-disabled #developer-panel,.developer-mode-disabled #movement-simulator-overlay{display:none!important}
    .poi-source-card{align-items:flex-start}.poi-source-grid{display:grid;gap:8px;margin-top:12px}.poi-source-grid label{display:flex;align-items:center;gap:8px;font-size:.8rem;font-weight:800;color:#34423f}.poi-source-grid input{width:17px;height:17px;accent-color:#147d78}
  `;
  document.head.appendChild(style);
  addPoiSourcesSettings();

  const sourceInputs = [...document.querySelectorAll('[data-poi-source]')];

  function emitPoiSources() {
    const settings = loadSettings();
    document.dispatchEvent(new CustomEvent('wander:poi-sources-setting', { detail: settings.poiSources }));
  }

  const settings = loadSettings();
  trackToggle.checked = Boolean(settings.trackRouteByDefault);
  developerToggle.checked = Boolean(settings.developerModeEnabled);
  sourceInputs.forEach((input) => {
    input.checked = Boolean(settings.poiSources[input.dataset.poiSource]);
  });

  trackToggle.addEventListener('change', () => {
    const next = loadSettings();
    next.trackRouteByDefault = trackToggle.checked;
    saveSettings(next);
    if (trackToggle.checked) ensureTrackingEnabled();
  });

  developerToggle.addEventListener('change', () => {
    const next = loadSettings();
    next.developerModeEnabled = developerToggle.checked;
    saveSettings(next);
    applyDeveloperMode(developerToggle.checked);
  });

  sourceInputs.forEach((input) => {
    input.addEventListener('change', () => {
      const next = loadSettings();
      next.poiSources[input.dataset.poiSource] = input.checked;
      saveSettings(next);
      emitPoiSources();
    });
  });

  if (settings.trackRouteByDefault) window.setTimeout(ensureTrackingEnabled, 80);
  window.setTimeout(() => applyDeveloperMode(Boolean(settings.developerModeEnabled)), 120);
  window.setTimeout(emitPoiSources, 200);
})();
