(() => {
  const context = window.WanderContext;
  if (!context) return;

  const providers = window.WanderProviders || (window.WanderProviders = {});
  let watchId = null;
  const samples = [];
  let stableMode = 'unknown';
  let candidateMode = 'unknown';
  let candidateSince = 0;

  function mapError(error) {
    if (!error) return 'unavailable';
    if (error.code === 1) return 'denied';
    if (error.code === 2) return 'unavailable';
    if (error.code === 3) return 'timeout';
    return 'unavailable';
  }

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function radians(value) {
    return value * Math.PI / 180;
  }

  function distanceMeters(a, b) {
    const radius = 6371008.8;
    const dLat = radians(b.lat - a.lat);
    const dLng = radians(b.lng - a.lng);
    const lat1 = radians(a.lat);
    const lat2 = radians(b.lat);
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.asin(Math.min(1, Math.sqrt(value)));
  }

  function addSample(position) {
    const coords = position.coords;
    const sample = {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: finite(coords.accuracy) ?? 999,
      speedMps: finite(coords.speed),
      at: position.timestamp || Date.now(),
    };
    samples.push(sample);
    const cutoff = sample.at - 60000;
    while (samples.length > 2 && samples[0].at < cutoff) samples.shift();
    return sample;
  }

  function estimatedSpeedKmh() {
    const recent = samples.filter((sample) => sample.accuracy <= 80);
    if (!recent.length) return null;
    if (recent.length < 2) return 0;

    const first = recent[0];
    const last = recent[recent.length - 1];
    const seconds = Math.max(1, (last.at - first.at) / 1000);
    const distance = distanceMeters(first, last);
    const accuracyNoise = Math.min(70, Math.max(8, first.accuracy, last.accuracy));
    const stationaryRadius = Math.max(10, accuracyNoise * 1.35);

    // GPS drift inside the accuracy envelope is not real movement.
    if (distance <= stationaryRadius) return 0;

    const displacementSpeed = Math.max(0, distance - accuracyNoise) / seconds * 3.6;
    const gpsSpeeds = recent
      .map((sample) => sample.speedMps)
      .filter((speed) => speed !== null && speed >= 0 && speed < 100)
      .map((speed) => speed * 3.6)
      .sort((a, b) => a - b);
    const medianGpsSpeed = gpsSpeeds.length ? gpsSpeeds[Math.floor(gpsSpeeds.length / 2)] : 0;

    // A single noisy speed reading cannot declare movement without net displacement.
    return Math.max(displacementSpeed, medianGpsSpeed >= 2 ? medianGpsSpeed : 0);
  }

  function rawMode(speedKmh) {
    if (speedKmh === null) return 'unknown';
    if (speedKmh < 1.8) return 'stationary';
    if (speedKmh < 7.5) return 'walking';
    if (speedKmh < 22) return 'cycling';
    return 'car';
  }

  function publishMobility(now = Date.now()) {
    const speedKmh = estimatedSpeedKmh();
    const next = rawMode(speedKmh);

    if (next !== candidateMode) {
      candidateMode = next;
      candidateSince = now;
    }

    // Returning to stationary should be quick; declaring movement must be sustained.
    const requiredMs = next === 'stationary' ? 6000 : next === 'car' ? 12000 : 18000;
    if (next !== stableMode && now - candidateSince >= requiredMs) stableMode = next;

    const confidence = stableMode === 'unknown' ? 0.25 : stableMode === 'stationary' ? 0.95 : 0.82;
    context.set('mobility.provider.mode', stableMode, {
      source: 'gps-motion-provider', kind: 'derived', ttlMs: 45000, confidence,
    });
    context.set('mobility.provider.confidence', confidence, {
      source: 'gps-motion-provider', kind: 'derived', ttlMs: 45000, confidence: 1,
    });
    context.set('mobility.provider.speedKmh', stableMode === 'stationary' ? 0 : speedKmh, {
      source: 'gps-motion-provider', kind: 'derived', ttlMs: 45000, confidence,
    });
  }

  function onPosition(position) {
    const coords = position.coords;
    addSample(position);
    context.setRealLocation({
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      altitude: coords.altitude,
      heading: coords.heading,
      speedMps: coords.speed,
      updatedAt: position.timestamp || Date.now(),
      source: 'gps',
      confidence: 1,
    });
    publishMobility(position.timestamp || Date.now());
  }

  function onError(error) {
    context.setRealLocationStatus(mapError(error), { source: 'geolocation' });
  }

  function start() {
    if (!('geolocation' in navigator) || watchId != null) {
      if (!('geolocation' in navigator)) context.setRealLocationStatus('unsupported', { source: 'geolocation' });
      return false;
    }

    context.setRealLocationStatus('pending', { source: 'geolocation' });
    watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 2000,
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
      if (permission.state === 'denied') context.setRealLocationStatus('denied', { source: 'permissions' });
      permission.addEventListener?.('change', () => {
        if (permission.state === 'denied') context.setRealLocationStatus('denied', { source: 'permissions' });
        else if (watchId == null) start();
      });
    } catch {}
  }

  providers.location = {
    start,
    stop,
    isWatching: () => watchId != null,
    getMobilitySamples: () => samples.map((sample) => ({ ...sample })),
  };

  inspectPermission();
  start();
})();