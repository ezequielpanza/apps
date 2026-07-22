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
      <div>
        <strong>Mostrar indicador</strong>
        <span>Activa o desactiva la flecha sin afectar la grabación del recorrido.</span>
      </div>
      <label class="switch-control">
        <input id="direction-indicator-enabled" type="checkbox" aria-label="Mostrar indicador de dirección">
        <span class="switch-track"><span class="switch-thumb"></span></span>
      </label>
    </div>
    <div class="direction-setting-row">
      <div>
        <strong>Brújula magnética + giróscopo</strong>
        <span>Orienta la flecha según la parte superior del teléfono cuando la velocidad está por debajo del umbral.</span>
      </div>
      <label class="switch-control">
        <input id="direction-magnetic-enabled" type="checkbox" aria-label="Usar brújula magnética y giróscopo">
        <span class="switch-track"><span class="switch-thumb"></span></span>
      </label>
    </div>
    <div class="direction-setting-row">
      <div>
        <strong>Umbral para usar brújula</strong>
        <span>Por encima de esta velocidad Wander usa el rumbo GPS.</span>
      </div>
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

  const SOURCE_LABELS = Object.freeze({
    gps: 'Rumbo GPS',
    compass: 'Brújula + giróscopo',
    none: 'Sin dirección',
  });
  const CONFIDENCE_LABELS = Object.freeze({
    high: 'Alta',
    medium: 'Media',
    low: 'Baja',
    unreliable: 'No confiable',
    unavailable: 'No disponible',
    disabled: 'Desactivado',
  });

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
    headingStatus.textContent = Number.isFinite(Number(state.heading))
      ? `${Math.round(Number(state.heading))}° · ${cardinal(state.heading)}`
      : '—';
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

  window.WanderDirectionIndicatorSettings = Object.freeze({
    renderConfig,
    renderState,
  });
})();
