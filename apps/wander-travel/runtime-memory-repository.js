(() => {
  if (window.WanderMemoryRepository) return;

  const DB_NAME = 'wander-memory';
  const DB_VERSION = 1;
  const LEGACY_STATE_KEY = 'wander.engine.state.v1';
  const IDENTITY_KEY = 'wander.identity.v1';
  const FALLBACK_INTERACTIONS_KEY = 'wander.memory.interactions.v1';
  const FALLBACK_SIGNALS_KEY = 'wander.memory.signals.v1';
  const listeners = new Set();
  let database = null;
  let storageMode = 'localStorage';
  let readyState = false;

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function randomId(prefix) {
    const value = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${value}`;
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function bootstrapState() {
    return clone(readJson(LEGACY_STATE_KEY, null));
  }

  function ensureIdentity() {
    const stored = readJson(IDENTITY_KEY, null);
    const identity = {
      userId: stored?.userId || randomId('user'),
      deviceId: stored?.deviceId || randomId('device'),
      kind: 'anonymous-local',
      createdAt: stored?.createdAt || new Date().toISOString(),
    };
    writeJson(IDENTITY_KEY, identity);
    return identity;
  }

  function openDatabase() {
    if (!('indexedDB' in globalThis)) return Promise.resolve(null);
    return new Promise((resolve) => {
      let request;
      try { request = indexedDB.open(DB_NAME, DB_VERSION); }
      catch { resolve(null); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('state')) db.createObjectStore('state', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('interactions')) {
          const store = db.createObjectStore('interactions', { keyPath: 'id' });
          store.createIndex('at', 'at');
          store.createIndex('kind', 'kind');
        }
        if (!db.objectStoreNames.contains('signals')) {
          const store = db.createObjectStore('signals', { keyPath: 'id' });
          store.createIndex('category', 'category');
          store.createIndex('at', 'at');
        }
        if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }

  function requestValue(request) {
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    });
  }

  function put(storeName, value) {
    if (!database) return Promise.resolve(false);
    return new Promise((resolve) => {
      try {
        const transaction = database.transaction(storeName, 'readwrite');
        transaction.objectStore(storeName).put(clone(value));
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(false);
        transaction.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  function notify(event) {
    listeners.forEach((listener) => {
      try { listener(clone(event)); } catch {}
    });
  }

  const identity = ensureIdentity();

  const ready = openDatabase().then(async (db) => {
    database = db;
    storageMode = db ? 'indexedDB' : 'localStorage';
    let storedState = null;
    if (database) {
      const transaction = database.transaction('state', 'readonly');
      const record = await requestValue(transaction.objectStore('state').get('engine-state'));
      storedState = record?.value || null;
      await put('metadata', { key: 'identity', value: identity, updatedAt: new Date().toISOString() });
      if (!storedState) {
        const legacy = bootstrapState();
        if (legacy) {
          storedState = legacy;
          await put('state', { id: 'engine-state', value: legacy, updatedAt: new Date().toISOString(), migratedFrom: LEGACY_STATE_KEY });
        }
      }
    } else {
      storedState = bootstrapState();
    }
    readyState = true;
    const detail = { storageMode, identity: clone(identity), state: clone(storedState) };
    window.dispatchEvent(new CustomEvent('wander:memory-ready', { detail }));
    notify({ type: 'ready', ...detail });
    return detail;
  });

  async function saveState(state) {
    const snapshot = clone(state);
    writeJson(LEGACY_STATE_KEY, snapshot);
    if (!database) return true;
    return put('state', { id: 'engine-state', value: snapshot, updatedAt: new Date().toISOString() });
  }

  function fallbackAppend(key, entry, limit = 250) {
    const items = readJson(key, []);
    items.push(clone(entry));
    while (items.length > limit) items.shift();
    writeJson(key, items);
  }

  async function recordInteraction(input = {}) {
    const source = clone(input) || {};
    const suppliedId = source.id || null;
    delete source.id;
    const entry = {
      ...source,
      id: randomId('interaction'),
      interactionId: source.interactionId || suppliedId || null,
      at: source.at || new Date().toISOString(),
      userId: identity.userId,
      deviceId: identity.deviceId,
    };
    fallbackAppend(FALLBACK_INTERACTIONS_KEY, entry, 300);
    if (database) await put('interactions', entry);
    notify({ type: 'interaction', entry });
    return clone(entry);
  }

  async function recordSignal(input = {}) {
    const source = clone(input) || {};
    const suppliedId = source.id || null;
    delete source.id;
    const signal = {
      ...source,
      id: randomId('signal'),
      signalId: source.signalId || suppliedId || null,
      at: source.at || new Date().toISOString(),
      userId: identity.userId,
      deviceId: identity.deviceId,
      confidence: Number.isFinite(Number(source.confidence)) ? Number(source.confidence) : 1,
    };
    fallbackAppend(FALLBACK_SIGNALS_KEY, signal, 300);
    if (database) await put('signals', signal);
    notify({ type: 'signal', signal });
    return clone(signal);
  }

  async function listStore(storeName, fallbackKey, limit = 40) {
    if (!database) return readJson(fallbackKey, []).slice(-limit).reverse();
    return new Promise((resolve) => {
      const items = [];
      try {
        const transaction = database.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const source = store.indexNames.contains('at') ? store.index('at') : store;
        const request = source.openCursor(null, 'prev');
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || items.length >= limit) {
            resolve(items);
            return;
          }
          items.push(clone(cursor.value));
          cursor.continue();
        };
        request.onerror = () => resolve(readJson(fallbackKey, []).slice(-limit).reverse());
      } catch {
        resolve(readJson(fallbackKey, []).slice(-limit).reverse());
      }
    });
  }

  window.WanderMemoryRepository = Object.freeze({
    ready,
    getBootstrapState: bootstrapState,
    getIdentity: () => clone(identity),
    getStatus: () => ({ ready: readyState, storageMode, databaseName: DB_NAME }),
    saveState,
    recordInteraction,
    recordSignal,
    listInteractions: (limit) => listStore('interactions', FALLBACK_INTERACTIONS_KEY, limit),
    listSignals: (limit) => listStore('signals', FALLBACK_SIGNALS_KEY, limit),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    constants: { DB_NAME, DB_VERSION, LEGACY_STATE_KEY, IDENTITY_KEY },
  });
})();