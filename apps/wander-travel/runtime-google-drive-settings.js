(() => {
  if (window.WanderGoogleDriveSettings) return;

  const storage = window.WanderGoogleDriveStorage;
  const ui = window.WanderUI;
  const panel = document.querySelector('#settings-panel');
  if (!storage || !panel) return;

  const card = document.createElement('div');
  card.className = 'screen-card settings-group google-drive-storage-settings';
  card.innerHTML = `
    <h3>Persistencia</h3>
    <p class="panel-note">Wander guarda primero en el teléfono. Google Drive se usa como copia y sincronización en segundo plano.</p>
    <div class="simulator-state-row"><span>Google</span><strong data-google-drive-account>Sin conectar</strong></div>
    <div class="simulator-state-row"><span>Ubicación</span><strong data-google-drive-location>Solo en este teléfono</strong></div>
    <div class="simulator-state-row"><span>Estado</span><strong data-google-drive-status>Local</strong></div>
    <div class="button-row compact-actions screen-card-actions">
      <button type="button" data-google-drive-connect>Conectar Google</button>
      <button type="button" data-google-drive-change>Cambiar ubicación</button>
      <button type="button" data-google-drive-sync>Sincronizar ahora</button>
      <button type="button" data-google-drive-repair>Reconfigurar</button>
      <button type="button" data-google-drive-disconnect>Desconectar</button>
    </div>
  `;
  panel.prepend(card);

  const account = card.querySelector('[data-google-drive-account]');
  const location = card.querySelector('[data-google-drive-location]');
  const status = card.querySelector('[data-google-drive-status]');
  const connectButton = card.querySelector('[data-google-drive-connect]');
  const changeButton = card.querySelector('[data-google-drive-change]');
  const syncButton = card.querySelector('[data-google-drive-sync]');
  const repairButton = card.querySelector('[data-google-drive-repair]');
  const disconnectButton = card.querySelector('[data-google-drive-disconnect]');
  let busy = false;

  function queueCount() {
    try {
      const jobs = JSON.parse(localStorage.getItem('wander.persistence.queue.v1') || '[]');
      return Array.isArray(jobs) ? jobs.length : 0;
    } catch { return 0; }
  }

  function render() {
    const state = storage.getState();
    const connected = Boolean(state?.spreadsheetId && state?.tracksFolderId);
    account.textContent = connected
      ? (state.accountEmail || state.accountName || 'Cuenta Google conectada')
      : (storage.isAvailable() ? 'Sin conectar' : 'Disponible en la APK');
    location.textContent = connected
      ? `${state.parentFolderName ? `${state.parentFolderName} / ` : ''}Wander / Data / Wander`
      : 'Solo en este teléfono';
    const pending = queueCount();
    status.textContent = connected
      ? (pending ? `${pending} pendiente${pending === 1 ? '' : 's'}` : 'Sincronizado')
      : 'Local';
    connectButton.hidden = connected;
    changeButton.hidden = !connected;
    syncButton.hidden = !connected;
    repairButton.hidden = !connected;
    disconnectButton.hidden = !connected;
    [connectButton, changeButton, syncButton, repairButton, disconnectButton].forEach((button) => { button.disabled = busy; });
  }

  function structureMessage(result) {
    const reused = result?.reused || {};
    const state = result?.state || storage.getState() || {};
    const found = [reused.root, reused.data, reused.tracks, reused.spreadsheet].filter(Boolean).length;
    const lines = [
      `Wander/Data/Wander ${reused.spreadsheet ? '✓' : 'creada'}`,
      `Wander/Tracks ${reused.tracks ? '✓' : 'creada'}`,
    ];
    const title = found ? 'Estructura encontrada' : 'Estructura creada';
    const detail = `${lines.join(' · ')}. Wander usará esta ubicación y seguirá guardando primero en el teléfono.`;
    ui?.showWander?.(title, detail, { timeoutMs: 9000 });
    return state;
  }

  async function run(action, label = 'Google Drive') {
    if (busy) return null;
    busy = true;
    render();
    try {
      const result = await action();
      if (result?.cancelled) return result;
      render();
      return result;
    } catch (error) {
      render();
      ui?.showWander?.(label, error?.message || 'No se pudo completar la operación con Google Drive.', { timeoutMs: 9000 });
      return null;
    } finally {
      busy = false;
      render();
    }
  }

  async function connect() {
    const result = await run(() => storage.connect(), 'Conectar Google Drive');
    if (result && !result.cancelled) structureMessage(result);
    return result;
  }

  async function changeLocation() {
    ui?.showWander?.(
      'Cambiar ubicación',
      'Elegí otra carpeta de Google Drive. Los datos locales no se borrarán y los pendientes se sincronizarán con la nueva estructura.',
      {
        persistent: true,
        choices: [
          {
            label: 'Elegir carpeta',
            emphasis: 'primary',
            onInvoke: async () => {
              ui.hideWander?.();
              await connect();
            },
          },
          { label: 'Cancelar', onInvoke: () => ui.hideWander?.() },
        ],
      }
    );
  }

  async function syncNow() {
    const result = await run(async () => {
      await storage.getAccessToken();
      await storage.flush();
      return { ok: true };
    }, 'Sincronización');
    if (result) ui?.showWander?.('Sincronización', 'Wander procesó la cola de datos pendiente.', { timeoutMs: 5000 });
  }

  async function repair() {
    const result = await run(() => storage.reconfigure(), 'Reconfigurar almacenamiento');
    if (result) {
      structureMessage(result);
      ui?.showWander?.('Almacenamiento verificado', 'Se completaron solamente las carpetas, hojas o columnas que faltaban. No se eliminaron datos.', { timeoutMs: 8000 });
    }
  }

  async function disconnect() {
    ui?.showWander?.(
      'Desconectar Google',
      'Esto revoca el acceso de Wander a Google Drive. No borra archivos de Drive ni los datos guardados en el teléfono.',
      {
        persistent: true,
        choices: [
          {
            label: 'Desconectar',
            emphasis: 'primary',
            onInvoke: async () => {
              ui.hideWander?.();
              const result = await run(() => storage.disconnect(), 'Desconectar Google Drive');
              if (result) ui?.showWander?.('Google desconectado', 'Wander seguirá funcionando y grabando de forma local.', { timeoutMs: 6500 });
            },
          },
          { label: 'Cancelar', onInvoke: () => ui.hideWander?.() },
        ],
      }
    );
  }

  connectButton.addEventListener('click', connect);
  changeButton.addEventListener('click', changeLocation);
  syncButton.addEventListener('click', syncNow);
  repairButton.addEventListener('click', repair);
  disconnectButton.addEventListener('click', disconnect);
  window.addEventListener('wander:google-drive-storage', render);
  window.addEventListener('wander:context-change', render);
  setInterval(render, 5000);

  window.WanderGoogleDriveSettings = Object.freeze({ render, connect, changeLocation, syncNow, repair, disconnect });
  render();
})();
