(() => {
  const context = window.WanderContext;
  const locationSources = window.WanderLocationSources;
  if (!context || !locationSources) return;

  const providers = window.WanderProviders || (window.WanderProviders = {});
  const samples = [];
  const MAX_SAMPLE_AGE_MS = 2 * 60 * 1000;
  let activeSource = null;
  let acceptedSample = null;

  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
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
    const value = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.asin(Math.min(1, Math.sqrt(value)));
  }

  function normalizedProvider(position) {
    const provider = String(position?.provider || '').trim().toLowerCase();
    if (['gps', 'network', 'fused', 'passive'].includes(provider)) return provider;
    return null;
  }

  function normalizedSample(position) {
    const coords = position?.coords || {};
    const lat = finite(coords.latitude);
    const lng = finite(coords.longitude);
    if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return {
      lat,
      lng,
      accuracy: finite(coords.accuracy),
      altitude: finite(coords.altitude),
      speedMps: finite(coords.speed),
      heading: finite(coords.heading),
      at: Number(position.timestamp) || Date.now(),
      provider: normalizedProvider(position),
      replayed: position?.replayed === true,
    };
  }

  function publishValidation(status, details = {}) {
    const metadata = {
      source: 'gps-immediate-capture', kind: 'derived', ttlMs: 15 * 60 * 1000, confidence: 1,
    };
    context.set('location.validation.status', status, metadata);
    context.set('location.validation.rejectedJumpCount', 0, metadata);
    context.set('location.validation.details', {
      ...details,
      stabilizationRequired: false,
      evaluatedAt: new Date().toISOString(),
    }, metadata);
  }

  function validateSample(sample) {
    if (!sample) return { accepted: false, reason: 'invalid' };
    if (Date.now() - sample.at > MAX_SAMPLE_AGE_MS && !sample.replayed) {
      return { accepted: false, reason: 'stale' };
    }
    if (!acceptedSample) return { accepted: true, reason: 'first-fix' };
    const elapsedMs = Math.max(1, sample.at - acceptedSample.at);
    const distanceM = distanceMeters(acceptedSample, sample);
    const impliedSpeedKmh = distanceM / elapsedMs * 3600;
    return {
      accepted: true,
      reason: 'raw-capture',
      distanceM,
      elapsedMs,
      impliedSpeedKmh,
      reportedSpeedKmh: sample.speedMps === null ? null : Math.max(0, sample.speedMps * 3.6),
      suspicious: impliedSpeedKmh > 300,
    };
  }

  function addSample(sample) {
    samples.push(sample);
    const cutoff = sample.at - 60000;
    while (samples.length > 2 && samples[0].at < cutoff) samples.shift();
  }

  function estimatedSpeedKmh() {
    if (!samples.length) return null;
    const last = samples[samples.length - 1];
    if (last.speedMps !== null && last.speedMps >= 0 && last.speedMps < 120) {
      return last.speedMps * 3.6;
    }
    if (samples.length < 2) return null;
    const previous = samples[samples.length - 2];
    const seconds = Math.max(0.25, (last.at - previous.at) / 1000);
    return distanceMeters(previous, last) / seconds * 3.6;
  }

  function rawMode(speedKmh) {
    if (speedKmh === null) return 'unknown';
    if (speedKmh < 1.8) return 'stationary';
    if (speedKmh < 7.5) return 'walking';
    if (speedKmh < 22) return 'cycling';
    return 'car';
  }

  function publishMobility() {
    const speedKmh = estimatedSpeedKmh();
    const mode = rawMode(speedKmh);
    const confidence = speedKmh === null ? 0.35 : 0.82;
    const metadata = {
      source: 'gps-motion-provider', kind: 'derived', ttlMs: 45000, confidence,
    };
    context.set('mobility.provider.mode', mode, metadata);
    context.set('mobility.provider.confidence', confidence, { ...metadata, confidence: 1 });
    context.set('mobility.provider.speedKmh', speedKmh, metadata);
    context.set('motion.speedKmh', speedKmh, metadata);
    context.set('motion.status', mode === 'stationary' ? 'stopped' : mode === 'unknown' ? 'pending' : 'moving', metadata);
  }

  function onPosition(position) {
    const sample = normalizedSample(position);
    const validation = validateSample(sample);
    if (!validation.accepted) {
      publishValidation('rejected', validation);
      return false;
    }

    acceptedSample = sample;
    addSample(sample);
    publishValidation(validation.suspicious ? 'accepted-suspicious' : 'accepted', validation);

    const provider = sample.provider;
    const permissionPrecision = String(position?.permissionPrecision || '').trim().toLowerCase() || null;
    const source = provider === 'network' ? 'network' : provider === 'fused' ? 'fused' : 'gps';
    context.setRealLocation({
      lat: sample.lat,
      lng: sample.lng,
      accuracy: sample.accuracy,
      altitude: sample.altitude,
      heading: sample.heading,
      speedMps: sample.speedMps,
      provider,
      permissionPrecision,
      updatedAt: sample.at,
      source,
      confidence: permissionPrecision === 'approximate' ? 0.55 : provider === 'network' ? 0.7 : 1,
    });
    publishMobility();
    window.WanderRawLocationRecorder?.capture?.();
    window.WanderEngine?.run?.('gps-fix-immediate');
    window.dispatchEvent(new CustomEvent('wander:location-sample-accepted', {
      detail: { ...sample, validation },
    }));
    return true;
  }

  function onError(status) {
    context.setRealLocationStatus(status || 'unavailable', {
      source: activeSource?.id || 'location-source',
    });
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
        maximumAge: 0,
        timeout: 30000,
      },
    });
  }

  function stop() {
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
    getValidationState: () => ({
      acceptedSample: acceptedSample ? { ...acceptedSample } : null,
      pendingJump: null,
      rejectedJumpCount: 0,
      stabilizationRequired: false,
    }),
    validateSample,
  };

  inspectPermission();
  start();
})();
