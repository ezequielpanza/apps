(() => {
  const nativeSource = () => window.WanderNativeLocationSource;
  let browserWatchId = null;

  function mapBrowserError(error) {
    if (!error) return 'unavailable';
    if (error.code === 1) return 'denied';
    if (error.code === 2) return 'unavailable';
    if (error.code === 3) return 'timeout';
    return 'unavailable';
  }

  const browserSource = {
    id: 'browser-geolocation',
    capabilities: {
      background: false,
      stopsWhenClosed: true,
    },

    isSupported() {
      return 'geolocation' in navigator;
    },

    start({ onPosition, onError, options }) {
      if (!this.isSupported() || browserWatchId != null) return false;
      browserWatchId = navigator.geolocation.watchPosition(
        onPosition,
        (error) => onError(mapBrowserError(error)),
        options
      );
      return true;
    },

    stop() {
      if (browserWatchId == null || !this.isSupported()) return;
      navigator.geolocation.clearWatch(browserWatchId);
      browserWatchId = null;
    },

    isWatching() {
      return browserWatchId != null;
    },

    async inspectPermission(onChange) {
      if (!navigator.permissions?.query) return;
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        onChange(permission.state);
        permission.addEventListener?.('change', () => onChange(permission.state));
      } catch {}
    },
  };

  function validSource(source) {
    return source
      && typeof source.start === 'function'
      && typeof source.stop === 'function'
      && (typeof source.isSupported !== 'function' || source.isSupported());
  }

  function resolve() {
    const native = nativeSource();
    return validSource(native) ? native : browserSource;
  }

  window.WanderLocationSources = {
    resolve,
    browser: browserSource,
  };
})();
