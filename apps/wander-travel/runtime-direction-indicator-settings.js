(() => {
  const indicator = window.WanderDirectionIndicator;
  const settingsPanel = document.querySelector('#settings-panel');
  if (!indicator || !settingsPanel || window.WanderDirectionIndicatorSettings) return;

  const card = document.createElement('div');
  card.className = 'screen-card settings-group direction-settings';
  card.innerHTML = `
    <h3>Indicador de dirección</h3>
    <p class="panel-note">La flecha gira sobre un mapa orientado al norte. Wander puede combinar el rumbo GPS con la orientación del teléfono.</p>
    <div class="direction-setting-row">
      <div><strong>Mostrar indicador</strong><span>Activa o desactiva la flecha sin afectar la grabación del recorrido.</span></div>
      <label class="switch-control"><input id="direction-indicator-enabled" type="checkbox" aria-label="Mostrar indicador de dirección"><span class="switch-track"><span class="switch-thumb"></span></span></label>
    </div>
    <div class="direction-setting-row">
      <div><strong>Brújula magnética + giróscopo</strong><span>Orienta la flecha según la parte superior del teléfono cuando la velocidad está por debajo del umbral.</span></div>
      <label class="switch-control"><input id="direction-magnetic-enabled" type="checkbox" aria-label="Usar brújula magnética y giróscopo"><span class="switch-track"><span class="switch-thumb"></span></span></label>
    </div>
    <div class="direction-setting-row">
      <div><strong>Umbral para usar brújula</strong><span>Por encima de esta velocidad Wander usa el rumbo GPS.</span></div>
      <input id="direction-threshold-kmh" type="number" min="0" max="50" step="0.5" inputmode="decimal" aria-label="Velocidad umbral en kilómetros por hora">
    </div>
    <p class="direction-threshold-note">Con 0 km/h, el GPS se usa durante cualquier movimiento y la brújula se activa solamente al quedar quieto.</p>
    <div class="direction-diagnostic"><span>Fuente actual</span><strong id="direction-source-status">Sin dirección</strong></div>
    <div class="direction-diagnostic"><span>Dirección</span><strong id="direction-heading-status">—</strong></div>
    <div class="direction-diagnostic"><span>Confianza</span><strong id="direction-confidence-status">—</strong></div>
  `;
  settingsPanel.prepend(card);

  const enabledInput = card.querySelector('#direction-indicator-enabled');
  const magneticInput = card.querySelector('#direction-magnetic-enabled');
  const thresholdInput = card.querySelector('#direction-threshold-kmh');
  const sourceStatus = card.querySelector('#direction-source-status');
  const headingStatus = card.querySelector('#direction-heading-status');
  const confidenceStatus = card.querySelector('#direction-confidence-status');
  const SOURCE_LABELS = Object.freeze({ gps: 'Rumbo GPS', compass: 'Brújula + giróscopo', none: 'Sin dirección' });
  const CONFIDENCE_LABELS = Object.freeze({ high: 'Alta', medium: 'Media', low: 'Baja', unreliable: 'No confiable', unavailable: 'No disponible', disabled: 'Desactivado' });

  function cardinal(heading) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    return directions[Math.round((((Number(heading) % 360) + 360) % 360) / 45) % 8];
  }
  function renderConfig(config = indicator.getConfig()) {
    enabledInput.checked = config.enabled === true;
    magneticInput.checked = config.magneticEnabled === true;
    thresholdInput.value = String(Number(config.thresholdKmh) || 0);
    magneticInput.disabled = !config.enabled;
    thresholdInput.disabled = !config.enabled || !config.magneticEnabled;
    card.dataset.indicatorEnabled = config.enabled ? 'true' : 'false';
    return config;
  }
  function renderState(state = indicator.getState()) {
    sourceStatus.textContent = SOURCE_LABELS[state.source] || state.source || 'Sin dirección';
    headingStatus.textContent = Number.isFinite(Number(state.heading)) ? `${Math.round(Number(state.heading))}° · ${cardinal(state.heading)}` : '—';
    confidenceStatus.textContent = CONFIDENCE_LABELS[state.confidence] || state.confidence || '—';
    return state;
  }
  function apply(patch) {
    const config = indicator.setConfig(patch);
    renderConfig(config);
    renderState();
    return config;
  }
  enabledInput.addEventListener('change', () => apply({ enabled: enabledInput.checked }));
  magneticInput.addEventListener('change', () => apply({ magneticEnabled: magneticInput.checked }));
  thresholdInput.addEventListener('change', () => apply({ thresholdKmh: Number(thresholdInput.value) || 0 }));
  thresholdInput.addEventListener('blur', () => renderConfig());
  window.addEventListener('wander:direction-change', (event) => renderState(event.detail));
  window.addEventListener('wander:direction-settings-changed', (event) => renderConfig(event.detail));
  renderConfig();
  renderState();
  window.WanderDirectionIndicatorSettings = Object.freeze({ renderConfig, renderState });
})();

