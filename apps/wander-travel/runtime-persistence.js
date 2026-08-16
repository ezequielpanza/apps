(() => {
  if (window.WanderPersistence) return;

  const config = window.WanderPersistenceConfig || {
    schemaVersion: 1,
    provider: 'google-sheets-drive',
    spreadsheetId: '11hQDPp2nKDyaI8SHvRwPujIgGSN15Mt1_AlbQ6WxRCU',
    tracksFolderId: '1LlNCtOA5vLlxyP-ltiL8GRwerTtNES1W',
    endpoint: '/api/persistence',
    offlineFirst: true,
    tables: { waypoints: 'Waypoints', bitacora: 'Bitacora', sessions: 'Sesiones', trackPoints: 'TrackPoints', settings: 'Ajustes', hud: 'HUD' },
  };

  const QUEUE_KEY = 'wander.persistence.queue.v1';
  const DEVICE_KEY = 'wander.persistence.deviceId.v1';
  const GPX_STATE_KEY = 'wander.persistence.gpxState.v1';
  const BOOTSTRAP_KEY = 'wander.persistence.bootstrap.v1';
  const MAX_QUEUE_JOBS = 800;
  const MAX_BATCH_ROWS = 200;
  const ACTIVE_SESSION_SYNC_MS = 60000;
  const RETRY_MS = 45000;
  const SETTINGS_KEYS = Object.freeze([
    'wander.recording.profile.v1',
    'wander.direction.indicator.v1',
    'wander.map.centerMode.v1',
    'wander.map.baseLayer.v1',
    'wander.settings.messageTimeoutMs',
    'wander.tracks.current.visible.v1',
    'wander.tracks.display.smoothing.v1',
    'wander.contextDashboard.config.v1',
  ]);

  let queue = readArray(QUEUE_KEY);
  let gpxState = readObject(GPX_STATE_KEY);
  let flushing = false;
  let flushTimer = 0;
  let lastActiveSessionSyncAt = 0;
  let waypointCache = new Map();
  let lastSessionSnapshot = null;
  const deviceId = loadDeviceId();

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch { return value; }
  }

  function readArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function readObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }

  function loadDeviceId() {
    try {
      const stored = String(localStorage.getItem(DEVICE_KEY) || '').trim();
      if (stored) return stored;
      const generated = globalThis.crypto?.randomUUID?.() || `wander-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(DEVICE_KEY, generated);
      return generated;
    } catch {
      return `wander-${Date.now().toString(36)}`;
    }
  }

  function persistQueue() {
    if (queue.length > MAX_QUEUE_JOBS) queue = queue.slice(-MAX_QUEUE_JOBS);
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch {}
    publishStatus();
  }

  function persistGpxState() {
    try { localStorage.setItem(GPX_STATE_KEY, JSON.stringify(gpxState)); } catch {}
  }

  function contextSet(key, value, extra = {}) {
    window.WanderContext?.set?.(key, value, {
      source: 'persistence', kind: 'observed', confidence: 1, ttlMs: 10 * 60 * 1000, ...extra,
    });
  }

  function publishStatus(extra = {}) {
    contextSet('persistence.remote.provider', config.provider, { ttlMs: Infinity });
    contextSet('persistence.remote.spreadsheetId', config.spreadsheetId, { ttlMs: Infinity });
    contextSet('persistence.remote.tracksFolderId', config.tracksFolderId, { ttlMs: Infinity });
    contextSet('persistence.remote.queueCount', queue.length);
    if (extra.status) contextSet('persistence.remote.status', extra.status);
    if (extra.lastSyncAt) contextSet('persistence.remote.lastSyncAt', extra.lastSyncAt);
    if (extra.error !== undefined) contextSet('persistence.remote.lastError', extra.error || null);
  }

  function endpoint() {
    return window.WanderPlatform?.apiUrl?.(config.endpoint) || config.endpoint;
  }

  function jobId(prefix = 'sync') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function enqueue(job, { replace = true } = {}) {
    if (!job || !job.action) return false;
    const normalized = {
      id: job.id || jobId(job.action),
      createdAt: job.createdAt || Date.now(),
      attempts: Number(job.attempts) || 0,
      nextAttemptAt: Number(job.nextAttemptAt) || 0,
      ...job,
    };
    if (replace && normalized.dedupeKey) {
      const existing = queue.findIndex((candidate) => candidate.dedupeKey === normalized.dedupeKey);
      if (existing >= 0) queue.splice(existing, 1);
    }
    queue.push(normalized);
    persistQueue();
    scheduleFlush(600);
    return true;
  }

  function enqueueRows(table, rows, dedupePrefix = table) {
    const valid = (Array.isArray(rows) ? rows : []).filter(Boolean);
    if (!valid.length) return 0;
    let count = 0;
    for (let start = 0; start < valid.length; start += MAX_BATCH_ROWS) {
      const chunk = valid.slice(start, start + MAX_BATCH_ROWS);
      const signature = chunk.map((row) => row.id || row.key || `${row.fieldId || ''}:${row.orientation || ''}`).join('|');
      enqueue({
        action: 'upsert',
        table,
        rows: chunk,
        dedupeKey: `upsert:${dedupePrefix}:${start}:${signature.slice(0, 300)}`,
      });
      count += chunk.length;
    }
    return count;
  }

  function requestPayload(job) {
    if (job.action === 'upload-gpx') {
      const session = sessionById(job.sessionId);
      if (!session) return null;
      const built = buildSessionGpx(session);
      if (!built?.content) return null;
      return {
        action: 'upload-gpx',
        spreadsheetId: config.spreadsheetId,
        folderId: config.tracksFolderId,
        sessionId: session.id,
        filename: built.filename,
        content: built.content,
        deviceId,
      };
    }
    return {
      action: job.action,
      spreadsheetId: config.spreadsheetId,
      folderId: config.tracksFolderId,
      table: job.table,
      rows: job.rows,
      deviceId,
    };
  }

  async function sendJob(job) {
    const payload = requestPayload(job);
    if (!payload) return { ok: false, skipped: true, retryable: false, error: 'local_source_missing' };
    const response = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok !== true) {
      const error = new Error(body?.error || `Persistence HTTP ${response.status}`);
      error.status = response.status;
      error.retryable = body?.retryable !== false && response.status !== 400;
      error.details = body;
      throw error;
    }
    return body;
  }

  function scheduleFlush(delayMs = 0) {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = 0;
      flush().catch(() => {});
    }, Math.max(0, Number(delayMs) || 0));
  }

  async function flush() {
    if (flushing || !queue.length) return { ok: true, queued: queue.length };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      publishStatus({ status: 'offline' });
      return { ok: false, offline: true, queued: queue.length };
    }
    flushing = true;
    publishStatus({ status: 'syncing', error: null });
    let synced = 0;
    try {
      for (let index = 0; index < queue.length;) {
        const job = queue[index];
        if (Number(job.nextAttemptAt || 0) > Date.now()) {
          index += 1;
          continue;
        }
        try {
          const result = await sendJob(job);
          if (job.action === 'upload-gpx' && result.file?.id) {
            gpxState[job.sessionId] = {
              fileId: result.file.id,
              name: result.file.name || job.filename || null,
              webViewLink: result.file.webViewLink || null,
              modifiedTime: result.file.modifiedTime || new Date().toISOString(),
              syncedAt: new Date().toISOString(),
            };
            persistGpxState();
            const session = sessionById(job.sessionId);
            if (session) enqueueRows(config.tables.sessions, [sessionRow(session)], `session:${session.id}:gpx`);
          }
          queue.splice(index, 1);
          synced += 1;
          persistQueue();
        } catch (error) {
          job.attempts = Number(job.attempts || 0) + 1;
          job.lastError = error?.message || 'sync_failed';
          job.nextAttemptAt = Date.now() + Math.min(15 * 60 * 1000, RETRY_MS * Math.max(1, job.attempts));
          persistQueue();
          publishStatus({ status: 'waiting', error: job.lastError });
          if (error?.retryable === false || [400, 401, 403, 503].includes(Number(error?.status))) break;
          index += 1;
        }
      }
      const lastSyncAt = new Date().toISOString();
      publishStatus({ status: queue.length ? 'waiting' : 'synced', lastSyncAt, error: queue.length ? undefined : null });
      return { ok: true, synced, queued: queue.length, lastSyncAt };
    } finally {
      flushing = false;
      if (queue.length) scheduleFlush(RETRY_MS);
    }
  }

  function waypointRow(poi, deletedAt = null) {
    if (!poi?.id) return null;
    return {
      id: poi.id,
      name: poi.name || '',
      lat: Number.isFinite(Number(poi.lat)) ? Number(poi.lat) : '',
      lng: Number.isFinite(Number(poi.lng)) ? Number(poi.lng) : '',
      type: poi.type || 'personal',
      radiusM: Number(poi.radiusM) || 35,
      notes: poi.notes || '',
      overnight: poi.overnight === true,
      vehicle: poi.vehicle === true,
      vehicleState: poi.vehicleState || '',
      createdAt: iso(poi.createdAt),
      updatedAt: iso(poi.updatedAt || Date.now()),
      deletedAt: deletedAt ? iso(deletedAt) : '',
      deviceId,
    };
  }

  function bitacoraRow(entry, deletedAt = null) {
    if (!entry?.id) return null;
    const metadata = entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
    const lat = Number(metadata.lat ?? metadata.latitude ?? metadata.location?.lat);
    const lng = Number(metadata.lng ?? metadata.longitude ?? metadata.location?.lng);
    return {
      id: entry.id,
      at: iso(entry.at),
      type: entry.kind || entry.type || 'event',
      title: entry.title || '',
      summary: entry.summary || '',
      sessionId: entry.sessionId || '',
      waypointId: entry.poiId || entry.waypointId || '',
      lat: Number.isFinite(lat) ? lat : '',
      lng: Number.isFinite(lng) ? lng : '',
      source: entry.source || 'wander',
      confidence: Number.isFinite(Number(metadata.confidence)) ? Number(metadata.confidence) : '',
      rawRef: metadata.rawRef || '',
      createdAt: iso(entry.at),
      updatedAt: iso(metadata.updatedAt || entry.at),
      deletedAt: deletedAt ? iso(deletedAt) : '',
      deviceId,
    };
  }

  function pointCount(session) {
    return (session?.segments || []).reduce((sum, segment) => sum + (segment?.type === 'movement' && Array.isArray(segment.points) ? segment.points.length : 0), 0);
  }

  function sessionMethods(session) {
    return Array.from(new Set((session?.segments || []).filter((segment) => segment?.type === 'movement').map((segment) => segment.method).filter(Boolean)));
  }

  function sessionRow(session, deletedAt = null) {
    if (!session?.id) return null;
    const methods = sessionMethods(session);
    const gpx = gpxState[session.id] || null;
    const metadata = {
      closeReason: session.closeReason || null,
      movingDurationMs: Number(session.movingDurationMs || 0),
      stationaryDurationMs: Number(session.stationaryDurationMs || 0),
      segmentCount: (session.segments || []).filter((segment) => segment?.type === 'movement').length,
      stayCount: Array.isArray(session.stays) ? session.stays.length : 0,
      gpx,
    };
    return {
      id: session.id,
      name: session.name || '',
      status: session.status || (session.endedAt ? 'closed' : 'active'),
      startedAt: iso(session.startedAt),
      endedAt: session.endedAt ? iso(session.endedAt) : '',
      distanceM: Number(session.distanceM || 0),
      activity: methods.length === 1 ? methods[0] : methods.length > 1 ? 'mixed' : '',
      method: methods.join(','),
      pointCount: pointCount(session),
      createdAt: iso(session.createdAt || session.startedAt),
      updatedAt: iso(session.updatedAt || Date.now()),
      deletedAt: deletedAt ? iso(deletedAt) : '',
      deviceId,
      metadataJson: JSON.stringify(metadata),
    };
  }

  function settingsRows() {
    return SETTINGS_KEYS.map((key) => {
      let value = null;
      try { value = localStorage.getItem(key); } catch {}
      return {
        key,
        valueJson: value == null ? 'null' : JSON.stringify(value),
        updatedAt: new Date().toISOString(),
        deviceId,
      };
    });
  }

  function hudRows(rows = window.WanderContextHUD?.exportRows?.() || []) {
    return (rows || []).map((row) => ({
      fieldId: row.fieldId,
      enabled: row.enabled === true,
      orientation: row.orientation,
      x: Number(row.x) || 0,
      y: Number(row.y) || 0,
      width: Number(row.width) || 0,
      height: Number(row.height) || 0,
      order: Number(row.order) || 0,
      configJson: row.configJson || '{}',
      updatedAt: row.updatedAt || new Date().toISOString(),
      deviceId,
    }));
  }

  function iso(value) {
    const numeric = Number(value);
    const date = Number.isFinite(numeric) && numeric > 0 ? new Date(numeric) : new Date(value || Date.now());
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
  }

  function safeFilename(value, fallback = 'session') {
    const part = String(value || fallback)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72);
    return part || fallback;
  }

  function buildSessionGpx(session) {
    const segments = (session?.segments || []).filter((segment) => segment?.type === 'movement' && Array.isArray(segment.points) && segment.points.length);
    if (!session?.id || !segments.length) return null;
    const content = window.WanderTracks?.buildGpx?.({
      name: session.name || 'Sesión Wander',
      description: `${segments.length} tramos · ${Math.round(Number(session.distanceM || 0))} m · RAW`,
      type: 'wander-session-raw',
      segments,
    });
    if (!content) return null;
    const stamp = new Date(Number(session.startedAt) || Date.now()).toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
    return {
      filename: `Wander_${stamp}_${safeFilename(session.name || session.id)}.gpx`,
      content,
    };
  }

  function sessionById(id) {
    const snapshot = lastSessionSnapshot || window.WanderSessionEngine?.snapshot?.();
    if (snapshot?.active?.id === id) return snapshot.active;
    return snapshot?.sessions?.find?.((session) => session.id === id) || null;
  }

  function queueGpx(session) {
    if (!session?.id || session.status !== 'closed' || gpxState[session.id]?.fileId) return false;
    return enqueue({
      action: 'upload-gpx',
      sessionId: session.id,
      dedupeKey: `gpx:${session.id}`,
    });
  }

  function onWaypointEvent(event) {
    const poi = event.detail?.poi;
    if (poi?.id) waypointCache.set(poi.id, clone(poi));
    if (event.type === 'wander:personal-poi-removed') {
      const previous = waypointCache.get(event.detail?.id) || { id: event.detail?.id };
      enqueueRows(config.tables.waypoints, [waypointRow(previous, Date.now())], `waypoint:${previous.id}`);
      waypointCache.delete(previous.id);
      return;
    }
    if (poi?.id) enqueueRows(config.tables.waypoints, [waypointRow(poi)], `waypoint:${poi.id}`);
  }

  function onTravelLogChange(event) {
    const detail = event.detail || {};
    if (detail.entry?.id) enqueueRows(config.tables.bitacora, [bitacoraRow(detail.entry)], `bitacora:${detail.entry.id}`);
  }

  function onSessionsChanged(event) {
    const snapshot = event.detail || window.WanderSessionEngine?.snapshot?.();
    if (!snapshot) return;
    lastSessionSnapshot = clone(snapshot);
    const closed = Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
    if (closed.length) {
      const latest = closed[closed.length - 1];
      enqueueRows(config.tables.sessions, [sessionRow(latest)], `session:${latest.id}`);
      queueGpx(latest);
    }
    if (snapshot.active && Date.now() - lastActiveSessionSyncAt >= ACTIVE_SESSION_SYNC_MS) {
      lastActiveSessionSyncAt = Date.now();
      enqueueRows(config.tables.sessions, [sessionRow(snapshot.active)], `session:${snapshot.active.id}:active`);
    }
  }

  function syncSettings() {
    enqueueRows(config.tables.settings, settingsRows(), 'settings');
  }

  function initialSync() {
    const pois = window.WanderPersonalPOIs?.list?.() || [];
    waypointCache = new Map(pois.filter((poi) => poi?.id).map((poi) => [poi.id, clone(poi)]));
    enqueueRows(config.tables.waypoints, pois.map((poi) => waypointRow(poi)), 'waypoints-bootstrap');

    const entries = window.WanderTravelLog?.listEntries?.() || [];
    enqueueRows(config.tables.bitacora, entries.map((entry) => bitacoraRow(entry)), 'bitacora-bootstrap');

    const snapshot = window.WanderSessionEngine?.snapshot?.() || null;
    if (snapshot) {
      lastSessionSnapshot = clone(snapshot);
      const sessions = [...(snapshot.sessions || [])];
      if (snapshot.active) sessions.push(snapshot.active);
      enqueueRows(config.tables.sessions, sessions.map((session) => sessionRow(session)), 'sessions-bootstrap');
      (snapshot.sessions || []).forEach(queueGpx);
    }

    syncSettings();
    enqueueRows(config.tables.hud, hudRows(), 'hud-bootstrap');
    try { localStorage.setItem(BOOTSTRAP_KEY, new Date().toISOString()); } catch {}
    scheduleFlush(1000);
  }

  function installListeners() {
    ['wander:personal-poi-created', 'wander:personal-poi-updated', 'wander:personal-poi-moved', 'wander:personal-poi-removed']
      .forEach((type) => window.addEventListener(type, onWaypointEvent));
    window.addEventListener('wander:travel-log-change', onTravelLogChange);
    window.addEventListener('wander:sessions-changed', onSessionsChanged);
    window.addEventListener('wander:hud-layout-change', (event) => {
      enqueueRows(config.tables.hud, hudRows(event.detail?.rows), `hud:${event.detail?.orientation || 'all'}`);
    });
    window.addEventListener('wander:context-hud-ready', (event) => {
      enqueueRows(config.tables.hud, hudRows(event.detail?.rows), 'hud-ready');
    });
    window.addEventListener('wander:recording-profile-changed', syncSettings);
    window.addEventListener('wander:coordinate-format-change', syncSettings);
    window.addEventListener('wander:track-smoothing-changed', syncSettings);
    window.addEventListener('online', () => scheduleFlush(300));
    window.addEventListener('focus', () => scheduleFlush(1200));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        syncSettings();
        scheduleFlush(1200);
      }
    });
  }

  function start() {
    installListeners();
    publishStatus({ status: navigator.onLine === false ? 'offline' : queue.length ? 'waiting' : 'idle' });
    setTimeout(initialSync, 800);
    setInterval(() => {
      syncSettings();
      scheduleFlush(1000);
    }, 5 * 60 * 1000);
  }

  window.WanderPersistence = Object.freeze({
    config,
    deviceId,
    enqueue,
    enqueueRows,
    flush,
    syncNow() {
      initialSync();
      return flush();
    },
    getQueue: () => clone(queue),
    getGpxState: () => clone(gpxState),
    buildSessionGpx,
    waypointRow,
    bitacoraRow,
    sessionRow,
    settingsRows,
    hudRows,
  });

  if (window.WanderLogicReady) start();
  else window.addEventListener('wander:logic-ready', start, { once: true });
  // The deferred loader dispatches logic-ready, but keep a non-blocking fallback
  // so persistence never depends on a secondary UI module completing correctly.
  setTimeout(() => {
    if (!window.WanderPersistenceStarted) {
      window.WanderPersistenceStarted = true;
      start();
    }
  }, 5000);
})();
