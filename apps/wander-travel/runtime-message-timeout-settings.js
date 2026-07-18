(() => {
  const ui = window.WanderUI;
  const settingsPanel = document.querySelector('#settings-panel');
  if (!ui?.getMessageTimeoutMs || !ui?.setMessageTimeoutMs || !settingsPanel) return;

  const card = document.createElement('div');
  card.className = 'screen-card settings-group message-timeout-settings';
  card.innerHTML = `
    <h3>Mensajes de Wander</h3>
    <div class="message-timeout-setting-row">
      <div>
        <strong>Tiempo en pantalla</strong>
        <span>Duración de los carteles informativos antes de ocultarse.</span>
      </div>
      <select id="message-timeout-select" aria-label="Tiempo en pantalla de los mensajes">
        <option value="3000">3 segundos</option>
        <option value="5000">5 segundos</option>
        <option value="8000">8 segundos</option>
        <option value="10000">10 segundos</option>
        <option value="15000">15 segundos</option>
        <option value="0">No ocultar automáticamente</option>
      </select>
    </div>
  `;

  settingsPanel.prepend(card);

  const select = card.querySelector('#message-timeout-select');
  const current = String(ui.getMessageTimeoutMs());
  if (!Array.from(select.options).some((option) => option.value === current)) {
    const custom = document.createElement('option');
    custom.value = current;
    custom.textContent = `${Math.round(Number(current) / 1000)} segundos`;
    select.appendChild(custom);
  }
  select.value = current;

  select.addEventListener('change', () => {
    const timeoutMs = ui.setMessageTimeoutMs(Number(select.value));
    const label = timeoutMs === 0 ? 'Los mensajes permanecerán visibles hasta cerrarlos.' : `Los mensajes se ocultarán después de ${Math.round(timeoutMs / 1000)} segundos.`;
    ui.showWander('Configuración guardada', label);
  });

  window.WanderMessageTimeoutSettings = Object.freeze({
    getValue: () => ui.getMessageTimeoutMs(),
  });
})();

(() => {
  const platform = window.WanderPlatform;
  const ui = window.WanderUI;
  const settingsPanel = document.querySelector('#settings-panel');
  if (!platform?.isNative?.() || !ui || !settingsPanel || window.WanderNotificationSettings) return;

  const PROMPT_KEY = 'wander.notifications.explainer.v1';
  const LABELS = Object.freeze({
    granted: 'Permitidas',
    denied: 'Denegadas',
    blocked: 'Bloqueadas',
    not_requested: 'Sin solicitar',
    unavailable: 'No disponibles',
    unknown: 'Comprobando',
  });

  const card = document.createElement('div');
  card.className = 'screen-card settings-group notification-settings';
  card.innerHTML = `
    <h3>Notificaciones de Wander</h3>
    <p class="panel-note">Permiten que Wander te avise sobre oportunidades, cambios y recordatorios aunque no estés mirando el mapa.</p>
    <div class="simulator-state-row"><span>Estado</span><strong id="notification-permission-status">Comprobando</strong></div>
    <div class="button-row compact-actions screen-card-actions">
      <button id="notification-enable-button" type="button">Activar notificaciones</button>
      <button id="notification-test-button" type="button">Enviar prueba</button>
      <button id="notification-settings-button" type="button">Abrir ajustes</button>
    </div>
  `;
  settingsPanel.prepend(card);

  const statusElement = card.querySelector('#notification-permission-status');
  const enableButton = card.querySelector('#notification-enable-button');
  const testButton = card.querySelector('#notification-test-button');
  const settingsButton = card.querySelector('#notification-settings-button');

  function markExplainerSeen() {
    try { localStorage.setItem(PROMPT_KEY, '1'); } catch {}
  }

  function explainerSeen() {
    try { return localStorage.getItem(PROMPT_KEY) === '1'; } catch { return false; }
  }

  function render(state = platform.getNotificationPermission?.() || {}) {
    const status = String(state.status || 'unknown');
    statusElement.textContent = LABELS[status] || status;
    enableButton.hidden = status === 'granted';
    enableButton.textContent = status === 'denied' || status === 'blocked' ? 'Revisar permiso' : 'Activar notificaciones';
    testButton.disabled = status !== 'granted';
    settingsButton.hidden = status === 'not_requested';
    return state;
  }

  async function refresh() {
    const state = await platform.refreshNotificationPermission();
    return render(state);
  }

  async function activate() {
    markExplainerSeen();
    let state = await platform.refreshNotificationPermission();
    if (state.status === 'denied' || state.status === 'blocked') {
      await platform.openNotificationSettings();
      ui.showWander('Permiso de notificaciones', 'Activá las notificaciones de Wander en los ajustes de Android y volvé a la app.', { timeoutMs: 8000 });
      return render(state);
    }
    state = await platform.requestNotificationPermission();
    render(state);
    if (state.granted) {
      ui.showWander('Notificaciones activadas', 'Wander ya puede avisarte cuando tenga algo útil para decirte.', { timeoutMs: 6000 });
    } else {
      ui.showWander('Notificaciones desactivadas', 'Podés activarlas más adelante desde Ajustes.', { timeoutMs: 6000 });
    }
    return state;
  }

  async function sendTest() {
    const state = await refresh();
    if (!state.granted) {
      await activate();
      return;
    }
    const result = await platform.deliverNotification({
      id: `wander-test-${Date.now()}`,
      title: 'Wander está listo',
      message: 'Esta es una notificación de prueba. Wander podrá avisarte cuando detecte algo útil.',
    });
    render(platform.getNotificationPermission());
    ui.showWander(
      result.delivered ? 'Notificación enviada' : 'No se pudo enviar',
      result.delivered ? 'La prueba fue entregada a Android.' : 'Revisá el permiso de notificaciones en los ajustes del teléfono.',
      { timeoutMs: 6500 }
    );
  }

  async function showFirstRunExplainer() {
    if (explainerSeen()) return;
    const state = await refresh();
    if (state.status !== 'not_requested') {
      markExplainerSeen();
      return;
    }
    ui.showWander(
      'Dejá que Wander te avise',
      'Wander necesita notificaciones para sugerirte algo, anticipar un cambio o recordarte cuándo conviene moverte aunque la app no esté en pantalla.',
      {
        persistent: true,
        choices: [
          { label: 'Activar', emphasis: 'primary', onInvoke: activate },
          {
            label: 'Ahora no',
            onInvoke: () => {
              markExplainerSeen();
              ui.hideWander();
            },
          },
        ],
      }
    );
  }

  enableButton.addEventListener('click', activate);
  testButton.addEventListener('click', sendTest);
  settingsButton.addEventListener('click', async () => {
    markExplainerSeen();
    await platform.openNotificationSettings();
  });

  window.addEventListener('wander:notification-permission', (event) => render(event.detail));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
  window.addEventListener('wander:app-ready', () => setTimeout(showFirstRunExplainer, 1200), { once: true });

  render();
  refresh();

  window.WanderNotificationSettings = Object.freeze({ refresh, activate, sendTest, getState: platform.getNotificationPermission });
})();
