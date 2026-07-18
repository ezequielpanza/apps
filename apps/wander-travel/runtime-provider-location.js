(() => {
  const context = window.WanderContext;
  const locationSources = window.WanderLocationSources;
  if (!context || !locationSources) return;

  const providers = window.WanderProviders || (window.WanderProviders = {});
  const CONTEXT_WATCHDOG_INTERVAL_MS = 2000;
  const CONTEXT_WATCHDOG_LIMIT_MS = 30000;
  let activeSource = null;
  const samples = [];
  let stableMode = 'unknown';
  let candidateMode = 'unknown';
  let candidateSince = 0;
  let contextWatchdogTimer = null;
  let contextWatchdogStartedAt = 0;

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

    if (distance <= stationaryRadius) return 0;

    const displacementSpeed = Math.max(0, distance - accuracyNoise) / seconds * 3.6;
    const gpsSpeeds = recent
      .map((sample) => sample.speedMps)
      .filter((speed) => speed !== null && speed >= 0 && speed < 100)
      .map((speed) => speed * 3.6)
      .sort((a, b) => a - b);
    const medianGpsSpeed = gpsSpeeds.length ? gpsSpeeds[Math.floor(gpsSpeeds.length / 2)] : 0;

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

  function clearContextWatchdog() {
    if (contextWatchdogTimer) clearTimeout(contextWatchdogTimer);
    contextWatchdogTimer = null;
    contextWatchdogStartedAt = 0;
  }

  function contextStillPending() {
    const motion = String(context.value('motion.status') || 'pending').toLowerCase();
    const status = String(context.value('context.status') || '').toLowerCase();
    return motion === 'pending' || status === 'preparando contexto';
  }

  function scheduleContextWatchdog() {
    if (contextWatchdogTimer || !samples.length || !contextStillPending()) return;
    if (!contextWatchdogStartedAt) contextWatchdogStartedAt = Date.now();
    contextWatchdogTimer = setTimeout(() => {
      contextWatchdogTimer = null;
      publishMobility(Date.now());
      window.WanderEngine?.run?.('location-context-watchdog');
      const elapsed = Date.now() - contextWatchdogStartedAt;
      if (contextStillPending() && elapsed < CONTEXT_WATCHDOG_LIMIT_MS) scheduleContextWatchdog();
      else clearContextWatchdog();
    }, CONTEXT_WATCHDOG_INTERVAL_MS);
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
    scheduleContextWatchdog();
  }

  function onError(status) {
    clearContextWatchdog();
    context.setRealLocationStatus(status || 'unavailable', { source: activeSource?.id || 'location-source' });
  }

  function start() {
    const source = activeSource || locationSources.resolve();
    if (!source || source.isSupported?.() === false || source.isWatching?.()) {
      if (!source || source.isSupported?.() === false) {
        context.setRealLocationStatus('unsupported', { source: source?.id || 'location-source' });
      }
      return false;
    }

    activeSource = source;
    context.setRealLocationStatus('pending', { source: source.id || 'location-source' });
    return source.start({
      onPosition,
      onError,
      options: {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000,
      },
    });
  }

  function stop() {
    clearContextWatchdog();
    activeSource?.stop();
  }

  async function inspectPermission() {
    const source = activeSource || locationSources.resolve();
    await source?.inspectPermission?.((state) => {
      if (state === 'denied') context.setRealLocationStatus('denied', { source: 'permissions' });
      else if (!source.isWatching?.()) start();
    });
  }

  providers.location = {
    start,
    stop,
    isWatching: () => Boolean(activeSource?.isWatching?.()),
    getSourceInfo: () => activeSource ? {
      id: activeSource.id || 'location-source',
      capabilities: { ...(activeSource.capabilities || {}) },
    } : null,
    getMobilitySamples: () => samples.map((sample) => ({ ...sample })),
  };

  inspectPermission();
  start();
})();
