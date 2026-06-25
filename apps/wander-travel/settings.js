(() => {
  const VERSION = 'v0.15.0';
  const STORAGE_KEY = 'wander-travel-settings';
  const defaults = {
    trackRouteByDefault: true,
    developerModeEnabled: true,
    tourGuideEnabled: true,
  };

  const badge = document.querySelector('.app-version');
  if (badge) badge.textContent = VERSION;
  document.title = `Wander Travel ${VERSION}`;

  const panel = document.querySelector('#settings-panel');
  const trackToggle = document.querySelector('#setting-track-default');
  const developerToggle = document.querySelector('#setting-developer-mode');
  const guideToggle = document.querySelector('#setting-tour-guide');
  const status = document.querySelector('#settings-save-status');
  const trackButton = document.querySelector('#track-route-button');
  const trackBadge = document.querySelector('#track-status-badge');

  if (!panel || !trackToggle || !developerToggle || !guideToggle) return;

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

  const style = document.createElement('style');
  style.textContent = `
    .settings-list{display:grid;gap:12px}.developer-mode-disabled #show-dev-panel,.developer-mode-disabled #developer-panel,.developer-mode-disabled #movement-simulator-overlay{display:none!important}
  `;
  document.head.appendChild(style);

  const settings = loadSettings();
  trackToggle.checked = Boolean(settings.trackRouteByDefault);
  developerToggle.checked = Boolean(settings.developerModeEnabled);
  guideToggle.checked = Boolean(settings.tourGuideEnabled);

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

  guideToggle.addEventListener('change', () => {
    const next = loadSettings();
    next.tourGuideEnabled = guideToggle.checked;
    saveSettings(next);
    document.dispatchEvent(new CustomEvent('wander:tour-guide-setting', { detail: { enabled: guideToggle.checked } }));
  });

  if (settings.trackRouteByDefault) window.setTimeout(ensureTrackingEnabled, 80);
  window.setTimeout(() => applyDeveloperMode(Boolean(settings.developerModeEnabled)), 120);
})();
