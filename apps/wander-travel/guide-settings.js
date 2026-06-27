(() => {
  const STORAGE_KEY = 'wander-travel-settings';
  const defaults = {
    tourGuideEnabled: true,
    guideHistoricalNearbyEnabled: true,
    guideInternetDiscoveryEnabled: true,
    guideWelcomeEnabled: true,
    guideHumorLevel: 'medio',
    guideWelcomeLength: 'normal',
    guideUseWeatherContext: true,
    guideUseTimeContext: true,
  };

  const panelList = document.querySelector('#guide-panel .settings-list');
  const masterToggle = document.querySelector('#setting-tour-guide');
  const historicalToggle = document.querySelector('#setting-guide-history-nearby');
  const status = document.querySelector('#guide-settings-save-status');

  if (!panelList || !masterToggle || !historicalToggle) return;

  function loadSettings() {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    } catch {
      return { ...defaults };
    }
  }

  function card(html) {
    const section = document.createElement('section');
    section.className = 'settings-card';
    section.innerHTML = html;
    panelList.appendChild(section);
    return section;
  }

  if (!document.querySelector('#setting-guide-internet-discovery')) {
    card(`
      <div>
        <h3>Buscar información y lugares en internet</h3>
        <p>Amplía el recorrido con sitios e historias que no aparecen en el mapa ni en los POIs locales.</p>
      </div>
      <label class="settings-switch"><input id="setting-guide-internet-discovery" type="checkbox" checked /><span></span></label>
    `);
  }

  if (!document.querySelector('#setting-guide-welcome')) {
    card(`
      <div>
        <h3>Bienvenida a ciudad nueva</h3>
        <p>Wander saluda al entrar en una ciudad o pueblo nuevo y propone una primera lectura del lugar.</p>
      </div>
      <label class="settings-switch"><input id="setting-guide-welcome" type="checkbox" checked /><span></span></label>
    `);
  }

  if (!document.querySelector('#setting-guide-humor-level')) {
    card(`
      <div>
        <h3>Nivel de humor</h3>
        <p>Regula el toque de humor en los mensajes de Wander.</p>
      </div>
      <select id="setting-guide-humor-level" class="guide-select">
        <option value="bajo">Bajo</option>
        <option value="medio">Medio</option>
        <option value="alto">Alto</option>
      </select>
    `);
  }

  if (!document.querySelector('#setting-guide-welcome-length')) {
    card(`
      <div>
        <h3>Largo de bienvenida</h3>
        <p>Define cuánto se explaya Wander al presentar una ciudad nueva.</p>
      </div>
      <select id="setting-guide-welcome-length" class="guide-select">
        <option value="breve">Breve</option>
        <option value="normal">Normal</option>
        <option value="detallada">Detallada</option>
      </select>
    `);
  }

  if (!document.querySelector('#setting-guide-use-weather')) {
    card(`
      <div>
        <h3>Usar clima en los mensajes</h3>
        <p>Permite mencionar temperatura, lluvia o condiciones de las próximas horas cuando aporte al recorrido.</p>
      </div>
      <label class="settings-switch"><input id="setting-guide-use-weather" type="checkbox" checked /><span></span></label>
    `);
  }

  if (!document.querySelector('#setting-guide-use-time')) {
    card(`
      <div>
        <h3>Usar momento del día</h3>
        <p>Usa referencias temporales naturales como mañana, mediodía, tarde o atardecer, sin decir la hora exacta.</p>
      </div>
      <label class="settings-switch"><input id="setting-guide-use-time" type="checkbox" checked /><span></span></label>
    `);
  }

  const internetToggle = document.querySelector('#setting-guide-internet-discovery');
  const welcomeToggle = document.querySelector('#setting-guide-welcome');
  const humorSelect = document.querySelector('#setting-guide-humor-level');
  const lengthSelect = document.querySelector('#setting-guide-welcome-length');
  const weatherToggle = document.querySelector('#setting-guide-use-weather');
  const timeToggle = document.querySelector('#setting-guide-use-time');

  if (!internetToggle || !welcomeToggle || !humorSelect || !lengthSelect || !weatherToggle || !timeToggle) return;

  const style = document.createElement('style');
  style.textContent = `
    .guide-select{min-width:122px;border:1px solid #d7dee6;border-radius:10px;padding:9px;background:#fff;font-weight:800;color:#18212f}
    .guide-select:disabled{opacity:.5;cursor:not-allowed}
  `;
  document.head.appendChild(style);

  function saveSettings(next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    status?.classList.add('is-visible');
    window.setTimeout(() => status?.classList.remove('is-visible'), 1200);
  }

  function syncAvailability() {
    [historicalToggle, internetToggle, welcomeToggle, humorSelect, lengthSelect, weatherToggle, timeToggle].forEach((control) => {
      control.disabled = !masterToggle.checked;
      control.closest('.settings-card')?.classList.toggle('is-disabled', !masterToggle.checked);
    });
  }

  function emit() {
    document.dispatchEvent(new CustomEvent('wander:tour-guide-setting', {
      detail: {
        enabled: masterToggle.checked,
        historicalNearbyEnabled: historicalToggle.checked,
        internetDiscoveryEnabled: internetToggle.checked,
        welcomeEnabled: welcomeToggle.checked,
        humorLevel: humorSelect.value,
        welcomeLength: lengthSelect.value,
        useWeatherContext: weatherToggle.checked,
        useTimeContext: timeToggle.checked,
      },
    }));
  }

  const settings = loadSettings();
  masterToggle.checked = Boolean(settings.tourGuideEnabled);
  historicalToggle.checked = Boolean(settings.guideHistoricalNearbyEnabled);
  internetToggle.checked = Boolean(settings.guideInternetDiscoveryEnabled);
  welcomeToggle.checked = Boolean(settings.guideWelcomeEnabled);
  humorSelect.value = settings.guideHumorLevel || 'medio';
  lengthSelect.value = settings.guideWelcomeLength || 'normal';
  weatherToggle.checked = Boolean(settings.guideUseWeatherContext);
  timeToggle.checked = Boolean(settings.guideUseTimeContext);
  syncAvailability();

  function persist() {
    const next = loadSettings();
    next.tourGuideEnabled = masterToggle.checked;
    next.guideHistoricalNearbyEnabled = historicalToggle.checked;
    next.guideInternetDiscoveryEnabled = internetToggle.checked;
    next.guideWelcomeEnabled = welcomeToggle.checked;
    next.guideHumorLevel = humorSelect.value;
    next.guideWelcomeLength = lengthSelect.value;
    next.guideUseWeatherContext = weatherToggle.checked;
    next.guideUseTimeContext = timeToggle.checked;
    saveSettings(next);
    syncAvailability();
    emit();
  }

  [masterToggle, historicalToggle, internetToggle, welcomeToggle, humorSelect, lengthSelect, weatherToggle, timeToggle]
    .forEach((control) => control.addEventListener('change', persist));
})();
