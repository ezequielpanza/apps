(() => {
  const VERSION = 'v0.58.0';
  const listeners = new Set();
  const DEFAULT_TTL = {
    'app.version': Infinity,
    'time.now': 70000,
    'time.dayPeriod': 300000,
    'motion.status': 15000,
    'motion.speedKmh': 15000,
    'motion.heading': 15000,
    'location.lat': 30000,
    'location.lng': 30000,
    'location.source': 30000,
    'location.updatedAt': 30000,
    'environment.weatherStatus': 1800000,
    'place.city': 3600000,
    'place.zone': 1800000,
    'user.intent': 600000,
    'user.interests': Infinity,
  };

  const state = {};

  function now() {
    return Date.now();
  }

  function iso(ts = now()) {
    return new Date(ts).toISOString();
  }

  function ttlFor(key, ttlMs) {
    if (ttlMs != null) return ttlMs;
    return Object.prototype.hasOwnProperty.call(DEFAULT_TTL, key) ? DEFAULT_TTL[key] : 300000;
  }

  function set(key, value, options = {}) {
    const timestamp = options.updatedAt || now();
    const entry = {
      value,
      source: options.source || 'app',
      updatedAt: timestamp,
      ttlMs: ttlFor(key, options.ttlMs),
      confidence: typeof options.confidence === 'number' ? options.confidence : 1,
      label: options.label || null,
    };
    state[key] = entry;
    notify(key, entry);
    return entry;
  }

  function get(key) {
    return state[key] || null;
  }

  function value(key, fallback = null) {
    return state[key] ? state[key].value : fallback;
  }

  function ageMs(entry) {
    return entry ? now() - entry.updatedAt : Infinity;
  }

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

  function dayPeriod(date = new Date()) {
    const hour = date.getHours();
    if (hour >= 6 && hour < 11) return 'mañana';
    if (hour >= 11 && hour < 15) return 'mediodía';
    if (hour >= 15 && hour < 20) return 'tarde';
    return 'noche';
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

  function updateTime() {
    const date = new Date();
    set('time.now', date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), { source: 'clock', ttlMs: 70000 });
    set('time.dayPeriod', dayPeriod(date), { source: 'clock', ttlMs: 300000 });
  }

  function setMotion({ status, speedKmh, heading, source = 'motion' }) {
    if (status != null) set('motion.status', status, { source, ttlMs: 15000 });
    if (speedKmh != null) set('motion.speedKmh', Number(speedKmh), { source, ttlMs: 15000 });
    if (heading != null) set('motion.heading', heading, { source, ttlMs: 15000 });
  }

  function setLocation({ lat, lng, source = 'unknown', confidence = 0.8 }) {
    if (typeof lat === 'number') set('location.lat', Number(lat.toFixed(6)), { source, ttlMs: 30000, confidence });
    if (typeof lng === 'number') set('location.lng', Number(lng.toFixed(6)), { source, ttlMs: 30000, confidence });
    set('location.source', source, { source, ttlMs: 30000, confidence });
    set('location.updatedAt', iso(), { source, ttlMs: 30000, confidence });
  }

  function readableValue(key, entry) {
    if (!entry) return 'Pendiente';
    if (key === 'motion.speedKmh') return Number(entry.value || 0).toFixed(1) + ' km/h';
    if (key === 'motion.heading') return Number.isFinite(Number(entry.value)) ? Math.round(Number(entry.value)) + '°' : '—';
    if (key === 'user.interests' && Array.isArray(entry.value)) return entry.value.length ? entry.value.join(', ') : 'Pendiente';
    return entry.value == null || entry.value === '' ? 'Pendiente' : String(entry.value);
  }

  const DISPLAY = [
    ['app.version', 'Versión', '📦'],
    ['time.now', 'Hora', '🕒'],
    ['time.dayPeriod', 'Momento', '🌗'],
    ['motion.status', 'Movimiento', '🚶'],
    ['motion.speedKmh', 'Velocidad', '💨'],
    ['motion.heading', 'Rumbo', '🧭'],
    ['location.source', 'Fuente ubicación', '📍'],
    ['location.lat', 'Latitud', '↕️'],
    ['location.lng', 'Longitud', '↔️'],
    ['environment.weatherStatus', 'Clima', '🌦️'],
    ['place.city', 'Ciudad', '🏙️'],
    ['place.zone', 'Zona', '🧱'],
    ['user.intent', 'Intención', '🎯'],
    ['user.interests', 'Intereses', '🧠'],
  ];

  function render() {
    const list = document.querySelector('#context-list');
    if (!list) return;
    list.innerHTML = DISPLAY.map(([key, label, icon]) => {
      const entry = get(key);
      const status = statusFor(entry);
      return '<div class="context-row" data-context-status="' + status + '"><div><strong>' + icon + ' ' + label + '</strong><span>' + key + '</span></div><div><b>' + readableValue(key, entry) + '</b><small>' + status + ' · ' + formatAge(entry) + '</small></div></div>';
    }).join('');

    const technical = document.querySelector('#context-technical');
    if (technical) technical.textContent = JSON.stringify(snapshot(), null, 2);
  }

  function init() {
    set('app.version', VERSION, { source: 'app', ttlMs: Infinity });
    set('environment.weatherStatus', 'Pendiente', { source: 'placeholder', ttlMs: 1800000, confidence: 0.2 });
    set('place.city', 'Pendiente', { source: 'placeholder', ttlMs: 3600000, confidence: 0.2 });
    set('place.zone', 'Pendiente', { source: 'placeholder', ttlMs: 1800000, confidence: 0.2 });
    set('user.intent', 'Descubrir', { source: 'default', ttlMs: 600000, confidence: 0.5 });
    set('user.interests', [], { source: 'user', ttlMs: Infinity, confidence: 0.5 });
    setMotion({ status: 'Detenido', speedKmh: 0, heading: null, source: 'init' });
    updateTime();
    setInterval(updateTime, 30000);
    setInterval(render, 15000);
  }

  window.WanderContext = {
    set,
    get,
    value,
    snapshot,
    subscribe,
    updateTime,
    setMotion,
    setLocation,
    render,
    statusFor,
  };

  init();
})();