(() => {
  if (window.WanderTTS) return;
  const STORAGE_KEY = 'wander.tts.enabled.v1';
  let enabled = false;
  let button = null;
  let lastInteractionId = null;

  try { enabled = localStorage.getItem(STORAGE_KEY) === '1'; } catch {}

  function nativePlugin() {
    return window.Capacitor?.Plugins?.WanderTTS || null;
  }

  function iconMarkup() {
    const slash = enabled ? '' : '<path d="M4 4l16 16" stroke-width="2.1"></path>';
    return '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M5 10v4h4l5 4V6L9 10H5z"></path><path d="M17 9.2c1.1 1.5 1.1 4.1 0 5.6"></path><path d="M19.5 7c2.1 2.7 2.1 7.3 0 10"></path>' + slash + '</svg>';
  }

  function syncButton() {
    if (!button) return;
    button.innerHTML = iconMarkup();
    const label = enabled ? 'Desactivar voz de Wander' : 'Activar voz de Wander';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(enabled));
    button.title = label;
    button.dataset.ttsEnabled = enabled ? 'true' : 'false';
    button.style.color = enabled ? 'var(--accent)' : 'var(--green)';
    button.style.boxShadow = enabled ? '0 0 0 3px var(--accent-ring), var(--shadow)' : 'var(--shadow)';
  }

  async function stop() {
    try { await nativePlugin()?.stop?.(); } catch {}
    try { window.speechSynthesis?.cancel?.(); } catch {}
  }

  async function speak(text, options = {}) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!enabled || !clean || document.visibilityState === 'hidden') return false;
    const plugin = nativePlugin();
    if (plugin?.speak) {
      try {
        await plugin.speak({
          text: clean,
          language: options.language || 'es-AR',
          rate: Number(options.rate) || 1,
          pitch: Number(options.pitch) || 1,
          interrupt: options.interrupt === true,
        });
        return true;
      } catch { return false; }
    }
    if ('speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined') {
      if (options.interrupt === true) window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = options.language || 'es-AR';
      utterance.rate = Number(options.rate) || 1;
      utterance.pitch = Number(options.pitch) || 1;
      window.speechSynthesis.speak(utterance);
      return true;
    }
    return false;
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch {}
    window.WanderContext?.set?.('settings.ttsEnabled', enabled, { source: 'tts-control', kind: 'confirmed', ttlMs: Infinity, confidence: 1 });
  }

  async function setEnabled(next, announce = false) {
    enabled = Boolean(next);
    persist();
    syncButton();
    if (!enabled) await stop();
    else if (announce) speak('Voz de Wander activada.', { interrupt: true });
    window.dispatchEvent(new CustomEvent('wander:tts-settings-changed', { detail: { enabled } }));
    return enabled;
  }

  function installButton() {
    const wrap = document.querySelector('.wander-standard-map-actions');
    if (!wrap) return false;
    button = wrap.querySelector('.wander-tts-map-action');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'wander-map-action wander-tts-map-action';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setEnabled(!enabled, !enabled);
      });
      wrap.prepend(button);
    }
    syncButton();
    return true;
  }

  window.addEventListener('wander:interaction-change', (event) => {
    if (!enabled || event.detail?.type !== 'presented') return;
    const interaction = event.detail?.interaction || {};
    if (interaction.id && interaction.id === lastInteractionId) return;
    lastInteractionId = interaction.id || null;
    const priority = String(interaction.priority || 'normal');
    speak(interaction.message || interaction.title, { interrupt: priority === 'high' || priority === 'critical' });
  });

  const installTimer = setInterval(() => { if (installButton()) clearInterval(installTimer); }, 250);
  setTimeout(() => clearInterval(installTimer), 15000);
  installButton();
  persist();

  window.WanderTTS = Object.freeze({
    speak,
    stop,
    setEnabled,
    toggle: () => setEnabled(!enabled, !enabled),
    isEnabled: () => enabled,
    installButton,
  });
})();
