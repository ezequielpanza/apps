(() => {
  const capacitor = window.Capacitor;
  const plugin = capacitor?.Plugins?.WanderLocation;
  if (!capacitor?.isNativePlatform?.() || !plugin) return;

  const RECORDING_KEY = 'wander.recording.profile.v1';
  const PRESETS = Object.freeze({
    precise: Object.freeze({ intervalSec: 2, distanceM: 2 }),
    balanced: Object.freeze({ intervalSec: 5, distanceM: 5 }),
    vehicle: Object.freeze({ intervalSec: 3, distanceM: 10 }),
    saver: Object.freeze({ intervalSec: 15, distanceM: 20 }),
  });
  let watching = false;
  let listenerHandle = null;
  let errorListenerHandle = null;
  let activeOptions = null;
  let activeOnError = null;

  function clampInteger(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.round(number)));
  }

  function storedRecordingConfig() {
    try {
      const stored = JSON.parse(localStorage.getItem(RECORDING_KEY) || 'null');
      const profileId = typeof stored?.profileId === 'string' ? stored.profileId : 'balanced';
      if (profileId === 'manual') {
        return {
          profileId,
          intervalSec: clampInteger(stored?.manualIntervalSec, 2, 60, 5),
          distanceM: clampInteger(stored?.manualDistanceM, 1, 100, 5),
        };
      }
      const preset = PRESETS[profileId] || PRESETS.balanced;
      return { profileId: PRESETS[profileId] ? profileId : 'balanced', ...preset };
    } catch {
      return { profileId: 'balanced', ...PRESETS.balanced };
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
      timestamp: location.timestamp || Date.now(),
    };
  }

  function applyTrackingConfig(config = storedRecordingConfig()) {
    const options = activeOptions || {};
    return plugin.start({
      minimumIntervalMs: clampInteger(config?.intervalSec, 2, 60, 5) * 1000,
      minimumDistanceM: clampInteger(config?.distanceM, 1, 100, 5),
      highAccuracy: options?.enableHighAccuracy !== false,
    }).catch((error) => {
      activeOnError?.(error?.code === 'PERMISSION_DENIED' ? 'denied' : 'unavailable');
      throw error;
    });
  }

  window.WanderNativeLocationSource = {
    id: 'android-background-location',
    capabilities: {
      background: true,
      stopsWhenClosed: true,
      configurableSampling: true,
    },

    isSupported: () => true,

    start({ onPosition, onError, options }) {
      if (watching) return false;
      watching = true;
      activeOptions = options || {};
      activeOnError = onError;

      Promise.resolve(plugin.addListener('location', (location) => {
        onPosition(positionFromNative(location));
      })).then((handle) => { listenerHandle = handle; });

      Promise.resolve(plugin.addListener('locationError', (event) => {
        onError(event?.status || 'unavailable');
      })).then((handle) => { errorListenerHandle = handle; });

      applyTrackingConfig().catch(() => { watching = false; });
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
      activeOnError = null;
      plugin.stop().catch(() => {});
    },

    isWatching: () => watching,
  };

  window.addEventListener('wander:recording-profile-changed', (event) => {
    if (!watching) return;
    applyTrackingConfig(event.detail?.config || storedRecordingConfig()).catch(() => {});
  });
})();
