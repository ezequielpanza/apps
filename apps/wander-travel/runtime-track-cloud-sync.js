(() => {
  if (window.WanderTrackCloudSync) return;

  const DB_NAME = 'wander-track-history';
  const DB_VERSION = 1;
  const STORE = 'tracks';
  const SYNC_DELAY_MS = 2500;
  const PERIODIC_MS = 5 * 60 * 1000;
  const FETCH_BATCH = 30;
  const UPLOAD_BATCH = 20;
  let databasePromise = null;
  let started = false;
  let syncTimer = null;
  let periodicTimer = null;
  let activeRequest = null;
  let identity = null;
  let state = Object.freeze({ status: 'preparing', localCount: 0, remoteCount: 0, lastSyncAt: null, error: null });

  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

  function setState(patch = {}) {
    state = Object.freeze({ ...state, ...patch });
    const context = window.WanderContext;
    const metadata = { source: 'track-cloud-sync', kind: 'observed', ttlMs: Infinity, confidence: state.status === 'error' ? .4 : 1 };
    context?.set?.('cloudTracks.status', state.status, metadata);
    context?.set?.('cloudTracks.localCount', state.localCount, metadata);
    context?.set?.('cloudTracks.remoteCount', state.remoteCount, metadata);
    context?.set?.('cloudTracks.lastSyncAt', state.lastSyncAt, metadata);
    if (state.error) context?.set?.('cloudTracks.error', state.error, metadata);
    else context?.remove?.('cloudTracks.error');
    window.dispatchEvent(new CustomEvent('wander:track-cloud-sync', { detail: clone(state) }));
  }

  function openDb() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error || new Error('No se pudo abrir el historial de tracks.'));
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('startedAt', 'startedAt');
          store.createIndex('day', 'day');
          store.createIndex('status', 'status');
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
    return databasePromise;
  }

  async function allLocal() {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const request = db.transaction(STORE).objectStore(STORE).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch { return []; }
  }

  async function putLocal(track) {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(track);
    });
  }

  function localDay(at) {
    const d = new Date(Number(at || Date.now()));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function trackName(at) {
    const d = new Date(Number(at || Date.now()));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function point(raw) {
    if (Array.isArray(raw)) {
      return {
        lat: Number(raw[0]) / 1e7,
        lng: Number(raw[1]) / 1e7,
        at: Number(raw[2]) || null,
        accuracy: raw[3] == null ? null : Number(raw[3]),
        speedKmh: raw[4] == null ? null : Number(raw[4]),
        heading: raw[5] == null ? null : Number(raw[5]),
        altitude: raw[6] == null ? null : Number(raw[6]),
      };
    }
    const lat = Number(raw?.lat);
    const lng = Number(raw?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat: Number(lat.toFixed(7)),
      lng: Number(lng.toFixed(7)),
      at: Number(raw?.at) || null,
      accuracy: raw?.accuracy == null ? null : Number(raw.accuracy),
      speedKmh: raw?.speedKmh == null ? null : Number(raw.speedKmh),
      heading: raw?.heading == null ? null : Number(raw.heading),
      altitude: raw?.altitude == null ? null : Number(raw.altitude),
    };
  }

  function canonicalTrack(segment, session = {}) {
    const startedAt = Number(segment?.startedAt || Date.now());
    const endedAt = Number(segment?.endedAt || startedAt);
    const points = (segment?.points || []).map(point).filter(Boolean);
    return {
      schemaVersion: 1,
      id: String(segment?.id || `movement-${startedAt}`),
      name: String(segment?.name || trackName(startedAt)),
      day: localDay(startedAt),
      sessionId: session?.id || segment?.sessionId || null,
      startedAt,
      endedAt,
      durationMs: Math.max(0, endedAt - startedAt),
      distanceM: Math.max(0, Number(segment?.distanceM || 0)),
      activity: String(segment?.method || segment?.activity || 'unknown'),
      relevance: String(segment?.relevance || 'valid'),
      status: segment?.status === 'deleted' ? 'deleted' : 'closed',
      pointCount: points.length,
      points,
      source: String(segment?.source || 'session-engine'),
      updatedAt: Number(segment?.updatedAt || segment?.deletedAt || endedAt || startedAt),
      deletedAt: segment?.deletedAt ? Number(segment.deletedAt) : null,
    };
  }

  function versionOf(track) {
    return Number(track?.updatedAt || track?.deletedAt || track?.endedAt || track?.startedAt || 0);
  }

  function currentSessionTracks() {
    const engine = window.WanderSessionEngine;
    const snapshot = engine?.snapshot?.() || {};
    const sessions = [...(snapshot.sessions || [])];
    if (snapshot.active) sessions.push(snapshot.active);
    const rows = [];
    const seen = new Set();
    sessions.forEach((session) => (session?.segments || []).forEach((segment) => {
      if (segment?.type !== 'movement' || !segment?.endedAt || !segment?.id || seen.has(segment.id)) return;
      seen.add(segment.id);
      rows.push(canonicalTrack(segment, session));
    }));
    return rows;
  }

  async function mirrorLocalSessions() {
    const current = currentSessionTracks();
    const existing = new Map((await allLocal()).map((track) => [track.id, track]));
    for (const track of current) {
      const old = existing.get(track.id);
      if (!old || versionOf(track) > versionOf(old) || Number(track.pointCount || 0) > Number(old.pointCount || 0) || !old.name) {
        await putLocal({ ...old, ...track, cloudOrigin: old?.cloudOrigin || null });
      }
    }
    const rows = await allLocal();
    setState({ localCount: rows.filter((track) => track.status !== 'deleted').length });
    return rows;
  }

  function endpoint() {
    return window.WanderPlatform?.apiUrl?.('/api/track-sync') || '/api/track-sync';
  }

  async function waitForIdentity() {
    if (identity?.deviceKey) return identity;
    const plugin = window.Capacitor?.Plugins?.WanderCloudIdentity;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      if (typeof plugin?.getIdentity === 'function') {
        const result = await plugin.getIdentity();
        if (/^[a-f0-9]{64}$/.test(String(result?.deviceKey || ''))) {
          identity = { deviceKey: String(result.deviceKey), deviceLabel: String(result.deviceLabel || '').toUpperCase() };
          return identity;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error('La identidad de Wander no está disponible para sincronizar tracks.');
  }

  async function request(method, body = null) {
    const current = await waitForIdentity();
    const options = {
      method,
      headers: { accept: 'application/json', 'x-wander-device-key': current.deviceKey },
      cache: 'no-store',
    };
    if (body !== null) {
      options.headers['content-type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(endpoint(), options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true) throw new Error(payload?.error || `Track sync returned HTTP ${response.status}.`);
    return payload;
  }

  async function fetchRemoteTracks(ids) {
    const output = [];
    for (let index = 0; index < ids.length; index += FETCH_BATCH) {
      const batch = ids.slice(index, index + FETCH_BATCH);
      const result = await request('POST', { schemaVersion: 1, ids: batch });
      output.push(...(result.tracks || []));
    }
    return output;
  }

  async function uploadTracks(tracks) {
    let accepted = 0;
    for (let index = 0; index < tracks.length; index += UPLOAD_BATCH) {
      const batch = tracks.slice(index, index + UPLOAD_BATCH);
      const result = await request('PUT', { schemaVersion: 1, tracks: batch });
      accepted += Number(result.accepted || 0);
    }
    return accepted;
  }

  async function synchronize(options = {}) {
    if (activeRequest) return activeRequest;
    activeRequest = (async () => {
      try {
        setState({ status: 'preparing', error: null });
        let local = await mirrorLocalSessions();
        if (navigator.onLine === false) {
          setState({ status: 'offline', error: null });
          return { offline: true, localCount: local.length };
        }

        setState({ status: 'syncing', error: null });
        const manifestResult = await request('GET');
        const manifest = Array.isArray(manifestResult.tracks) ? manifestResult.tracks : [];
        const remoteById = new Map(manifest.map((item) => [item.id, item]));
        const localById = new Map(local.map((item) => [item.id, item]));

        const needRemote = manifest.filter((remote) => {
          const localTrack = localById.get(remote.id);
          if (!localTrack) return true;
          return versionOf(remote) > versionOf(localTrack)
            || Number(remote.pointCount || 0) > Number(localTrack.pointCount || 0)
            || !localTrack.name;
        }).map((item) => item.id);

        const remoteTracks = needRemote.length ? await fetchRemoteTracks(needRemote) : [];
        for (const remote of remoteTracks) {
          const localTrack = localById.get(remote.id);
          const merged = {
            ...(localTrack || {}),
            ...remote,
            name: remote.name || localTrack?.name || trackName(remote.startedAt),
            cloudOrigin: true,
            cloudSyncedAt: Date.now(),
          };
          await putLocal(merged);
          localById.set(merged.id, merged);
        }

        local = [...localById.values()];
        const toUpload = local.filter((track) => {
          if (!track?.id || track.status === 'active') return false;
          const remote = remoteById.get(track.id);
          if (!remote) return true;
          return versionOf(track) > versionOf(remote)
            || Number(track.pointCount || 0) > Number(remote.pointCount || 0)
            || (!remote.name && track.name);
        });
        const accepted = toUpload.length ? await uploadTracks(toUpload) : 0;
        const lastSyncAt = new Date().toISOString();
        setState({
          status: 'synced',
          localCount: local.filter((track) => track.status !== 'deleted').length,
          remoteCount: Math.max(manifest.length, local.length),
          lastSyncAt,
          error: null,
        });
        return { synced: true, imported: remoteTracks.length, uploaded: accepted };
      } catch (error) {
        setState({ status: navigator.onLine === false ? 'offline' : 'error', error: error?.message || String(error) });
        return { error };
      } finally {
        activeRequest = null;
      }
    })();
    return activeRequest;
  }

  function schedule() {
    if (!started) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      synchronize();
    }, SYNC_DELAY_MS);
  }

  function start() {
    if (started) return;
    started = true;
    window.addEventListener('wander:sessions-changed', schedule);
    window.addEventListener('wander:track-finalized', schedule);
    window.addEventListener('online', () => synchronize({ reason: 'online' }));
    document.addEventListener?.('visibilitychange', () => {
      if (document.visibilityState === 'visible') synchronize({ reason: 'foreground' });
    });
    periodicTimer = setInterval(() => synchronize({ reason: 'periodic' }), PERIODIC_MS);
    setTimeout(() => synchronize({ reason: 'startup' }), 1800);
  }

  window.WanderTrackCloudSync = Object.freeze({
    start,
    synchronize,
    listLocal: allLocal,
    mirrorLocalSessions,
    trackName,
    getState: () => clone(state),
    database: Object.freeze({ name: DB_NAME, version: DB_VERSION, store: STORE }),
  });

  start();
})();
