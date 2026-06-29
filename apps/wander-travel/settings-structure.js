(() => {
  const SETTINGS_KEY = 'wander-travel-settings';

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function ensureSettingDefaults() {
    const settings = loadSettings();
    settings.guide = {
      personality: 'compañero atento',
      frequency: 'normal',
      mood: 'relajado',
      detail: 'medio',
      interruption: 'solo si aporta',
      ...(settings.guide || {})
    };
    settings.account = {
      status: 'local',
      ...(settings.account || {})
    };
    saveSettings(settings);
  }

  function buildGuideCard() {
    const settings = loadSettings();
    const guide = settings.guide || {};
    return `
      <section class="settings-card wander-settings-section" data-settings-section="guide">
        <div>
          <h3>Guía / comunicación</h3>
          <p>Define cómo habla Wander, cuándo interrumpe y cuánta información comparte.</p>
          <label>Personalidad
            <select data-guide-setting="personality">
              <option value="compañero atento">Compañero atento</option>
              <option value="guía turístico">Guía turístico</option>
              <option value="copiloto práctico">Copiloto práctico</option>
              <option value="silencioso">Silencioso</option>
            </select>
          </label>
          <label>Frecuencia
            <select data-guide-setting="frequency">
              <option value="baja">Baja</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
            </select>
          </label>
          <label>Ánimo
            <select data-guide-setting="mood">
              <option value="relajado">Relajado</option>
              <option value="curioso">Curioso</option>
              <option value="práctico">Práctico</option>
              <option value="alerta">Alerta</option>
            </select>
          </label>
          <label>Nivel de detalle
            <select data-guide-setting="detail">
              <option value="breve">Breve</option>
              <option value="medio">Medio</option>
              <option value="detallado">Detallado</option>
            </select>
          </label>
          <label>Interrupciones
            <select data-guide-setting="interruption">
              <option value="solo si aporta">Solo si aporta</option>
              <option value="preguntar primero">Preguntar primero</option>
              <option value="solo alertas">Solo alertas</option>
            </select>
          </label>
        </div>
      </section>
    `;
  }

  function buildAccountCard() {
    return `
      <section class="settings-card wander-settings-section" data-settings-section="account">
        <div>
          <h3>Cuenta</h3>
          <p>Reservado para usuario, sincronización, privacidad y datos guardados.</p>
          <div class="wander-placeholder-row"><span>Estado</span><strong>Local por ahora</strong></div>
          <div class="wander-placeholder-row"><span>Sincronización</span><strong>Próximamente</strong></div>
        </div>
      </section>
    `;
  }

  function labelMapSection() {
    const visualCard = document.querySelector('#settings-panel .visual-aids-card');
    if (!visualCard || visualCard.dataset.mapLabeled) return;
    visualCard.dataset.mapLabeled = 'true';
    const title = visualCard.querySelector('h3');
    const text = visualCard.querySelector('p');
    if (title) title.textContent = 'Mapa / pantalla';
    if (text) text.textContent = 'Todo lo que Wander muestra sobre el mapa: ayudas visuales, datos permanentes y lectura de pantalla limpia.';
  }

  function injectSections() {
    ensureSettingDefaults();
    const list = document.querySelector('#settings-panel .settings-list');
    if (!list) return;
    labelMapSection();

    if (!document.querySelector('[data-settings-section="guide"]')) {
      list.insertAdjacentHTML('beforeend', buildGuideCard());
    }
    if (!document.querySelector('[data-settings-section="account"]')) {
      list.insertAdjacentHTML('beforeend', buildAccountCard());
    }

    const settings = loadSettings();
    document.querySelectorAll('[data-guide-setting]').forEach((input) => {
      const key = input.dataset.guideSetting;
      if (settings.guide?.[key]) input.value = settings.guide[key];
      if (input.dataset.bound) return;
      input.dataset.bound = 'true';
      input.addEventListener('change', () => {
        const next = loadSettings();
        next.guide = { ...(next.guide || {}), [key]: input.value };
        saveSettings(next);
        window.dispatchEvent(new CustomEvent('wander:guide-settings-updated', { detail: next.guide }));
      });
    });
  }

  const style = document.createElement('style');
  style.textContent = `
    #settings-panel .wander-settings-section label{display:grid!important;gap:6px!important;margin-top:12px!important;font-weight:800!important;color:#173f3b!important}
    #settings-panel .wander-settings-section select{width:100%!important;border:1px solid rgba(23,63,59,.18)!important;border-radius:12px!important;padding:10px 12px!important;background:#fff!important;color:#173f3b!important;font:700 14px system-ui!important}
    #settings-panel .wander-placeholder-row{display:flex!important;justify-content:space-between!important;gap:12px!important;padding:10px 0!important;border-top:1px solid rgba(23,63,59,.1)!important;color:#40514e!important}
    #settings-panel .wander-placeholder-row strong{color:#173f3b!important}
  `;
  document.head.appendChild(style);

  injectSections();
  window.setInterval(injectSections, 700);
})();