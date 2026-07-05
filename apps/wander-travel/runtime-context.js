(() => {
  const VERSION = 'v0.69.6';
  const listeners = new Set();
  const state = {};

  const DEFAULT_TTL = {
    'app.version': Infinity,
    'simulation.status': Infinity,
    'context.status': 300000,
    'context.activity': 300000,
    'time.now': 70000,
    'time.dayPeriod': 300000,
    'motion.status': 15000,
    'motion.mode': 15000,
    'motion.speedKmh': 15000,
    'motion.heading': 15000,
    'location.real.status': 30000,
    'location.real.lat': 30000,
    'location.real.lng': 30000,
    'location.real.accuracy': 30000,
    'location.real.altitude': 30000,
    'location.real.heading': 30000,
    'location.real.speedMps': 30000,
    'location.real.updatedAt': 30000,
    'location.real.source': Infinity,
    'location.override.enabled': Infinity,
    'location.override.lat': Infinity,
    'location.override.lng': Infinity,
    'location.override.updatedAt': Infinity,
    'location.override.source': Infinity,
    'location.effective.status': 30000,
    'location.effective.lat': 30000,
    'location.effective.lng': 30000,
    'location.effective.accuracy': 30000,
    'location.effective.altitude': 30000,
    'location.effective.heading': 30000,
    'location.effective.speedMps': 30000,
    'location.effective.updatedAt': 30000,
    'location.effective.source': Infinity,
    'environment.weatherStatus': 1800000,
    'place.city': 3600000,
    'place.zone': 1800000,
    'user.intent': 600000,
    'user.interests': Infinity,
  };

  const now = () => Date.now();
  const iso = (ts = now()) => new Date(ts).toISOString();
  const icon = (name) => '<svg class="section-icon" aria-hidden="true"><use href="wander-icons.svg#' + name + '"></use></svg>';

  function syncVisibleVersion() {
    document.title = 'Wander Travel ' + VERSION;
    const drawerVersion = document.querySelector('#drawer-version');
    if (drawerVersion) drawerVersion.textContent = VERSION;
  }

  function ttlFor(key, ttlMs) {
    if (ttlMs != null) return ttlMs;
    return Object.prototype.hasOwnProperty.call(DEFAULT_TTL, key) ? DEFAULT_TTL[key] : 300000;
  }

  function write(key, value, options = {}, shouldNotify = true) {
    const entry = {
      value,
      source: options.source || 'app',
      updatedAt: options.updatedAt || now(),
      ttlMs: ttlFor(key, options.ttlMs),
      confidence: typeof options.confidence === 'number' ? options.confidence : 1,
    };
    state[key] = entry;
    if (shouldNotify) notify(key, entry);
    return entry;
  }

  function set(key, value, options = {}) {
    return write(key, value, options, true);
  }

  function remove(key, shouldNotify = true) {
    if (!Object.prototype.hasOwnProperty.call(state, key)) return;
    delete state[key];
    if (shouldNotify) notify(key, null);
  }

  const get = (key) => state[key] || null;
  const value = (key, fallback = null) => state[key] ? state[key].value : fallback;
  const ageMs = (entry) => entry ? now() - entry.updatedAt : Infinity;

  function statusFor(entry) {
    if (!entry) return 'pending';
    if (entry.ttlMs === Infinity) return 'stable';
    return ageMs(entry) <= entry.ttlMs ? 'fresh' : 'stale';
  }

  function formatAge(entry) {
    if (!entry) return 'sin datos';
    const age = Math.max(0, Math.round(ageMs(entry) / 1000));
    if (age < 60) return 'hace ' + age + ' s';
    const minutes = Math.round(age / 60);
    if (minutes < 60) return 'hace ' + minutes + ' min';
    return 'hace ' + Math.round(minutes / 60) + ' h';
  }

  function snapshot() {
    const out = {};
    Object.keys(state).forEach((key) => {
      const entry = state[key];
      out[key] = {
        value: entry.value,
        source: entry.source,
        updatedAt: iso(entry.updatedAt),
        ttlMs: entry.ttlMs,
        confidence: entry.confidence,
        status: statusFor(entry),
      };
    });
    return out;
  }

  function notify(key, entry) {
    listeners.forEach((listener) => {
      try { listener(key, entry, snapshot()); } catch {}
    });
    render();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function dayPeriod(date = new Date()) {
    const hour = date.getHours();
    if (hour >= 6 && hour < 11) return 'mañana';
    if (hour >= 11 && hour < 15) return 'mediodía';
    if (hour >= 15 && hour < 20) return 'tarde';
    return 'noche';
  }

  function updateTime() {
    const date = new Date();
    set('time.now', date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), { source: 'clock', ttlMs: 70000 });
    set('time.dayPeriod', dayPeriod(date), { source: 'clock', ttlMs: 300000 });
  }

  function setContext({ status, activity, source = 'context', confidence = 1 }) {
    if (status != null) set('context.status', status, { source, ttlMs: 300000, confidence });
    if (activity != null) set('context.activity', activity, { source, ttlMs: 300000, confidence });
  }

  function setMotion({ status, mode, speedKmh, heading, source = 'motion' }) {
    if (status != null) set('motion.status', status, { source, ttlMs: 15000 });
    if (mode != null) set('motion.mode', mode, { source, ttlMs: 15000 });
    if (speedKmh != null) set('motion.speedKmh', Number(speedKmh), { source, ttlMs: 15000 });
    if (heading === null) remove('motion.heading');
    else if (heading != null) set('motion.heading', Number(heading), { source, ttlMs: 15000 });
  }

  function finiteNumber(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function validCoordinate(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  function copyLocationBranch(fromPrefix, toPrefix, sourceOverride = null) {
    const fields = ['status','lat','lng','accuracy','altitude','heading','speedMps','updatedAt'];
    fields.forEach((field) => {
      const sourceEntry = get(fromPrefix + '.' + field);
      const targetKey = toPrefix + '.' + field;
      if (!sourceEntry) {
        remove(targetKey, false);
        return;
      }
      write(targetKey, sourceEntry.value, {
        source: sourceOverride || sourceEntry.source,
        updatedAt: sourceEntry.updatedAt,
        ttlMs: sourceEntry.ttlMs,
        confidence: sourceEntry.confidence,
      }, false);
    });
  }

  function recomputeEffectiveLocation() {
    const overrideEnabled = value('location.override.enabled', false) === true;
    const overrideLat = finiteNumber(value('location.override.lat'));
    const overrideLng = finiteNumber(value('location.override.lng'));
    const realLat = finiteNumber(value('location.real.lat'));
    const realLng = finiteNumber(value('location.real.lng'));

    if (overrideEnabled && validCoordinate(overrideLat, overrideLng)) {
      copyLocationBranch('location.override', 'location.effective', 'simulator');
      write('location.effective.status', 'available', { source: 'simulator', ttlMs: Infinity, confidence: 1 }, false);
      write('location.effective.source', 'simulator', { source: 'simulator', ttlMs: Infinity, confidence: 1 }, false);
      notify('location.effective', get('location.effective.lat'));
      return true;
    }

    if (validCoordinate(realLat, realLng)) {
      copyLocationBranch('location.real', 'location.effective');
      write('location.effective.source', value('location.real.source', 'gps'), { source: 'location', ttlMs: Infinity, confidence: 1 }, false);
      notify('location.effective', get('location.effective.lat'));
      return true;
    }

    ['lat','lng','accuracy','altitude','heading','speedMps','updatedAt','source'].forEach((field) => remove('location.effective.' + field, false));
    write('location.effective.status', value('location.real.status', 'pending'), { source: 'location', ttlMs: 30000, confidence: 1 }, false);
    notify('location.effective', get('location.effective.status'));
    return false;
  }

  function setRealLocation(payload = {}) {
    const lat = finiteNumber(payload.lat);
    const lng = finiteNumber(payload.lng);
    if (!validCoordinate(lat, lng)) return false;

    const updatedAt = payload.updatedAt || now();
    const options = { source: payload.source || 'gps', ttlMs: 30000, confidence: payload.confidence ?? 1, updatedAt };
    write('location.real.status', 'available', options, false);
    write('location.real.lat', Number(lat.toFixed(7)), options, false);
    write('location.real.lng', Number(lng.toFixed(7)), options, false);
    write('location.real.source', payload.source || 'gps', { ...options, ttlMs: Infinity }, false);
    write('location.real.updatedAt', iso(updatedAt), options, false);

    ['accuracy','altitude','heading','speedMps'].forEach((field) => {
      const numeric = finiteNumber(payload[field]);
      if (numeric !== null) write('location.real.' + field, numeric, options, false);
      else remove('location.real.' + field, false);
    });

    notify('location.real', get('location.real.lat'));
    recomputeEffectiveLocation();
    return true;
  }

  function setRealLocationStatus(status, options = {}) {
    write('location.real.status', status, { source: options.source || 'geolocation', ttlMs: 30000, confidence: 1 }, false);
    if (status !== 'available') {
      ['lat','lng','accuracy','altitude','heading','speedMps','updatedAt'].forEach((field) => remove('location.real.' + field, false));
    }
    notify('location.real.status', get('location.real.status'));
    recomputeEffectiveLocation();
  }

  function setLocationOverride(payload = {}) {
    const lat = finiteNumber(payload.lat);
    const lng = finiteNumber(payload.lng);
    if (!validCoordinate(lat, lng)) return false;

    const updatedAt = payload.updatedAt || now();
    const options = { source: 'simulator', ttlMs: Infinity, confidence: 1, updatedAt };
    write('location.override.enabled', true, options, false);
    write('location.override.status', 'available', options, false);
    write('location.override.lat', Number(lat.toFixed(7)), options, false);
    write('location.override.lng', Number(lng.toFixed(7)), options, false);
    write('location.override.source', 'simulator', options, false);
    write('location.override.updatedAt', iso(updatedAt), options, false);

    ['accuracy','altitude','heading','speedMps'].forEach((field) => {
      const numeric = finiteNumber(payload[field]);
      if (numeric !== null) write('location.override.' + field, numeric, options, false);
      else remove('location.override.' + field, false);
    });

    notify('location.override', get('location.override.lat'));
    recomputeEffectiveLocation();
    return true;
  }

  function clearLocationOverride() {
    Object.keys(state).filter((key) => key.startsWith('location.override.')).forEach((key) => remove(key, false));
    write('location.override.enabled', false, { source: 'simulator', ttlMs: Infinity, confidence: 1 }, false);
    notify('location.override', get('location.override.enabled'));
    recomputeEffectiveLocation();
  }

  function getEffectiveLocation() {
    const lat = finiteNumber(value('location.effective.lat'));
    const lng = finiteNumber(value('location.effective.lng'));
    if (!validCoordinate(lat, lng)) return null;
    return {
      lat,
      lng,
      accuracy: value('location.effective.accuracy'),
      altitude: value('location.effective.altitude'),
      heading: value('location.effective.heading'),
      speedMps: value('location.effective.speedMps'),
      updatedAt: value('location.effective.updatedAt'),
      source: value('location.effective.source'),
    };
  }

  function readableValue(key, entry) {
    if (!entry) return 'Pendiente';
    if (key.endsWith('.accuracy')) return Number(entry.value).toFixed(0) + ' m';
    if (key.endsWith('.speedMps')) return (Number(entry.value) * 3.6).toFixed(1) + ' km/h';
    if (key.endsWith('.heading') || key === 'motion.heading') return Number.isFinite(Number(entry.value)) ? Math.round(Number(entry.value)) + '°' : '—';
    if (key === 'motion.speedKmh') return Number(entry.value || 0).toFixed(1) + ' km/h';
    if (key === 'user.interests' && Array.isArray(entry.value)) return entry.value.length ? entry.value.join(', ') : 'Pendiente';
    return entry.value == null || entry.value === '' ? 'Pendiente' : String(entry.value);
  }

  const HUMAN = [
    ['context.status', 'Estado actual', 'target'],
    ['context.activity', 'Actividad', 'route'],
    ['time.now', 'Hora', 'clock'],
    ['time.dayPeriod', 'Momento del día', 'day'],
    ['location.effective.status', 'Ubicación', 'pin'],
    ['location.effective.source', 'Fuente de ubicación', 'target'],
    ['location.effective.accuracy', 'Precisión', 'target'],
    ['motion.status', 'Movimiento físico', 'route'],
    ['motion.mode', 'Modo de movimiento', 'compass'],
    ['motion.speedKmh', 'Velocidad', 'speed'],
    ['motion.heading', 'Rumbo', 'heading'],
    ['place.city', 'Ciudad', 'city'],
    ['place.zone', 'Zona', 'zone'],
    ['user.intent', 'Intención', 'target'],
  ];

  const TECHNICAL = [
    'app.version','simulation.status','context.status','context.activity','time.now','time.dayPeriod',
    'location.real.status','location.real.lat','location.real.lng','location.real.accuracy','location.real.altitude','location.real.heading','location.real.speedMps','location.real.updatedAt','location.real.source',
    'location.override.enabled','location.override.lat','location.override.lng','location.override.heading','location.override.speedMps','location.override.updatedAt','location.override.source',
    'location.effective.status','location.effective.lat','location.effective.lng','location.effective.accuracy','location.effective.altitude','location.effective.heading','location.effective.speedMps','location.effective.updatedAt','location.effective.source',
    'motion.status','motion.mode','motion.speedKmh','motion.heading','environment.weatherStatus','place.city','place.zone','user.intent','user.interests',
  ];

  function renderHuman() {
    const list = document.querySelector('#context-list');
    if (!list) return;
    list.innerHTML = HUMAN.map(([key, label, iconName]) => {
      const entry = get(key);
      return '<div class="context-row"><div class="context-label">' + icon(iconName) + '<strong>' + label + '</strong></div><div><b>' + readableValue(key, entry) + '</b></div></div>';
    }).join('');
  }

  function renderTechnical() {
    const list = document.querySelector('#context-technical');
    if (!list) return;
    list.innerHTML = TECHNICAL.map((key) => {
      const entry = get(key);
      return '<div class="technical-row"><code>' + key + '</code><span>' + readableValue(key, entry) + ' · ' + statusFor(entry) + ' · ' + formatAge(entry) + '</span></div>';
    }).join('');
  }

  function render() {
    renderHuman();
    renderTechnical();
  }

  function init() {
    syncVisibleVersion();
    set('app.version', VERSION, { source: 'app', ttlMs: Infinity });
    set('simulation.status', 'inactive', { source: 'init', ttlMs: Infinity, confidence: 1 });
    setContext({ status: 'Preparando contexto', activity: 'pending', source: 'init', confidence: 1 });
    write('location.real.status', 'pending', { source: 'init', ttlMs: 30000, confidence: 1 }, false);
    write('location.override.enabled', false, { source: 'init', ttlMs: Infinity, confidence: 1 }, false);
    recomputeEffectiveLocation();
    setMotion({ status: 'pending', mode: 'unknown', source: 'init' });
    set('environment.weatherStatus', 'Pendiente', { source: 'placeholder', ttlMs: 1800000, confidence: 0.2 });
    set('place.city', 'Pendiente', { source: 'placeholder', ttlMs: 3600000, confidence: 0.2 });
    set('place.zone', 'Pendiente', { source: 'placeholder', ttlMs: 1800000, confidence: 0.2 });
    set('user.intent', 'Descubrir', { source: 'default', ttlMs: 600000, confidence: 0.5 });
    set('user.interests', [], { source: 'user', ttlMs: Infinity, confidence: 0.5 });
    updateTime();
    setInterval(updateTime, 30000);
    setInterval(render, 15000);
  }

  window.WanderContext = {
    set, get, value, snapshot, subscribe, updateTime, setContext, setMotion, render, statusFor,
    setRealLocation, setRealLocationStatus, setLocationOverride, clearLocationOverride,
    recomputeEffectiveLocation, getEffectiveLocation,
  };

  init();
})();
