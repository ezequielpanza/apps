(() => {
  const capacitor = window.Capacitor;
  const plugin = capacitor?.Plugins?.WanderLocation;
  if (!capacitor?.isNativePlatform?.() || !plugin) return;

  let watching = false;
  let listenerHandle = null;
  let errorListenerHandle = null;

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

  window.WanderNativeLocationSource = {
    id: 'android-background-location',
    capabilities: {
      background: true,
      stopsWhenClosed: true,
    },

    isSupported: () => true,

    start({ onPosition, onError, options }) {
      if (watching) return false;
      watching = true;

      Promise.resolve(plugin.addListener('location', (location) => {
        onPosition(positionFromNative(location));
      })).then((handle) => { listenerHandle = handle; });

      Promise.resolve(plugin.addListener('locationError', (event) => {
        onError(event?.status || 'unavailable');
      })).then((handle) => { errorListenerHandle = handle; });

      plugin.start({
        minimumIntervalMs: 5000,
        minimumDistanceM: 5,
        highAccuracy: options?.enableHighAccuracy !== false,
      }).catch((error) => {
        watching = false;
        onError(error?.code === 'PERMISSION_DENIED' ? 'denied' : 'unavailable');
      });
      return true;
    },

    stop() {
      if (!watching) return;
      watching = false;
      listenerHandle?.remove?.();
      errorListenerHandle?.remove?.();
      listenerHandle = null;
      errorListenerHandle = null;
      plugin.stop().catch(() => {});
    },

    isWatching: () => watching,
  };
})();
