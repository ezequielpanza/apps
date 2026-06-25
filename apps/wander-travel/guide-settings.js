(() => {
  const STORAGE_KEY = 'wander-travel-settings';
  const defaults = {
    tourGuideEnabled: true,
    guideHistoricalNearbyEnabled: true,
    guideInternetDiscoveryEnabled: true,
  };

  const panelList = document.querySelector('#guide-panel .settings-list');
  const masterToggle = document.querySelector('#setting-tour-guide');
  const historicalToggle = document.querySelector('#setting-guide-history-nearby');
  const status = document.querySelector('#guide-settings-save-status');

  if (!panelList || !masterToggle || !historicalToggle) return;

  if (!document.querySelector('#setting-guide-internet-discovery')) {
    const card = document.createElement('section');
    card.className = 'settings-card';
    card.innerHTML = `
      <div>
        <h3>Buscar información y lugares en internet</h3>
        <p>Amplía el recorrido con sitios e historias que no aparecen en el mapa ni en los POIs locales.</p>
      </div>
      <label class="settings-switch"><input id="setting-guide-internet-discovery" type="checkbox" checked /><span></span></label>
    `;
    panelList.appendChild(card);
  }

  const internetToggle = document.querySelector('#setting-guide-internet-discovery');
  if (!internetToggle) return;

  function loadSettings() {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    } catch {
      return { ...defaults };
    }
  }

  function saveSettings(next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    status?.classList.add('is-visible');
    window.setTimeout(() => status?.classList.remove('is-visible'), 1200);
  }

  function syncAvailability() {
    [historicalToggle, internetToggle].forEach((toggle) => {
      toggle.disabled = !masterToggle.checked;
      toggle.closest('.settings-card')?.classList.toggle('is-disabled', !masterToggle.checked);
    });
  }

  function emit() {
    document.dispatchEvent(new CustomEvent('wander:tour-guide-setting', {
      detail: {
        enabled: masterToggle.checked,
        historicalNearbyEnabled: historicalToggle.checked,
        internetDiscoveryEnabled: internetToggle.checked,
      },
    }));
  }

  const settings = loadSettings();
  masterToggle.checked = Boolean(settings.tourGuideEnabled);
  historicalToggle.checked = Boolean(settings.guideHistoricalNearbyEnabled);
  internetToggle.checked = Boolean(settings.guideInternetDiscoveryEnabled);
  syncAvailability();

  function persist() {
    const next = loadSettings();
    next.tourGuideEnabled = masterToggle.checked;
    next.guideHistoricalNearbyEnabled = historicalToggle.checked;
    next.guideInternetDiscoveryEnabled = internetToggle.checked;
    saveSettings(next);
    syncAvailability();
    emit();
  }

  masterToggle.addEventListener('change', persist);
  historicalToggle.addEventListener('change', persist);
  internetToggle.addEventListener('change', persist);
})();
