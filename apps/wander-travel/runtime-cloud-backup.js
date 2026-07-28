(() => {
  if (window.WanderCloudBackup) return;

  const STORAGE_KEYS = Object.freeze([
    'wander.personalPOIs.v1',
    'wander.sessions.v1',
    'wander.session.active.v1',
    'wander.sessions.settings.v1',
    'wander.recording.profile.v1',
    'wander.travelLog.entries.v1',
    'wander.travelLog.plans.v1',
  ]);
  const UPDATED_KEY = 'wander.cloudBackup.localUpdatedAt.v1';
  const HASH_KEY = 'wander.cloudBackup.contentHash.v1';
  const RESTORE_KEY = 'wander.cloudBackup.lastRestore.v1';
  const LAST_SUCCESS_KEY = 'wander.cloudBackup.lastSuccessAt.v1';
  const LAST_ATTEMPT_KEY = 'wander.cloudBackup.lastAttemptAt.v1';
  const PENDING_KEY = 'wander.cloudBackup.pendingSince.v1';
  const SYNC_DELAY_MS = 5000;
  const PERIODIC_SYNC_MS = 2 * 60 * 1000;
  const listeners = new Set();

  let identity = null;
  let started = false;
  let restoring = false;
  let syncTimer = null;
  let periodicTimer = null;
  let activeRequest = null;
  let settingsCard = null;
  let state = Object.freeze({
    status: 'preparing',
    deviceLabel: null,
    lastSyncAt: readStoredTimestamp(LAST_SUCCESS_KEY),
    lastAttemptAt: readStoredTimestamp(LAST_ATTEMPT_KEY),
    lastRestoreAt: readStoredTimestamp(RESTORE_KEY),
    pending: Boolean(readStoredTimestamp(PENDING_KEY)),
    pendingSince: readStoredTimestamp(PENDING_KEY),
    remoteExists: null,
    error: null,
  });

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function readStoredTimestamp(key) {
    try {
      const value = String(localStorage.getItem(key) || '');
      return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
    } catch {
      return null;
    }
  }

  function storeTimestamp(key, value = new Date().toISOString()) {
    const timestamp = Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString();
    try { localStorage.setItem(key, timestamp); } catch {}
    return timestamp;
  }

  function removeStored(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  function setState(patch = {}) {
    state = Object.freeze({ ...state, ...patch });
    const confidence = state.status === 'error' ? 0.4 : 1;
    const context = window.WanderContext;
    const metadata = { source: 'cloud-backup', kind: 'observed', ttlMs: Infinity, confidence };
    context?.set?.('cloudBackup.status', state.status, metadata);
    context?.set?.('cloudBackup.deviceLabel', state.deviceLabel, metadata);
    context?.set?.('cloudBackup.lastSyncAt', state.lastSyncAt, metadata);
    context?.set?.('cloudBackup.lastAttemptAt', state.lastAttemptAt, metadata);
    context?.set?.('cloudBackup.lastRestoreAt', state.lastRestoreAt, metadata);
    context?.set?.('cloudBackup.pending', state.pending, metadata);
    context?.set?.('cloudBackup.pendingSince', state.pendingSince, metadata);
    context?.set?.('cloudBackup.remoteExists', state.remoteExists, metadata);
    if (state.error) context?.set?.('cloudBackup.error', state.error, metadata);
    else context?.remove?.('cloudBackup.error');
    listeners.forEach((listener) => { try { listener(clone(state)); } catch {} });
    window.dispatchEvent(new CustomEvent('wander:cloud-backup-change', { detail: clone(state) }));
    renderSettings();
    return state;
  }

  function readRawData() {
    return Object.fromEntries(STORAGE_KEYS.map((key) => {
      try { return [key, localStorage.getItem(key)]; }
      catch { return [key, null]; }
    }));
  }

  function parse(raw, fallback) {
    try {
      const value = JSON.parse(raw || 'null');
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function dataCounts(data = readRawData()) {
    const pois = parse(data['wander.personalPOIs.v1'], []);
    const sessions = parse(data['wander.sessions.v1'], []);
    const active = parse(data['wander.session.active.v1'], null);
    const entries = parse(data['wander.travelLog.entries.v1'], []);
    const plans = parse(data['wander.travelLog.plans.v1'], []);
    return {
      pois: Array.isArray(pois) ? pois.length : 0,
      sessions: (Array.isArray(sessions) ? sessions.length : 0) + (active?.id ? 1 : 0),
      entries: Array.isArray(entries) ? entries.length : 0,
      plans: Array.isArray(plans) ? plans.length : 0,
    };
  }

  function hasMeaningfulData(data = readRawData()) {
    const counts = dataCounts(data);
    return counts.pois > 0 || counts.sessions > 0 || counts.entries > 0 || counts.plans > 0;
  }

  function deriveLatestTimestamp(data) {
    let latest = 0;
    const visit = (value, key = '') => {
      if (value == null) return;
      if (Array.isArray(value)) return value.forEach((item) => visit(item, key));
      if (typeof value === 'object') return Object.entries(value).forEach(([childKey, child]) => visit(child, childKey));
      if (!/(?:^at$|At$|updated$|created$|started$|ended$)/i.test(key)) return;
      const numeric = typeof value === 'number' ? value : Date.parse(String(value));
      if (Number.isFinite(numeric)) latest = Math.max(latest, numeric);
    };
    Object.values(data).forEach((raw) => visit(parse(raw, null)));
    return latest ? new Date(latest).toISOString() : null;
  }

  async function contentHash(data) {
    const source = JSON.stringify(data);
    if (globalThis.crypto?.subtle && globalThis.TextEncoder) {
      const bytes = new TextEncoder().encode(source);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
    }
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function endpoint() {
    return window.WanderPlatform?.apiUrl?.('/api/cloud-backup') || '/api/cloud-backup';
  }

  function identityPlugin() {
    return window.Capacitor?.Plugins?.WanderCloudIdentity || null;
  }

  async function waitForIdentity() {
    if (identity?.deviceKey) return identity;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const plugin = identityPlugin();
      if (typeof plugin?.getIdentity === 'function') {
        const result = await plugin.getIdentity();
        if (/^[a-f0-9]{64}$/.test(String(result?.deviceKey || ''))) {
          identity = {
            deviceKey: String(result.deviceKey),
            deviceLabel: String(result.deviceLabel || result.deviceKey.slice(0, 8)).toUpperCase(),
            recoverableAfterReinstall: result.recoverableAfterReinstall === true,
          };
          setState({ deviceLabel: identity.deviceLabel, error: null });
          return identity;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error('La identidad estable de la APK no está disponible.');
  }

  async function requestRemote(method = 'GET', body = null) {
    const currentIdentity = await waitForIdentity();
    const options = {
      method,
      headers: { accept: 'application/json', 'x-wander-device-key': currentIdentity.deviceKey },
      cache: 'no-store',
    };
    if (body !== null) {
      options.headers['content-type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(endpoint(), options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true) throw new Error(payload?.error || `Cloud backup returned HTTP ${response.status}.`);
    return payload;
  }

  function apkVersion() {
    const value = window.WanderNativeAppVersion?.getVersion?.() || window.WanderContext?.value?.('app.apkVersion');
    return value && !/detectando|disponible|aplica/i.test(String(value)) ? String(value) : '';
  }

  async function buildBackup(options = {}) {
    const data = readRawData();
    const updatedAt = options.clientUpdatedAt
      || readStoredTimestamp(UPDATED_KEY)
      || deriveLatestTimestamp(data)
      || new Date().toISOString();
    return {
      schemaVersion: 1,
      clientUpdatedAt: new Date(updatedAt).toISOString(),
      webVersion: String(window.WanderWebVersion || window.WanderVersion || ''),
      apkVersion: apkVersion(),
      contentHash: await contentHash(data),
      data,
    };
  }

  function markPending(at = new Date().toISOString()) {
    const changedAt = storeTimestamp(UPDATED_KEY, at);
    const pendingSince = readStoredTimestamp(PENDING_KEY) || storeTimestamp(PENDING_KEY, changedAt);
    setState({ status: state.status === 'syncing' ? state.status : 'pending', pending: true, pendingSince, error: null });
    return pendingSince;
  }

  function markAttempt() {
    const lastAttemptAt = storeTimestamp(LAST_ATTEMPT_KEY);
    setState({ lastAttemptAt });
    return lastAttemptAt;
  }

  function markSuccess(syncedAt, contentHashValue, clientUpdatedAt) {
    const lastSyncAt = storeTimestamp(LAST_SUCCESS_KEY, syncedAt || new Date().toISOString());
    if (clientUpdatedAt) storeTimestamp(UPDATED_KEY, clientUpdatedAt);
    if (contentHashValue) {
      try { localStorage.setItem(HASH_KEY, String(contentHashValue)); } catch {}
    }
    removeStored(PENDING_KEY);
    setState({ status: 'synced', lastSyncAt, pending: false, pendingSince: null, remoteExists: true, error: null });
    return lastSyncAt;
  }

  function restoreBackup(backup) {
    if (!backup?.data || typeof backup.data !== 'object') throw new Error('La copia remota no contiene datos válidos.');
    restoring = true;
    for (const key of STORAGE_KEYS) {
      const value = backup.data[key];
      if (value === null || value === undefined) removeStored(key);
      else if (typeof value === 'string') localStorage.setItem(key, value);
      else throw new Error(`La copia remota contiene un valor inválido para ${key}.`);
    }
    const restoredAt = storeTimestamp(RESTORE_KEY);
    const syncedAt = backup.storedAt || backup.clientUpdatedAt || restoredAt;
    if (backup.contentHash) localStorage.setItem(HASH_KEY, String(backup.contentHash));
    storeTimestamp(UPDATED_KEY, backup.clientUpdatedAt || restoredAt);
    storeTimestamp(LAST_SUCCESS_KEY, syncedAt);
    removeStored(PENDING_KEY);
    setState({
      status: 'restoring',
      lastRestoreAt: restoredAt,
      lastSyncAt: new Date(syncedAt).toISOString(),
      pending: false,
      pendingSince: null,
      remoteExists: true,
      error: null,
    });
    window.setTimeout(() => window.location.reload(), 80);
  }

  async function uploadBackup(backup, options = {}) {
    if (!hasMeaningfulData(backup.data) && options.allowEmpty !== true) {
      setState({ status: 'empty', error: null });
      return { skipped: true, reason: 'empty' };
    }
    setState({ status: 'syncing', error: null });
    const result = await requestRemote('PUT', backup);
    if (result.contentHash && result.contentHash !== backup.contentHash) {
      throw new Error('La nube no confirmó el contenido completo del backup.');
    }
    markSuccess(result.storedAt || new Date().toISOString(), backup.contentHash, backup.clientUpdatedAt);
    return result;
  }

  async function bootstrap() {
    if (restoring) return { reloading: true };
    setState({ status: navigator.onLine === false ? 'offline' : 'connecting', error: null });
    try {
      await waitForIdentity();
      if (navigator.onLine === false) return { offline: true };

      markAttempt();
      const localData = readRawData();
      const localMeaningful = hasMeaningfulData(localData);
      const localMarker = readStoredTimestamp(UPDATED_KEY);
      const localUpdatedAt = localMarker || deriveLatestTimestamp(localData);
      const localHash = await contentHash(localData);
      const remoteResult = await requestRemote('GET');
      const remote = remoteResult.exists ? remoteResult.backup : null;
      setState({ remoteExists: Boolean(remote), error: null });

      if (remote && !localMeaningful) {
        restoreBackup(remote);
        return { reloading: true, restored: true };
      }

      if (remote && localMeaningful) {
        const remoteTime = Date.parse(remote.clientUpdatedAt || remote.storedAt || '') || 0;
        const localTime = Date.parse(localUpdatedAt || '') || 0;
        const firstCloudSync = !localMarker;
        if (!firstCloudSync && remoteTime > localTime + 1000 && remote.contentHash !== localHash) {
          restoreBackup(remote);
          return { reloading: true, restored: true };
        }
        if (remote.contentHash === localHash) {
          storeTimestamp(UPDATED_KEY, remote.clientUpdatedAt || localUpdatedAt || new Date().toISOString());
          markSuccess(remote.storedAt || remote.clientUpdatedAt || new Date().toISOString(), localHash, remote.clientUpdatedAt || localUpdatedAt);
          return { synced: true };
        }
      }

      if (localMeaningful) {
        const backup = await buildBackup({ clientUpdatedAt: localUpdatedAt || new Date().toISOString() });
        await uploadBackup(backup);
        return { uploaded: true };
      }

      removeStored(PENDING_KEY);
      setState({ status: 'empty', pending: false, pendingSince: null, remoteExists: false, error: null });
      return { empty: true };
    } catch (error) {
      setState({ status: navigator.onLine === false ? 'offline' : 'error', error: error?.message || String(error) });
      return { error };
    }
  }

  async function synchronize(options = {}) {
    if (restoring) return { restoring: true };
    if (activeRequest) return activeRequest;
    activeRequest = (async () => {
      markAttempt();
      try {
        await waitForIdentity();
        if (navigator.onLine === false) {
          setState({ status: 'offline', error: null });
          return { offline: true };
        }
        const backup = await buildBackup();
        const previousHash = String(localStorage.getItem(HASH_KEY) || '');
        if (options.force !== true && backup.contentHash === previousHash) {
          removeStored(PENDING_KEY);
          setState({
            status: 'synced',
            lastSyncAt: readStoredTimestamp(LAST_SUCCESS_KEY),
            pending: false,
            pendingSince: null,
            error: null,
          });
          return { skipped: true, reason: 'unchanged' };
        }
        if (!hasMeaningfulData(backup.data)) {
          const remote = await requestRemote('GET');
          if (remote.exists && remote.backup) {
            restoreBackup(remote.backup);
            return { reloading: true, restored: true };
          }
          removeStored(PENDING_KEY);
          setState({ status: 'empty', pending: false, pendingSince: null, remoteExists: false, error: null });
          return { empty: true };
        }
        return await uploadBackup(backup);
      } catch (error) {
        const pendingSince = readStoredTimestamp(PENDING_KEY);
        setState({
          status: navigator.onLine === false ? 'offline' : 'error',
          pending: Boolean(pendingSince),
          pendingSince,
          error: error?.message || String(error),
        });
        return { error };
      } finally {
        activeRequest = null;
      }
    })();
    return activeRequest;
  }

  function scheduleSync() {
    if (!started || restoring) return;
    markPending();
    if (syncTimer) return;
    syncTimer = setTimeout(() => {
      syncTimer = null;
      synchronize();
    }, SYNC_DELAY_MS);
  }

  function statusLabel() {
    const labels = {
      preparing: 'Preparando',
      connecting: 'Conectando',
      pending: 'Cambios pendientes',
      syncing: 'Sincronizando',
      synced: 'Sincronizado',
      restoring: 'Restaurando',
      offline: 'Sin conexión · pendiente',
      empty: 'Sin datos para copiar',
      error: 'Error de sincronización',
    };
    return labels[state.status] || state.status;
  }

  function formatDate(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return 'Nunca';
    return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'medium' });
  }

  function pendingLabel() {
    return state.pending ? `Sí · desde ${formatDate(state.pendingSince)}` : 'No';
  }

  function includedLabel() {
    const counts = dataCounts();
    return `${counts.entries} registros · ${counts.sessions} recorridos · ${counts.pois} puntos`;
  }

  function installSettings() {
    if (settingsCard || !document.querySelector('#settings-panel')) return;
    settingsCard = document.createElement('div');
    settingsCard.className = 'screen-card settings-group cloud-backup-settings';
    settingsCard.innerHTML = `
      <h3>Backup en la nube</h3>
      <p class="panel-note">Puntos, recorridos, planes y Bitácora se guardan automáticamente en Cloudflare. Los mapas descargados permanecen únicamente en el teléfono.</p>
      <div class="cloud-backup-status-row"><span>Estado</span><strong data-cloud-backup-status>Preparando</strong></div>
      <div class="cloud-backup-status-row"><span>Último backup confirmado</span><strong data-cloud-backup-last>Nunca</strong></div>
      <div class="cloud-backup-status-row"><span>Cambios pendientes</span><strong data-cloud-backup-pending>No</strong></div>
      <div class="cloud-backup-status-row"><span>Último intento</span><strong data-cloud-backup-attempt>Nunca</strong></div>
      <div class="cloud-backup-status-row"><span>Incluido</span><strong data-cloud-backup-included>—</strong></div>
      <div class="cloud-backup-status-row"><span>Dispositivo</span><strong data-cloud-backup-device>—</strong></div>
      <div class="button-row compact-actions screen-card-actions"><button type="button" data-cloud-backup-sync><svg class="button-icon"><use href="wander-icons.svg#refresh"></use></svg><span>Crear backup ahora</span></button></div>
      <p class="panel-note" data-cloud-backup-error hidden></p>
    `;
    document.querySelector('#settings-panel').appendChild(settingsCard);
    settingsCard.querySelector('[data-cloud-backup-sync]')?.addEventListener('click', () => synchronize({ force: true, reason: 'manual' }));
    renderSettings();
  }

  function renderSettings() {
    if (!settingsCard) return;
    const status = settingsCard.querySelector('[data-cloud-backup-status]');
    const device = settingsCard.querySelector('[data-cloud-backup-device]');
    const last = settingsCard.querySelector('[data-cloud-backup-last]');
    const attempt = settingsCard.querySelector('[data-cloud-backup-attempt]');
    const pending = settingsCard.querySelector('[data-cloud-backup-pending]');
    const included = settingsCard.querySelector('[data-cloud-backup-included]');
    const error = settingsCard.querySelector('[data-cloud-backup-error]');
    const button = settingsCard.querySelector('[data-cloud-backup-sync]');
    if (status) status.textContent = statusLabel();
    if (device) device.textContent = state.deviceLabel || '—';
    if (last) {
      last.textContent = formatDate(state.lastSyncAt);
      last.title = state.lastSyncAt || '';
    }
    if (attempt) {
      attempt.textContent = formatDate(state.lastAttemptAt);
      attempt.title = state.lastAttemptAt || '';
    }
    if (pending) pending.textContent = pendingLabel();
    if (included) included.textContent = includedLabel();
    if (error) {
      error.hidden = !state.error;
      error.textContent = state.error || '';
    }
    if (button) button.disabled = state.status === 'syncing' || state.status === 'restoring';
  }

  function start() {
    if (started) return;
    started = true;
    installSettings();
    const events = [
      'wander:personal-poi-created',
      'wander:personal-poi-updated',
      'wander:personal-poi-removed',
      'wander:personal-poi-moved',
      'wander:sessions-changed',
      'wander:travel-log-change',
      'wander:recording-profile-changed',
    ];
    events.forEach((name) => window.addEventListener(name, scheduleSync));
    window.addEventListener('online', () => synchronize());
    window.addEventListener('offline', () => setState({ status: 'offline', error: null }));
    document.addEventListener?.('visibilitychange', () => {
      if (document.visibilityState === 'visible') synchronize();
    });
    window.addEventListener('pagehide', () => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = null;
      synchronize();
    });
    periodicTimer = setInterval(() => synchronize(), PERIODIC_SYNC_MS);
    synchronize();
  }

  window.WanderCloudBackup = Object.freeze({
    bootstrap,
    start,
    synchronize,
    getState: () => clone(state),
    getIdentity: () => clone(identity),
    readRawData,
    hasMeaningfulData,
    dataCounts,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    constants: {
      STORAGE_KEYS,
      UPDATED_KEY,
      HASH_KEY,
      RESTORE_KEY,
      LAST_SUCCESS_KEY,
      LAST_ATTEMPT_KEY,
      PENDING_KEY,
    },
  });

  setState({});
})();
