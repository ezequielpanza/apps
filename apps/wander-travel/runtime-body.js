(() => {
  const listeners = new Set();
  const state = {
    location: {
      real: { status: 'pending' },
      override: { enabled: false },
    },
  };

  const now = () => Date.now();
  const finite = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  function validCoordinate(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function notify(channel) {
    const snapshot = getSnapshot();
    listeners.forEach((listener) => {
      try { listener(channel, snapshot); } catch {}
    });
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function normalizeLocation(payload = {}, source) {
    const lat = finite(payload.lat);
    const lng = finite(payload.lng);
    if (!validCoordinate(lat, lng)) return null;

    const result = {
      status: 'available',
      lat: Number(lat.toFixed(7)),
      lng: Number(lng.toFixed(7)),
      source,
      updatedAt: payload.updatedAt || now(),
    };

    ['accuracy', 'altitude', 'heading', 'speedMps'].forEach((field) => {
      const numeric = finite(payload[field]);
      if (numeric !== null) result[field] = numeric;
    });

    return result;
  }

  function setRealLocation(payload = {}) {
    const location = normalizeLocation(payload, payload.source || 'gps');
    if (!location) return false;
    state.location.real = location;
    notify('location.real');
    return true;
  }

  function setRealLocationStatus(status, source = 'geolocation') {
    state.location.real = { status, source, updatedAt: now() };
    notify('location.real');
  }

  function setLocationOverride(payload = {}) {
    const location = normalizeLocation(payload, 'simulator');
    if (!location) return false;
    state.location.override = { ...location, enabled: true };
    notify('location.override');
    return true;
  }

  function clearLocationOverride() {
    state.location.override = { enabled: false, source: 'simulator', updatedAt: now() };
    notify('location.override');
  }

  function getSnapshot() {
    return clone(state);
  }

  function getRealLocation() {
    return clone(state.location.real);
  }

  function getLocationOverride() {
    return clone(state.location.override);
  }

  window.WanderBody = {
    subscribe,
    getSnapshot,
    getRealLocation,
    getLocationOverride,
    setRealLocation,
    setRealLocationStatus,
    setLocationOverride,
    clearLocationOverride,
  };
})();