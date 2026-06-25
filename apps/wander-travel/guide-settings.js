(() => {
  const STORAGE_KEY = 'wander-travel-settings';
  const defaults = {
    tourGuideEnabled: true,
    guideHistoricalNearbyEnabled: true,
  };

  const masterToggle = document.querySelector('#setting-tour-guide');
  const historicalToggle = document.querySelector('#setting-guide-history-nearby');
  const status = document.querySelector('#guide-settings-save-status');

  if (!masterToggle || !historicalToggle) return;

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
    historicalToggle.disabled = !masterToggle.checked;
    historicalToggle.closest('.settings-card')?.classList.toggle('is-disabled', !masterToggle.checked);
  }

  function emit() {
    document.dispatchEvent(new CustomEvent('wander:tour-guide-setting', {
      detail: {
        enabled: masterToggle.checked,
        historicalNearbyEnabled: historicalToggle.checked,
      },
    }));
  }

  const settings = loadSettings();
  masterToggle.checked = Boolean(settings.tourGuideEnabled);
  historicalToggle.checked = Boolean(settings.guideHistoricalNearbyEnabled);
  syncAvailability();

  masterToggle.addEventListener('change', () => {
    const next = loadSettings();
    next.tourGuideEnabled = masterToggle.checked;
    next.guideHistoricalNearbyEnabled = historicalToggle.checked;
    saveSettings(next);
    syncAvailability();
    emit();
  });

  historicalToggle.addEventListener('change', () => {
    const next = loadSettings();
    next.tourGuideEnabled = masterToggle.checked;
    next.guideHistoricalNearbyEnabled = historicalToggle.checked;
    saveSettings(next);
    emit();
  });
})();
