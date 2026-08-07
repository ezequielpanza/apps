(() => {
  const context = window.WanderContext;
  const map = window.WanderMapCore?.map;
  const L = window.L;
  if (!context || !map || !L || window.WanderDirectionIndicator) return;

  const STORAGE_KEY = 'wander.direction.indicator.v1';
  const STOPPED_MAX_KMH = 0.8;
  const COMPASS_MAX_AGE_MS = 2500;
  const GPS_MAX_AGE_MS = 15000;
  const SENSOR_RETRY_MS = 5000;
  const HEALTHCHECK_INTERVAL_MS = 1000;
  const DEFAULT_CONFIG = Object.freeze({ enabled: true, magneticEnabled: true, thresholdKmh: 5 });

  let config = loadConfig();
  let compass = null;
  let gps = null;
  let previousPoint = null;
  let marker = null;
  let state = Object.freeze({ source: 'none', heading: null, confidence: 'unavailable', speedKmh: null });
  let smoothedHeading = null;
  let directionListener = null;
  let directionErrorListener = null;
  let listenersInstalling = false;
  let sensorCommand = Promise.resolve();
  let lastSensorRetryAt = 0;
  let healthTimer = null;

  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeHeading(value) {
    const number = finite(value);
    return number === null ? null : ((number % 360) + 360) % 360;
  }

  function normalizeConfig(value = {}) {
    const threshold = finite(value.thresholdKmh);
    return {
      enabled: value.enabled !== false,
      magneticEnabled: value.magneticEnabled !== false,
      thresholdKmh: threshold === null ? DEFAULT_CONFIG.thresholdKmh : Math.max(0, Math.min(50, Math.round(threshold * 2) / 2)),
    };
  }

  function loadConfig() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return normalizeConfig(stored || DEFAULT_CONFIG);
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  function saveConfig() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch {}
  }

  function writeContext(key, value, confidence = 1) {
    context.set(key, value, { source: 'direction-indicator', kind: 'derived', ttlMs: Infinity, confidence });
  }

  function publishConfig() {
    writeContext('direction.indicator.enabled', config.enabled);
    writeContext('direction.magnetic.enabled', config.magneticEnabled);
    writeContext('direction.thresholdKmh', config.thresholdKmh);
  }

  function effectiveLocation() {
    return context.getEffectiveLocation?.() || null;
  }

  function simulatorActive(location = effectiveLocation()) {
    return location?.source === 'simulator' || context.value('location.override.enabled', false) === true;
  }

  function effectiveSpeedKmh(location = effectiveLocation()) {
    const directMps = finite(location?.speedMps);
    if (directMps !== null) return Math.max(0, directMps * 3.6);
    const motionSpeed = finite(context.value('motion.speedKmh'));
    if (motionSpeed !== null) return Math.max(0, motionSpeed);
    const providerSpeed = finite(context.value('mobility.provider.speedKmh'));
    return providerSpeed === null ? null : Math.max(0, providerSpeed);
  }

  function distanceMeters(a, b) {
    const radians = (degrees) => degrees * Math.PI / 180;
    const radius = 6371008.8;
    const dLat = radians(b.lat - a.lat);
    const dLng = radians(b.lng - a.lng);
    const lat1 = radians(a.lat);
    const lat2 = radians(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function bearingDegrees(a, b) {
    const radians = (degrees) => degrees * Math.PI / 180;
    const degrees = (value) => value * 180 / Math.PI;
    const lat1 = radians(a.lat);
    const lat2 = radians(b.lat);
    const dLng = radians(b.lng - a.lng);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return normalizeHeading(degrees(Math.atan2(y, x)));
  }

  function updateGpsState() {
    const location = effectiveLocation();
    const lat = finite(location?.lat);
    const lng = finite(location?.lng);
    if (lat === null || lng === null) {
      gps = null;
      return;
    }

    const timestamp = Date.parse(location.updatedAt || '') || Date.now();
    let speedKmh = effectiveSpeedKmh(location);
    let heading = normalizeHeading(location.heading);
    let derived = false;
    const point = { lat, lng, timestamp };

    if (previousPoint && timestamp > previousPoint.timestamp) {
      const distanceM = distanceMeters(previousPoint, point);
      const elapsedSec = (timestamp - previousPoint.timestamp) / 1000;
      if (speedKmh === null && elapsedSec > 0) speedKmh = distanceM / elapsedSec * 3.6;
      if (heading === null && distanceM >= 2 && elapsedSec <= 120) {
        heading = bearingDegrees(previousPoint, point);
        derived = heading !== null;
      }
    }
    previousPoint = point;

    const accuracy = finite(location.accuracy);
    let confidence = 'medium';
    if (simulatorActive(location)) confidence = 'high';
    else if (speedKmh !== null && speedKmh >= 5 && (accuracy === null || accuracy <= 25)) confidence = 'high';
    else if (speedKmh !== null && speedKmh < 1.5) confidence = 'low';

    gps = {
      heading,
      speedKmh,
      timestamp,
      confidence: heading === null ? 'unavailable' : confidence,
      derived,
      simulated: simulatorActive(location),
    };
  }

  function plugin() {
    return window.Capacitor?.Plugins?.WanderDirection || null;
  }

  function sensorShouldRun() {
    return config.enabled && config.magneticEnabled && typeof plugin()?.setSensorEnabled === 'function';
  }

  function syncNativeSensor() {
    const nativePlugin = plugin();
    if (typeof nativePlugin?.setSensorEnabled !== 'function') return Promise.resolve(null);
    const enabled = sensorShouldRun();
    sensorCommand = sensorCommand
      .catch(() => null)
      .then(() => nativePlugin.setSensorEnabled({ enabled }))
      .then((result) => {
        writeContext('direction.magnetic.available', result?.available === true, result?.available === true ? 1 : 0.4);
        writeContext('direction.magnetic.running', result?.enabled === true || result?.running === true, 1);
        return result;
      })
      .catch(() => {
        writeContext('direction.magnetic.available', false, 0.4);
        writeContext('direction.magnetic.running', false, 0.4);
        return null;
      });
    return sensorCommand;
  }

  function compassFresh(now = Date.now()) {
    return Boolean(compass && compass.heading !== null && now - compass.timestamp <= COMPASS_MAX_AGE_MS && compass.confidence !== 'unreliable');
  }

  function gpsFresh(now = Date.now()) {
    return Boolean(gps && gps.heading !== null && now - gps.timestamp <= GPS_MAX_AGE_MS);
  }

  function selectDirection(now = Date.now()) {
    const location = effectiveLocation();
    const speedKmh = effectiveSpeedKmh(location) ?? gps?.speedKmh ?? null;
    const safeSpeed = Number.isFinite(speedKmh) ? speedKmh : null;
    if (!config.enabled) return { source: 'none', heading: null, confidence: 'disabled', speedKmh: safeSpeed };

    const cutoff = config.thresholdKmh === 0 ? STOPPED_MAX_KMH : config.thresholdKmh;
    const belowThreshold = safeSpeed === null || safeSpeed <= cutoff;

    if (belowThreshold) {
      if (config.magneticEnabled && compassFresh(now)) {
        return { source: 'compass', heading: compass.heading, confidence: compass.confidence, speedKmh: safeSpeed };
      }
      // When magnetic mode is disabled there is intentionally no stationary
      // arrow. GPS course becomes authoritative only once speed exceeds the
      // configured threshold.
      if (!config.magneticEnabled) {
        return { source: 'none', heading: null, confidence: 'unavailable', speedKmh: safeSpeed };
      }
      if (gpsFresh(now)) {
        return { source: 'gps', heading: gps.heading, confidence: gps.confidence, speedKmh: safeSpeed };
      }
      return { source: 'none', heading: null, confidence: 'unavailable', speedKmh: safeSpeed };
    }

    const directHeading = normalizeHeading(location?.heading);
    if (simulatorActive(location) && directHeading !== null) {
      return { source: 'gps', heading: directHeading, confidence: 'high', speedKmh: safeSpeed };
    }
    if (gpsFresh(now)) {
      return { source: 'gps', heading: gps.heading, confidence: gps.confidence, speedKmh: safeSpeed };
    }
    return { source: 'none', heading: null, confidence: 'unavailable', speedKmh: safeSpeed };
  }

  function smoothHeading(nextHeading, source) {
    const normalized = normalizeHeading(nextHeading);
    if (normalized === null) {
      smoothedHeading = null;
      return null;
    }
    if (smoothedHeading === null || state.source !== source) {
      smoothedHeading = normalized;
      return smoothedHeading;
    }
    const delta = ((normalized - smoothedHeading + 540) % 360) - 180;
    smoothedHeading = normalizeHeading(smoothedHeading + delta * (source === 'compass' ? 0.22 : 0.48));
    return smoothedHeading;
  }

  function directionIcon() {
    return L.divIcon({
      className: 'wander-direction-marker',
      html: '<div class="wander-direction-arrow" aria-hidden="true"><svg viewBox="0 0 36 36"><path d="M18 2 30 28 18 22 6 28Z"></path></svg></div>',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  }

  function effectiveLatLng() {
    const location = effectiveLocation();
    const lat = finite(location?.lat);
    const lng = finite(location?.lng);
    return lat === null || lng === null ? null : L.latLng(lat, lng);
  }

  function removeMarker() {
    if (!marker) return;
    map.removeLayer(marker);
    marker = null;
  }

  function renderMarker(nextState) {
    const point = effectiveLatLng();
    if (!point || nextState.heading === null || nextState.source === 'none') {
      removeMarker();
      return;
    }
    if (!marker) {
      marker = L.marker(point, {
        icon: directionIcon(),
        interactive: false,
        keyboard: false,
        zIndexOffset: 950,
      }).addTo(map);
    } else {
      marker.setLatLng(point);
    }
    const element = marker.getElement?.();
    const arrow = element?.querySelector?.('.wander-direction-arrow');
    if (arrow) arrow.style.transform = `rotate(${nextState.heading}deg)`;
    if (element) {
      element.dataset.directionSource = nextState.source;
      element.dataset.directionConfidence = nextState.confidence;
    }
  }

  function publishState(nextState) {
    state = Object.freeze(nextState);
    const confidenceValue = nextState.confidence === 'high' ? 1 : nextState.confidence === 'medium' ? 0.82 : nextState.confidence === 'low' ? 0.58 : 0.35;
    writeContext('direction.source', nextState.source, confidenceValue);
    writeContext('direction.heading', nextState.heading, confidenceValue);
    writeContext('direction.confidence', nextState.confidence, confidenceValue);
    writeContext('direction.speedKmh', nextState.speedKmh, confidenceValue);
    writeContext('direction.updatedAt', new Date().toISOString(), confidenceValue);
    window.dispatchEvent(new CustomEvent('wander:direction-change', { detail: state }));
  }

  function evaluate(now = Date.now()) {
    const selected = selectDirection(now);
    const nextState = { ...selected, heading: smoothHeading(selected.heading, selected.source) };
    renderMarker(nextState);
    publishState(nextState);
    return state;
  }

  async function installNativeListeners() {
    if (listenersInstalling || directionListener || directionErrorListener) return;
    const nativePlugin = plugin();
    if (typeof nativePlugin?.addListener !== 'function') return;
    listenersInstalling = true;
    try {
      directionListener = await nativePlugin.addListener('direction', (event) => {
        const heading = normalizeHeading(event?.heading);
        if (heading === null) return;
        compass = {
          heading,
          confidence: String(event?.confidence || 'low'),
          timestamp: Number(event?.timestamp) || Date.now(),
        };
        lastSensorRetryAt = compass.timestamp;
        writeContext('direction.compass.heading', heading, compass.confidence === 'high' ? 1 : 0.7);
        writeContext('direction.compass.confidence', compass.confidence, compass.confidence === 'high' ? 1 : 0.7);
        evaluate();
      });
      directionErrorListener = await nativePlugin.addListener('directionError', () => {
        compass = null;
        writeContext('direction.magnetic.available', false, 0.4);
        evaluate();
      });
      const status = await nativePlugin.getStatus?.().catch?.(() => null);
      if (status) writeContext('direction.magnetic.available', status.available === true, status.available === true ? 1 : 0.4);
      await syncNativeSensor();
    } catch {
      directionListener = null;
      directionErrorListener = null;
    } finally {
      listenersInstalling = false;
    }
  }

  function retryStaleSensor(now = Date.now()) {
    if (!sensorShouldRun() || compassFresh(now) || now - lastSensorRetryAt < SENSOR_RETRY_MS) return;
    lastSensorRetryAt = now;
    syncNativeSensor();
  }

  function healthcheck() {
    const now = Date.now();
    if (!directionListener && !listenersInstalling) installNativeListeners();
    retryStaleSensor(now);
    updateGpsState();
    evaluate(now);
  }

  function setConfig(patch = {}) {
    config = normalizeConfig({ ...config, ...patch });
    saveConfig();
    publishConfig();
    lastSensorRetryAt = 0;
    syncNativeSensor();
    updateGpsState();
    evaluate();
    window.dispatchEvent(new CustomEvent('wander:direction-settings-changed', { detail: { ...config } }));
    return { ...config };
  }

  function resumeSensor() {
    lastSensorRetryAt = 0;
    installNativeListeners();
    syncNativeSensor();
    updateGpsState();
    evaluate();
  }

  context.subscribe((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.') || key === 'motion.speedKmh' || key === 'mobility.provider.speedKmh') {
      updateGpsState();
      evaluate();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resumeSensor();
  });
  document.addEventListener('resume', resumeSensor);
  window.addEventListener('pageshow', resumeSensor);
  window.addEventListener('focus', resumeSensor);

  window.WanderDirectionIndicator = Object.freeze({
    getConfig: () => ({ ...config }),
    setConfig,
    getState: () => ({ ...state }),
    evaluate,
    selectDirection,
    syncNativeSensor,
    destroy() {
      directionListener?.remove?.();
      directionErrorListener?.remove?.();
      directionListener = null;
      directionErrorListener = null;
      if (healthTimer) clearInterval(healthTimer);
      healthTimer = null;
      removeMarker();
      plugin()?.setSensorEnabled?.({ enabled: false }).catch(() => {});
    },
  });

  publishConfig();
  updateGpsState();
  installNativeListeners();
  syncNativeSensor();
  healthTimer = setInterval(healthcheck, HEALTHCHECK_INTERVAL_MS);
  evaluate();
})();