(() => {
  const capacitor = window.Capacitor;
  if (!capacitor?.isNativePlatform?.()) return;

  const RECORDING_KEY = 'wander.recording.profile.v1';
  const SYNC_BATCH_SIZE = 100;
  const MAX_SYNC_BATCHES = 100;
  const REPLAY_YIELD_EVERY = 20;
  const PRESETS = Object.freeze({
    precise: Object.freeze({ intervalSec: 1, distanceM: 0 }),
    balanced: Object.freeze({ intervalSec: 5, distanceM: 5 }),
    vehicle: Object.freeze({ intervalSec: 3, distanceM: 10 }),
    saver: Object.freeze({ intervalSec: 15, distanceM: 20 }),
  });
  let watching = false;
  let listenerHandle = null;
  let errorListenerHandle = null;
  let activeOptions = null;
  let activeOnPosition = null;
  let activeOnError = null;
  let syncPromise = null;
  let deliveryChain = Promise.resolve();
  let pendingSyncScheduled = false;
  const deliveredJournalIds = new Set();

  function plugin() {
    return window.Capacitor?.Plugins?.WanderLocation || null;
  }

  function clampInteger(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.round(number)));
  }

  function storedRecordingConfig() {
    try {
      const stored = JSON.parse(localStorage.getItem(RECORDING_KEY) || 'null');
      const profileId = typeof stored?.profileId === 'string' ? stored.profileId : 'precise';
      if (profileId === 'manual') {
        return {
          profileId,
          intervalSec: clampInteger(stored?.manualIntervalSec, 1, 60, 1),
          distanceM: clampInteger(stored?.manualDistanceM, 0, 100, 0),
        };
      }
      const preset = PRESETS[profileId] || PRESETS.precise;
      return { profileId: PRESETS[profileId] ? profileId : 'precise', ...preset };
    } catch {
      return { profileId: 'precise', ...PRESETS.precise };
    }
  }

  function positionFromNative(location) {
    return {
      coords: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        altitude: location.altitude ?? null,
        heading: location.heading ?? null,
        speed: location.speed ?? null,
      },
      provider: location.provider || null,
      permissionPrecision: location.permissionPrecision || null,
      timestamp: location.timestamp || Date.now(),
      journalId: Number(location.journalId) || null,
      replayed: location.replayed === true,
    };
  }

  function publishBackgroundStatus(payload = {}) {
    const context = window.WanderContext;
    if (!context?.set) return;
    const metadata = { source: 'android-background-location', kind: 'observed', ttlMs: 10 * 60 * 1000, confidence: 1 };
    if (payload.watching !== undefined) context.set('location.background.watching', Boolean(payload.watching), metadata);
    if (payload.pendingCount !== undefined) context.set('location.background.pendingCount', Number(payload.pendingCount) || 0, metadata);
    if (payload.latestRecordedAt) context.set('location.background.latestRecordedAt', new Date(payload.latestRecordedAt).toISOString(), metadata);
    if (payload.syncedCount !== undefined) context.set('location.background.lastSyncedCount', Number(payload.syncedCount) || 0, metadata);
    if (payload.syncedAt) context.set('location.background.lastSyncedAt', new Date(payload.syncedAt).toISOString(), metadata);
  }

  function rememberJournalId(id) {
    if (!id) return;
    deliveredJournalIds.add(id);
    if (deliveredJournalIds.size <= 5000) return;
    const oldest = deliveredJournalIds.values().next().value;
    deliveredJournalIds.delete(oldest);
  }

  async function acknowledge(ids) {
    const valid = Array.from(new Set((Array.isArray(ids) ? ids : [])
      .map(Number)
      .filter((id) => Number.isFinite(id) && id > 0)));
    if (!valid.length || typeof plugin()?.acknowledgeLocations !== 'function') return null;
    const result = await plugin().acknowledgeLocations({ ids: valid });
    publishBackgroundStatus(result || {});
    return result;
  }

  function enqueueLocation(location, acknowledgeAfterDelivery = true) {
    const journalId = Number(location?.journalId) || null;
    deliveryChain = deliveryChain.then(async () => {
      if (!activeOnPosition) return false;
      if (!journalId || !deliveredJournalIds.has(journalId)) {
        activeOnPosition(positionFromNative(location));
        rememberJournalId(journalId);
      }
      if (acknowledgeAfterDelivery && journalId) await acknowledge([journalId]);
      return true;
    }).catch((error) => {
      activeOnError?.(error?.code === 'PERMISSION_DENIED' ? 'denied' : 'unavailable');
      return false;
    });
    return deliveryChain;
  }

  function yieldToUi() {
    return new Promise((resolve) => setTimeout(resolve, 16));
  }

  async function syncPending() {
    const nativePlugin = plugin();
    if (!watching || !activeOnPosition || typeof nativePlugin?.getPendingLocations !== 'function') return null;
    if (syncPromise) return syncPromise;

    syncPromise = (async () => {
      let syncedCount = 0;
      let finalStatus = null;
      for (let batch = 0; batch < MAX_SYNC_BATCHES; batch += 1) {
        const result = await nativePlugin.getPendingLocations({ limit: SYNC_BATCH_SIZE });
        finalStatus = result || finalStatus;
        const locations = Array.isArray(result?.locations) ? result.locations : [];
        publishBackgroundStatus(result || {});
        if (!locations.length) break;

        const ids = [];
        for (let index = 0; index < locations.length; index += 1) {
          const location = locations[index];
          const journalId = Number(location?.journalId) || null;
          await enqueueLocation({ ...location, replayed: true }, false);
          if (journalId) ids.push(journalId);
          syncedCount += 1;
          if ((index + 1) % REPLAY_YIELD_EVERY === 0) await yieldToUi();
        }
        await acknowledge(ids);
        await yieldToUi();
        if (locations.length < SYNC_BATCH_SIZE) break;
      }

      const syncedAt = Date.now();
      publishBackgroundStatus({
        ...(finalStatus || {}),
        syncedCount,
        syncedAt,
      });
      window.dispatchEvent(new CustomEvent('wander:background-location-synced', {
        detail: { syncedCount, syncedAt, pendingCount: Number(finalStatus?.pendingCount) || 0 },
      }));
      return { syncedCount, syncedAt, status: finalStatus };
    })().catch((error) => {
      activeOnError?.(error?.code === 'PERMISSION_DENIED' ? 'denied' : 'unavailable');
      return null;
    }).finally(() => {
      syncPromise = null;
    });

    return syncPromise;
  }

  function refreshBackgroundStatus() {
    const nativePlugin = plugin();
    if (typeof nativePlugin?.getBackgroundStatus !== 'function') return Promise.resolve(null);
    return nativePlugin.getBackgroundStatus().then((status) => {
      publishBackgroundStatus(status || {});
      return status;
    }).catch(() => null);
  }

  function applyTrackingConfig(config = storedRecordingConfig()) {
    const nativePlugin = plugin();
    if (typeof nativePlugin?.start !== 'function') return Promise.reject(Object.assign(new Error('Native location plugin unavailable'), { code: 'PLUGIN_UNAVAILABLE' }));
    const options = activeOptions || {};
    return nativePlugin.start({
      minimumIntervalMs: clampInteger(config?.intervalSec, 1, 60, 1) * 1000,
      minimumDistanceM: clampInteger(config?.distanceM, 0, 100, 0),
      highAccuracy: options?.enableHighAccuracy !== false,
    }).catch((error) => {
      activeOnError?.(error?.code === 'PERMISSION_DENIED' ? 'denied' : 'unavailable');
      throw error;
    });
  }

  function schedulePendingSync(delayMs = 1200) {
    if (pendingSyncScheduled || !watching) return;
    const run = () => {
      if (pendingSyncScheduled || !watching) return;
      pendingSyncScheduled = true;
      setTimeout(() => {
        pendingSyncScheduled = false;
        if (!watching) return;
        refreshBackgroundStatus().then(() => syncPending());
      }, Math.max(0, Number(delayMs) || 0));
    };

    // Unit-test/non-visual environments have no animation frame. Keep their
    // historical immediate replay behavior while Android waits for the map core.
    if (typeof requestAnimationFrame !== 'function') {
      run();
      return;
    }
    if (window.WanderCoreReady) run();
    else window.addEventListener('wander:core-ready', run, { once: true });
  }

  window.WanderNativeLocationSource = {
    id: 'android-background-location',
    capabilities: {
      background: true,
      stopsWhenClosed: true,
      configurableSampling: true,
      reportsProvider: true,
      reportsPermissionPrecision: true,
      nativeJournal: true,
      replaysMissedLocations: true,
    },

    isSupported: () => typeof plugin()?.start === 'function',

    start({ onPosition, onError, options }) {
      const nativePlugin = plugin();
      if (watching || typeof nativePlugin?.start !== 'function') return false;
      watching = true;
      activeOptions = options || {};
      activeOnPosition = onPosition;
      activeOnError = onError;

      Promise.resolve(nativePlugin.addListener('location', (location) => {
        enqueueLocation(location, true);
      })).then((handle) => { listenerHandle = handle; });

      Promise.resolve(nativePlugin.addListener('locationError', (event) => {
        onError(event?.status || 'unavailable');
      })).then((handle) => { errorListenerHandle = handle; });

      // Start live RAW capture immediately. Historical journal replay is a
      // background task and must never be part of the visual startup path.
      applyTrackingConfig()
        .then(() => refreshBackgroundStatus())
        .then(() => schedulePendingSync())
        .catch(() => { watching = false; });
      return true;
    },

    stop() {
      if (!watching) return;
      watching = false;
      listenerHandle?.remove?.();
      errorListenerHandle?.remove?.();
      listenerHandle = null;
      errorListenerHandle = null;
      activeOptions = null;
      activeOnPosition = null;
      activeOnError = null;
      plugin()?.stop?.().catch(() => {});
    },

    isWatching: () => watching,
    syncPending,
    refreshBackgroundStatus,
    schedulePendingSync,
  };

  window.addEventListener('wander:recording-profile-changed', (event) => {
    if (!watching) return;
    applyTrackingConfig(event.detail?.config || storedRecordingConfig()).catch(() => {});
  });

  const syncWhenVisible = () => {
    if (!watching || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
    schedulePendingSync(350);
  };
  document.addEventListener('visibilitychange', syncWhenVisible);
  document.addEventListener('resume', syncWhenVisible);
  window.addEventListener('pageshow', syncWhenVisible);
  window.addEventListener('focus', syncWhenVisible);
})();