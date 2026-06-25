(() => {
  const VERSION = 'v0.11.0';
  const STORAGE_KEY = 'wander-travel-settings';
  const defaults = {
    trackRouteByDefault: true,
  };

  const badge = document.querySelector('.app-version');
  if (badge) badge.textContent = VERSION;
  document.title = `Wander Travel ${VERSION}`;

  const panel = document.querySelector('#settings-panel');
  const trackToggle = document.querySelector('#setting-track-default');
  const status = document.querySelector('#settings-save-status');
  const trackButton = document.querySelector('#track-route-button');
  const trackBadge = document.querySelector('#track-status-badge');

  if (!panel || !trackToggle) return;

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

  const settings = loadSettings();
  trackToggle.checked = Boolean(settings.trackRouteByDefault);

  trackToggle.addEventListener('change', () => {
    const next = loadSettings();
    next.trackRouteByDefault = trackToggle.checked;
    saveSettings(next);
    if (trackToggle.checked) ensureTrackingEnabled();
  });

  if (settings.trackRouteByDefault) {
    window.setTimeout(ensureTrackingEnabled, 80);
  }
})();
