(() => {
  const body = window.WanderBody;
  if (!body) return;

  let watchId = null;

  function mapError(error) {
    if (!error) return 'unavailable';
    if (error.code === 1) return 'denied';
    if (error.code === 2) return 'unavailable';
    if (error.code === 3) return 'timeout';
    return 'unavailable';
  }

  function onPosition(position) {
    const coords = position.coords;
    body.setRealLocation({
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      altitude: coords.altitude,
      heading: coords.heading,
      speedMps: coords.speed,
      updatedAt: position.timestamp || Date.now(),
      source: 'gps',
    });
  }

  function onError(error) {
    body.setRealLocationStatus(mapError(error), 'geolocation');
  }

  function start() {
    if (!('geolocation' in navigator) || watchId != null) {
      if (!('geolocation' in navigator)) body.setRealLocationStatus('unsupported', 'geolocation');
      return false;
    }

    body.setRealLocationStatus('pending', 'geolocation');
    watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    });
    return true;
  }

  function stop() {
    if (watchId == null || !('geolocation' in navigator)) return;
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  async function inspectPermission() {
    if (!navigator.permissions?.query) return;
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      if (permission.state === 'denied') body.setRealLocationStatus('denied', 'permissions');
      permission.addEventListener?.('change', () => {
        if (permission.state === 'denied') body.setRealLocationStatus('denied', 'permissions');
        else if (watchId == null) start();
      });
    } catch {}
  }

  window.WanderLocation = {
    start,
    stop,
    isWatching: () => watchId != null,
  };

  inspectPermission();
  start();
})();