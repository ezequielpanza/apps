(() => {
  if (window.WanderRawLocationRecorder) return;

  const context = window.WanderContext;
  if (!context?.getEffectiveLocation) return;

  const DB_NAME = 'wander-raw-recording';
  const DB_VERSION = 1;
  const STORE_NAME = 'location_samples';
  const FALLBACK_KEY = 'wander.raw.location.fallback.v1';
  const INTERVAL_MS = 1000;
  const FALLBACK_LIMIT = 5000;

  let databasePromise = null;
  let lastRecordedSecond = null;
  let timerId = null;
  let stopped = false;
  let writtenCount = 0;
  let errorCount = 0;

  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function validCoordinates(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng)
      && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  function localDayKey(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(new Error('IndexedDB no disponible'));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error || new Error('No se pudo abrir la base RAW'));
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(STORE_NAME)
          ? request.transaction.objectStore(STORE_NAME)
          : db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        if (!store.indexNames.contains('at')) store.createIndex('at', 'at', { unique: false });
        if (!store.indexNames.contains('day')) store.createIndex('day', 'day', { unique: false });
        if (!store.indexNames.contains('source')) store.createIndex('source', 'source', { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
    });
    return databasePromise;
  }

  async function persistSample(sample) {
    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('No se pudo guardar la muestra RAW'));
        transaction.objectStore(STORE_NAME).add(sample);
      });
      writtenCount += 1;
      return true;
    } catch {
      errorCount += 1;
      try {
        const current = JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]');
        const next = (Array.isArray(current) ? current : []).concat(sample).slice(-FALLBACK_LIMIT);
        localStorage.setItem(FALLBACK_KEY, JSON.stringify(next));
        writtenCount += 1;
        return true;
      } catch {
        return false;
      }
    }
  }

  function buildSample() {
    const location = context.getEffectiveLocation();
    if (!location) return null;
    const lat = finite(location.lat);
    const lng = finite(location.lng);
    if (!validCoordinates(lat, lng)) return null;

    const at = Date.now();
    const sourceUpdatedAt = Date.parse(location.updatedAt || '') || null;
    return {
      schemaVersion: 1,
      at,
      day: localDayKey(at),
      lat: Number(lat.toFixed(7)),
      lng: Number(lng.toFixed(7)),
      accuracy: finite(location.accuracy),
      altitude: finite(location.altitude),
      heading: finite(location.heading),
      speedMps: finite(location.speedMps),
      speedKmh: finite(context.value?.('motion.speedKmh')),
      provider: location.provider || null,
      permissionPrecision: location.permissionPrecision || null,
      source: location.source || 'unknown',
      sourceUpdatedAt,
      mobilityMode: context.value?.('mobility.methodId') || context.value?.('mobility.mode') || 'unknown',
      motionStatus: context.value?.('motion.status') || 'unknown',
      raw: true,
      interpretation: null,
      relevance: 'unclassified',
    };
  }

  async function capture() {
    if (stopped) return false;
    const second = Math.floor(Date.now() / INTERVAL_MS);
    if (second === lastRecordedSecond) return false;
    const sample = buildSample();
    if (!sample) return false;
    lastRecordedSecond = second;
    const stored = await persistSample(sample);
    if (stored) {
      context.set('sessions.rawRecordingStatus', 'recording', {
        source: 'raw-location-recorder', kind: 'observed', ttlMs: 5000, confidence: 1,
      });
      context.set('sessions.rawRecordingLastAt', new Date(sample.at).toISOString(), {
        source: 'raw-location-recorder', kind: 'observed', ttlMs: 5000, confidence: 1,
      });
    }
    return stored;
  }

  function start() {
    if (timerId) return;
    stopped = false;
    capture();
    timerId = setInterval(capture, INTERVAL_MS);
    navigator.storage?.persist?.().catch?.(() => {});
  }

  function stop() {
    stopped = true;
    if (timerId) clearInterval(timerId);
    timerId = null;
    context.set('sessions.rawRecordingStatus', 'paused', {
      source: 'raw-location-recorder', kind: 'observed', ttlMs: Infinity, confidence: 1,
    });
  }

  async function count() {
    try {
      const db = await openDatabase();
      return await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch {
      try {
        const fallback = JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]');
        return Array.isArray(fallback) ? fallback.length : 0;
      } catch { return 0; }
    }
  }

  window.WanderRawLocationRecorder = {
    start,
    stop,
    capture,
    count,
    status: () => ({ active: Boolean(timerId) && !stopped, writtenCount, errorCount, intervalMs: INTERVAL_MS }),
    database: Object.freeze({ name: DB_NAME, version: DB_VERSION, store: STORE_NAME }),
  };

  start();
})();
