(() => {
  const VERSION = 'v0.12.6';
  const STORAGE_KEY = 'wander-travel-settings';
  const defaults = {
    trackRouteByDefault: true,
    developerModeEnabled: true,
  };

  const badge = document.querySelector('.app-version');
  if (badge) badge.textContent = VERSION;
  document.title = `Wander Travel ${VERSION}`;

  const panel = document.querySelector('#settings-panel');
  const trackToggle = document.querySelector('#setting-track-default');
  const developerToggle = document.querySelector('#setting-developer-mode');
  const status = document.querySelector('#settings-save-status');
  const trackButton = document.querySelector('#track-route-button');
  const trackBadge = document.querySelector('#track-status-badge');

  if (!panel || !trackToggle || !developerToggle) return;

  function loadSettings() {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    } catch {
      return { ...defaults };
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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
    document.body.classList.toggle('developer-mode-disabled', !enabled);
    const devPanel = document.querySelector('#developer-panel');
    const devTab = document.querySelector('#show-dev-panel');

    if (!enabled && document.body.classList.contains('dev-panel-open')) {
      devTab?.click();
    }

    if (devPanel) devPanel.setAttribute('aria-hidden', String(!enabled));
    if (devTab) devTab.setAttribute('aria-hidden', String(!enabled));

    document.dispatchEvent(new CustomEvent('wander:developer-mode-setting', { detail: { enabled } }));
  }

  const style = document.createElement('style');
  style.textContent = `
    .settings-list{display:grid;gap:12px}.developer-mode-disabled #show-dev-panel,.developer-mode-disabled #developer-panel{display:none!important}.developer-mode-disabled #movement-simulator-overlay{display:none!important}
  `;
  document.head.appendChild(style);

  const settings = loadSettings();
  trackToggle.checked = Boolean(settings.trackRouteByDefault);
  developerToggle.checked = Boolean(settings.developerModeEnabled);

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

  if (settings.trackRouteByDefault) window.setTimeout(ensureTrackingEnabled, 80);
  applyDeveloperMode(Boolean(settings.developerModeEnabled));
})();
