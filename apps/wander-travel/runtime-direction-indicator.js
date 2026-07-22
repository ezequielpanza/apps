(() => {
  const context = window.WanderContext;
  const map = window.WanderMapCore?.map;
  if (!context || !map || !window.L) return;

  const STORAGE_KEY = 'wander.direction.indicator.v1';
  const STOPPED_MAX_KMH = 0.8;
  const COMPASS_MAX_AGE_MS = 2500;
  const GPS_MAX_AGE_MS = 15000;
  const DEFAULT_CONFIG = Object.freeze({
    enabled: true,
    magneticEnabled: true,
    thresholdKmh: 0,
  });

  let config = loadConfig();
  let compass = null;
  let gps = null;
  let previousPoint = null;
  let state = Object.freeze({ source: 'none', heading: null, confidence: 'unavailable', speedKmh: null });
  let smoothedHeading = null;
  let directionMarker = null;
  let directionListener = null;
  let directionErrorListener = null;
  let sensorCommand = Promise.resolve();

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeHeading(value) {
    const number = finite(value);
    if (number === null) return null;
    return ((number % 360) + 360) % 360;
  }

  function clampThreshold(value) {
    const number = finite(value);
    if (number === null) return 0;
    return Math.max(0, Math.min(50, Math.round(number * 2) / 2));
  }

  function normalizeConfig(value = {}) {
    return {
      enabled: value.enabled !== false,
      magneticEnabled: value.magneticEnabled !== false,
      thresholdKmh: clampThreshold(value.thresholdKmh),
    };
  }

  function loadConfig() {
    try {
      return normalizeConfig(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || DEFAULT_CONFIG);
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  function saveConfig() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch {}
  }

  function writeContext(key, value, confidence = 1) {
    context.set(key, value, {
      source: 'direction-indicator',
      kind: 'derived',
      ttlMs: Infinity,
      confidence,
    });
  }

  function publishConfig() {
    writeContext('direction.indicator.enabled', config.enabled);
    writeContext('direction.magnetic.enabled', config.magneticEnabled);
    writeContext('direction.thresholdKmh', config.thresholdKmh);
  }

  function distanceMeters(a, b) {
    const radians = (degrees) => degrees * Math.PI / 180;
    const radius = 6371008.8;
    const dLat = radians(b.lat - a.lat);
    const dLng = radians(b.lng - a.lng);
    const lat1 = radians(a.lat);
    const lat2 = radians(b.lat);
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.asin(Math.min(1, Math.sqrt(value)));
  }

  function bearingDegrees(a, b) {
    const radians = (degrees) => degrees * Math.PI / 180;
    const degrees = (radiansValue) => radiansValue * 180 / Math.PI;
    const lat1 = radians(a.lat);
    const lat2 = radians(b.lat);
    const dLng = radians(b.lng - a.lng);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return normalizeHeading(degrees(Math.atan2(y, x)));
  }

  function updateGpsState() {
    const location = context.getEffectiveLocation?.();
    if (!location) return;
    const lat = finite(location.lat);
    const lng = finite(location.lng);
    if (lat === null || lng === null) return;

    const timestamp = Date.parse(location.updatedAt || '') || Date.now();
    let speedKmh = finite(location.speedMps);
    speedKmh = speedKmh === null ? null : Math.max(0, speedKmh * 3.6);
    let heading = normalizeHeading(location.heading);
    let derived = false;

    const point = { lat, lng, timestamp };
    if (previousPoint && timestamp > previousPoint.timestamp) {
      const distanceM = distanceMeters(previousPoint, point);
      const elapsedSec = (timestamp - previousPoint.timestamp) / 1000;
      const derivedSpeedKmh = elapsedSec > 0 ? distanceM / elapsedSec * 3.6 : null;
      if (speedKmh === null && derivedSpeedKmh !== null && Number.isFinite(derivedSpeedKmh)) speedKmh = derivedSpeedKmh;
      if (heading === null && distanceM >= 2 && elapsedSec <= 120) {
        heading = bearingDegrees(previousPoint, point);
        derived = heading !== null;
      }
    }
    previousPoint = point;

    if (heading !== null) {
      const accuracy = finite(location.accuracy);
      let confidence = 'medium';
      if (speedKmh !== null && speedKmh >= 5 && (accuracy === null || accuracy <= 25)) confidence = 'high';
      else if (speedKmh !== null && speedKmh < 1.5) confidence = 'low';
      gps = { heading, speedKmh, timestamp, confidence, derived };
    } else if (gps) {
      gps = { ...gps, speedKmh, timestamp };
    } else {
      gps = { heading: null, speedKmh, timestamp, confidence: 'unavailable', derived: false };
    }
  }

  function plugin() {
    return window.Capacitor?.Plugins?.WanderDirection || null;
  }

  function sensorShouldRun() {
    return config.enabled && config.magneticEnabled && document.visibilityState !== 'hidden' && typeof plugin()?.setSensorEnabled === 'function';
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

  function compassCutoffKmh() {
    return config.thresholdKmh === 0 ? STOPPED_MAX_KMH : config.thresholdKmh;
  }

  function compassFresh(now = Date.now()) {
    return compass && compass.heading !== null && now - compass.timestamp <= COMPASS_MAX_AGE_MS && compass.confidence !== 'unreliable';
  }

  function gpsFresh(now = Date.now()) {
    return gps && gps.heading !== null && now - gps.timestamp <= GPS_MAX_AGE_MS;
  }

  function selectDirection(now = Date.now()) {
    const speedKmh = gps?.speedKmh ?? finite(context.value('location.effective.speedMps')) * 3.6;
    if (!config.enabled) return { source: 'none', heading: null, confidence: 'disabled', speedKmh: Number.isFinite(speedKmh) ? speedKmh : null };

    const cutoff = compassCutoffKmh();
    const belowThreshold = !Number.isFinite(speedKmh) || speedKmh <= cutoff;
    const moving = Number.isFinite(speedKmh) && speedKmh > STOPPED_MAX_KMH;

    if (config.magneticEnabled && belowThreshold && compassFresh(now)) {
      return { source: 'compass', heading: compass.heading, confidence: compass.confidence, speedKmh: Number.isFinite(speedKmh) ? speedKmh : null };
    }

    if (moving && gpsFresh(now)) {
      return { source: 'gps', heading: gps.heading, confidence: gps.confidence, speedKmh };
    }

    if (config.magneticEnabled && compassFresh(now)) {
      return { source: 'compass', heading: compass.heading, confidence: compass.confidence, speedKmh: Number.isFinite(speedKmh) ? speedKmh : null };
    }

    return { source: 'none', heading: null, confidence: 'unavailable', speedKmh: Number.isFinite(speedKmh) ? speedKmh : null };
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
    const alpha = source === 'compass' ? 0.22 : 0.48;
    smoothedHeading = normalizeHeading(smoothedHeading + delta * alpha);
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
    const location = context.getEffectiveLocation?.();
    const lat = finite(location?.lat);
    const lng = finite(location?.lng);
    return lat === null || lng === null ? null : L.latLng(lat, lng);
  }

  function removeMarker() {
    if (!directionMarker) return;
    map.removeLayer(directionMarker);
    directionMarker = null;
  }

  function renderMarker(nextState) {
    const point = effectiveLatLng();
    if (!point || nextState.heading === null || nextState.source === 'none') {
      removeMarker();
      return;
    }
    if (!directionMarker) {
      directionMarker = L.marker(point, {
        icon: directionIcon(),
        interactive: false,
        keyboard: false,
        zIndexOffset: 950,
      }).addTo(map);
    } else {
      directionMarker.setLatLng(point);
    }
    const element = directionMarker.getElement();
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

  function evaluate() {
    const selected = selectDirection();
    const heading = smoothHeading(selected.heading, selected.source);
    const nextState = { ...selected, heading };
    renderMarker(nextState);
    publishState(nextState);
    return state;
  }

  function setConfig(patch = {}) {
    config = normalizeConfig({ ...config, ...patch });
    saveConfig();
    publishConfig();
    syncNativeSensor();
    evaluate();
    window.dispatchEvent(new CustomEvent('wander:direction-settings-changed', { detail: { ...config } }));
    return { ...config };
  }

  function installNativeListeners() {
    const nativePlugin = plugin();
    if (typeof nativePlugin?.addListener !== 'function') return;
    Promise.resolve(nativePlugin.addListener('direction', (event) => {
      const heading = normalizeHeading(event?.heading);
      if (heading === null) return;
      compass = {
        heading,
        confidence: String(event?.confidence || 'low'),
        timestamp: Number(event?.timestamp) || Date.now(),
      };
      writeContext('direction.compass.heading', heading, compass.confidence === 'high' ? 1 : 0.7);
      writeContext('direction.compass.confidence', compass.confidence, compass.confidence === 'high' ? 1 : 0.7);
      evaluate();
    })).then((handle) => { directionListener = handle; }).catch(() => {});

    Promise.resolve(nativePlugin.addListener('directionError', () => {
      compass = null;
      writeContext('direction.magnetic.available', false, 0.4);
      evaluate();
    })).then((handle) => { directionErrorListener = handle; }).catch(() => {});

    nativePlugin.getStatus?.().then((status) => {
      writeContext('direction.magnetic.available', status?.available === true, status?.available === true ? 1 : 0.4);
      syncNativeSensor();
    }).catch(() => syncNativeSensor());
  }

  context.subscribe((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) {
      updateGpsState();
      evaluate();
    }
  });

  document.addEventListener('visibilitychange', () => {
    syncNativeSensor();
    if (document.visibilityState === 'visible') evaluate();
  });

  window.addEventListener('pageshow', () => {
    syncNativeSensor();
    evaluate();
  });

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
      removeMarker();
      plugin()?.setSensorEnabled?.({ enabled: false }).catch(() => {});
    },
  });

  publishConfig();
  updateGpsState();
  installNativeListeners();
  evaluate();
})();
