(() => {
  if (window.WanderCloudBackup) return;

  const config = window.WanderBackupConfig || {};
  const native = window.Capacitor?.isNativePlatform?.() === true;
  const enabled = native && config.enabled === true && Boolean(String(config.token || '').trim());
  const endpoint = String(config.endpoint || '').trim();
  const token = String(config.token || '').trim();
  const META_KEY = 'wander.cloudBackup.meta.v1';
  const RELOAD_GUARD_KEY = 'wander.cloudBackup.reloadGuard.v1';
  const UPLOAD_AFTER_RELOAD_KEY = 'wander.cloudBackup.uploadAfterReload.v1';
  const DEBOUNCE_MS = 20000;
  const PERIODIC_MS = 5 * 60 * 1000;
  const DATA_KEYS = Object.freeze([
    'wander.personalPOIs.v1',
    'wander.sessions.v1',
    'wander.session.active.v1',
    'wander.sessions.settings.v1',
    'wander.recording.profile.v1',
    'wander.travelLog.entries.v1',
    'wander.travelLog.plans.v1',
  ]);
  const listeners = new Set();
  let uploadTimer = null;
  let syncing = false;
  let started = false;
  let state = {
    enabled,
    status: enabled ? 'idle' : 'disabled',
    message: enabled ? 'Preparando backup' : 'Disponible solo en la APK configurada',
    lastBackupAt: null,
    lastRestoreAt: null,
    revision: null,
    counts: { points: 0, routes: 0, logEntries: 0, plans: 0 },
  };

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function readJson(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      if (value === undefined || value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function readMeta() {
    const value = readJson(META_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function saveMeta(changes = {}) {
    const meta = { ...readMeta(), ...changes };
    writeJson(META_KEY, meta);
    return meta;
  }

  function readData() {
    const data = {};
    for (const key of DATA_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw == null) continue;
      try { data[key] = JSON.parse(raw); }
      catch {}
    }
    return data;
  }

  function countArray(value) {
    return Array.isArray(value) ? value.length : 0;
  }

  function counts(data = readData()) {
    return {
      points: countArray(data['wander.personalPOIs.v1']),
      routes: countArray(data['wander.sessions.v1']) + (data['wander.session.active.v1']?.id ? 1 : 0),
      logEntries: countArray(data['wander.travelLog.entries.v1']),
      plans: countArray(data['wander.travelLog.plans.v1']),
    };
  }

  function hasMeaningfulData(data = readData()) {
    const summary = counts(data);
    return summary.points > 0 || summary.routes > 0 || summary.logEntries > 0 || summary.plans > 0;
  }

  function updateState(changes = {}) {
    state = { ...state, ...changes, counts: changes.counts ? { ...changes.counts } : state.counts };
    listeners.forEach((listener) => { try { listener(clone(state)); } catch {} });
    window.WanderContext?.set?.('backup.cloud', clone(state), {
      source: 'cloud-backup', kind: 'observed', confidence: 1, ttlMs: 10 * 60 * 1000,
    });
    window.dispatchEvent(new CustomEvent('wander:cloud-backup-status', { detail: clone(state) }));
    renderSettings();
  }

  function makeSnapshot() {
    const data = readData();
    return {
      schemaVersion: 1,
      appVersion: String(window.WanderWebVersion || window.WanderVersion || ''),
      apkVersion: String(window.WanderNativeAppVersion?.versionName || window.WanderContext?.value?.('app.apkVersion') || ''),
      source: {
        platform: 'android',
        channel: String(config.channel || 'shared-test-v1'),
        generatedAt: new Date().toISOString(),
      },
      counts: counts(data),
      data,
    };
  }

  async function request(method, body = null) {
    if (!endpoint) throw new Error('Backup endpoint missing');
    const response = await fetch(endpoint, {
      method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : null,
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 404 && payload?.exists === false) return { ...payload, status: 404 };
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `Backup HTTP ${response.status}`);
    return payload;
  }

  function entityTimestamp(value = {}) {
    const candidates = [value.updatedAt, value.endedAt, value.at, value.createdAt, value.startedAt];
    for (const candidate of candidates) {
      const number = typeof candidate === 'number' ? candidate : Date.parse(candidate || '');
      if (Number.isFinite(number)) return number;
    }
    return 0;
  }

  function mergeById(localValue, cloudValue) {
    const local = Array.isArray(localValue) ? localValue : [];
    const cloud = Array.isArray(cloudValue) ? cloudValue : [];
    const merged = new Map();
    for (const item of cloud) {
      const id = String(item?.id || '');
      if (id) merged.set(id, item);
    }
    for (const item of local) {
      const id = String(item?.id || '');
      if (!id) continue;
      const previous = merged.get(id);
      if (!previous || entityTimestamp(item) >= entityTimestamp(previous)) merged.set(id, item);
    }
    return [...merged.values()].sort((left, right) => entityTimestamp(left) - entityTimestamp(right));
  }

  function mergeData(local, cloud) {
    const merged = { ...cloud, ...local };
    for (const key of [
      'wander.personalPOIs.v1',
      'wander.sessions.v1',
      'wander.travelLog.entries.v1',
      'wander.travelLog.plans.v1',
    ]) {
      merged[key] = mergeById(local[key], cloud[key]);
    }
    const localActive = local['wander.session.active.v1'];
    const cloudActive = cloud['wander.session.active.v1'];
    merged['wander.session.active.v1'] = localActive?.id ? localActive : cloudActive?.id ? cloudActive : undefined;
    return merged;
  }

  function applyData(data, revision, options = {}) {
    for (const key of DATA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(data || {}, key) && data[key] !== undefined && data[key] !== null) writeJson(key, data[key]);
      else localStorage.removeItem(key);
    }
    saveMeta({
      revision: revision || null,
      lastRestoreAt: new Date().toISOString(),
      lastLocalChangeAt: options.keepDirty ? new Date().toISOString() : null,
      lastError: null,
    });
    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, revision || 'restored');
      if (options.uploadAfterReload) sessionStorage.setItem(UPLOAD_AFTER_RELOAD_KEY, 'true');
    } catch {}
    window.location.reload();
  }

  async function upload() {
    if (!enabled || syncing) return null;
    syncing = true;
    clearTimeout(uploadTimer);
    uploadTimer = null;
    updateState({ status: 'uploading', message: 'Guardando puntos, recorridos y bitácora' });
    try {
      const result = await request('PUT', makeSnapshot());
      const now = result.updatedAt || new Date().toISOString();
      saveMeta({
        revision: result.revision || null,
        lastUploadAt: now,
        lastLocalChangeAt: null,
        lastError: null,
      });
      updateState({
        status: 'synced',
        message: 'Backup actualizado',
        lastBackupAt: now,
        revision: result.revision || null,
        counts: result.counts || counts(),
      });
      return result;
    } catch (error) {
      saveMeta({ lastError: error.message || String(error) });
      updateState({ status: 'error', message: error.message || 'No se pudo actualizar el backup' });
      return null;
    } finally {
      syncing = false;
    }
  }

  function scheduleUpload(delay = DEBOUNCE_MS) {
    if (!enabled) return;
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(() => upload(), Math.max(0, delay));
  }

  function markDirty() {
    if (!enabled) return;
    saveMeta({ lastLocalChangeAt: new Date().toISOString() });
    updateState({ status: 'pending', message: 'Cambios pendientes de backup', counts: counts() });
    scheduleUpload();
  }

  async function bootstrap() {
    if (!enabled || started) return;
    started = true;
    updateState({ status: 'checking', message: 'Buscando backup en Cloudflare', counts: counts() });
    const local = readData();
    const meta = readMeta();
    try {
      const cloud = await request('GET');
      if (cloud.status === 404 || cloud.exists === false) {
        updateState({ status: 'pending', message: hasMeaningfulData(local) ? 'Creando primer backup' : 'Sin datos para respaldar', counts: counts(local) });
        if (hasMeaningfulData(local)) await upload();
        attachChangeListeners();
        return;
      }

      const cloudData = cloud.data && typeof cloud.data === 'object' ? cloud.data : {};
      const sameRevision = Boolean(meta.revision && cloud.revision && meta.revision === cloud.revision);
      const localDirty = Boolean(meta.lastLocalChangeAt);
      const reloadGuard = sessionStorage.getItem(RELOAD_GUARD_KEY);
      if (reloadGuard) sessionStorage.removeItem(RELOAD_GUARD_KEY);

      if (!sameRevision && !reloadGuard) {
        if (!hasMeaningfulData(local) || !localDirty) {
          updateState({ status: 'restoring', message: 'Recuperando backup anterior' });
          applyData(cloudData, cloud.revision);
          return;
        }
        const merged = mergeData(local, cloudData);
        updateState({ status: 'restoring', message: 'Uniendo datos locales con el backup' });
        applyData(merged, cloud.revision, { keepDirty: true, uploadAfterReload: true });
        return;
      }

      saveMeta({
        revision: cloud.revision || meta.revision || null,
        lastUploadAt: cloud.updatedAt || meta.lastUploadAt || null,
        lastError: null,
      });
      updateState({
        status: localDirty ? 'pending' : 'synced',
        message: localDirty ? 'Cambios pendientes de backup' : 'Backup al día',
        lastBackupAt: cloud.updatedAt || meta.lastUploadAt || null,
        lastRestoreAt: meta.lastRestoreAt || null,
        revision: cloud.revision || null,
        counts: counts(local),
      });
      attachChangeListeners();
      if (sessionStorage.getItem(UPLOAD_AFTER_RELOAD_KEY) === 'true') {
        sessionStorage.removeItem(UPLOAD_AFTER_RELOAD_KEY);
        scheduleUpload(500);
      } else if (localDirty) {
        scheduleUpload(1500);
      }
    } catch (error) {
      saveMeta({ lastError: error.message || String(error) });
      updateState({ status: 'offline', message: 'Sin conexión con el backup; Wander sigue funcionando localmente', counts: counts(local) });
      attachChangeListeners();
    }
  }

  let changeListenersAttached = false;
  function attachChangeListeners() {
    if (changeListenersAttached) return;
    changeListenersAttached = true;
    [
      'wander:personal-poi-created',
      'wander:personal-poi-updated',
      'wander:personal-poi-moved',
      'wander:personal-poi-removed',
      'wander:sessions-changed',
      'wander:travel-log-change',
      'wander:recording-profile-changed',
    ].forEach((name) => window.addEventListener(name, markDirty));
    window.addEventListener('online', () => scheduleUpload(1000));
    window.setInterval(() => {
      if (readMeta().lastLocalChangeAt) scheduleUpload(0);
    }, PERIODIC_MS);
  }

  function formatDate(value) {
    if (!value) return 'Todavía no';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString('es-AR') : 'Todavía no';
  }

  let settingsCard = null;
  function renderSettings() {
    const panel = document.querySelector('#settings-panel');
    if (!panel || !enabled) return;
    if (!settingsCard) {
      settingsCard = document.createElement('div');
      settingsCard.className = 'screen-card settings-group cloud-backup-settings';
      settingsCard.innerHTML = `
        <h3>Backup en la nube</h3>
        <p class="panel-note">Copia automática compartida de puntos, recorridos y bitácora. Esta versión de prueba no usa cuentas.</p>
        <div class="simulator-state-row"><span>Estado</span><strong data-cloud-backup-status>—</strong></div>
        <div class="simulator-state-row"><span>Última copia</span><strong data-cloud-backup-date>—</strong></div>
        <div class="simulator-state-row"><span>Contenido</span><strong data-cloud-backup-counts>—</strong></div>
        <div class="button-row compact-actions screen-card-actions"><button type="button" data-cloud-backup-now>Sincronizar ahora</button></div>
      `;
      panel.prepend(settingsCard);
      settingsCard.querySelector('[data-cloud-backup-now]')?.addEventListener('click', () => upload());
    }
    const status = settingsCard.querySelector('[data-cloud-backup-status]');
    const date = settingsCard.querySelector('[data-cloud-backup-date]');
    const summary = settingsCard.querySelector('[data-cloud-backup-counts]');
    const button = settingsCard.querySelector('[data-cloud-backup-now]');
    if (status) status.textContent = state.message;
    if (date) date.textContent = formatDate(state.lastBackupAt);
    if (summary) summary.textContent = `${state.counts.points} puntos · ${state.counts.routes} recorridos · ${state.counts.logEntries} entradas`;
    if (button) button.disabled = syncing;
  }

  window.WanderCloudBackup = Object.freeze({
    enabled,
    bootstrap,
    syncNow: upload,
    schedule: scheduleUpload,
    markDirty,
    snapshot: makeSnapshot,
    status: () => clone(state),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  });

  if (enabled) queueMicrotask(bootstrap);
  else updateState({ status: 'disabled', message: 'Backup desactivado en esta compilación' });
})();
