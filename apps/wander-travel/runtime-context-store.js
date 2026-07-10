(() => {
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
    'motion.speedKmh': 15000,
    'motion.heading': 15000,
    'mobility.mode': 15000,
    'mobility.evidence': 15000,
    'mobility.override.mode': Infinity,
    'mobility.provider.mode': 60000,
    'mobility.provider.confidence': 60000,
    'journey.current': 300000,
    'journey.event': 120000,
    'history.currentArea': 300000,
    'history.areaEvent': 120000,
    'history.currentPlace': 300000,
    'situation.placeEvent': 120000,
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
    'location.override.status': Infinity,
    'location.override.lat': Infinity,
    'location.override.lng': Infinity,
    'location.override.accuracy': Infinity,
    'location.override.altitude': Infinity,
    'location.override.heading': Infinity,
    'location.override.speedMps': Infinity,
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
    'places.items': 300000,
    'nearby.status': 600000,
    'nearby.current': 900000,
    'nearby.items': 900000,
    'nearby.updatedAt': 900000,
    'nearby.diagnostics': 1800000,
    'fieldGuide.candidate': 120000,
    'fieldGuide.lastSuggestion': 86400000,
  };

  const DEFAULT_KIND = {
    'app.version': 'config',
    'simulation.status': 'observed',
    'context.status': 'inferred',
    'context.activity': 'inferred',
    'time.now': 'observed',
    'time.dayPeriod': 'derived',
    'motion.status': 'inferred',
    'motion.speedKmh': 'derived',
    'motion.heading': 'derived',
    'mobility.mode': 'inferred',
    'mobility.evidence': 'inferred',
    'mobility.override.mode': 'config',
    'mobility.provider.mode': 'observed',
    'mobility.provider.confidence': 'observed',
    'journey.current': 'inferred',
    'journey.event': 'inferred',
    'history.currentArea': 'derived',
    'history.areaEvent': 'inferred',
    'history.currentPlace': 'derived',
    'situation.placeEvent': 'inferred',
    'places.items': 'derived',
    'nearby.status': 'derived',
    'nearby.current': 'derived',
    'nearby.items': 'derived',
    'nearby.updatedAt': 'derived',
    'nearby.diagnostics': 'derived',
    'fieldGuide.candidate': 'inferred',
    'fieldGuide.lastSuggestion': 'derived',
  };

  const now = () => Date.now();
  const has = (key) => Object.prototype.hasOwnProperty.call(state, key);
  const get = (key) => state[key] || null;
  const value = (key, fallback = null) => has(key) ? state[key].value : fallback;

  function ttlFor(key, ttlMs) {
    if (ttlMs != null) return ttlMs;
    return Object.prototype.hasOwnProperty.call(DEFAULT_TTL, key) ? DEFAULT_TTL[key] : 300000;
  }

  function kindFor(key, kind) {
    if (kind) return kind;
    if (key.startsWith('location.real.') || key.startsWith('location.override.')) return 'observed';
    if (key.startsWith('location.effective.')) return 'derived';
    return DEFAULT_KIND[key] || 'observed';
  }

  function sameValue(a, b) {
    if (Object.is(a, b)) return true;
    if (Array.isArray(a) || Array.isArray(b) || (a && typeof a === 'object') || (b && typeof b === 'object')) {
      try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
    }
    return false;
  }

  function sameMeaning(a, b) {
    return Boolean(a && b && sameValue(a.value, b.value) && a.source === b.source && a.kind === b.kind && a.ttlMs === b.ttlMs && a.confidence === b.confidence);
  }

  function snapshot() {
    const out = {};
    Object.keys(state).forEach((key) => {
      const entry = state[key];
      out[key] = {
        value: entry.value,
        source: entry.source,
        kind: entry.kind,
        updatedAt: new Date(entry.updatedAt).toISOString(),
        ttlMs: entry.ttlMs,
        confidence: entry.confidence,
        status: statusFor(entry),
      };
    });
    return out;
  }

  function notify(key, entry) {
    const current = snapshot();
    listeners.forEach((listener) => {
      try { listener(key, entry, current); } catch {}
    });
  }

  function write(key, nextValue, options = {}, shouldNotify = true) {
    const entry = {
      value: nextValue,
      source: options.source || 'app',
      kind: kindFor(key, options.kind),
      updatedAt: options.updatedAt || now(),
      ttlMs: ttlFor(key, options.ttlMs),
      confidence: typeof options.confidence === 'number' ? options.confidence : 1,
    };
    const changed = !sameMeaning(get(key), entry);
    state[key] = entry;
    if (changed && shouldNotify) notify(key, entry);
    return { entry, changed };
  }

  function set(key, nextValue, options = {}) {
    return write(key, nextValue, options, true).entry;
  }

  function remove(key, shouldNotify = true) {
    if (!has(key)) return false;
    delete state[key];
    if (shouldNotify) notify(key, null);
    return true;
  }

  function statusFor(entry) {
    if (!entry) return 'pending';
    if (entry.ttlMs === Infinity) return 'stable';
    return now() - entry.updatedAt <= entry.ttlMs ? 'fresh' : 'stale';
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
    set('time.now', date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), { source: 'clock', kind: 'observed' });
    set('time.dayPeriod', dayPeriod(date), { source: 'clock', kind: 'derived' });
  }

  function setContext({ status, activity, source = 'context', confidence = 1 }) {
    if (status != null) set('context.status', status, { source, kind: 'inferred', confidence });
    if (activity != null) set('context.activity', activity, { source, kind: 'inferred', confidence });
  }

  function setMotion({ status, speedKmh, heading, source = 'context', confidence = 1 }) {
    if (status != null) set('motion.status', status, { source, kind: 'inferred', confidence });
    if (speedKmh != null) set('motion.speedKmh', Number(speedKmh), { source, kind: 'derived', confidence });
    if (heading === null) remove('motion.heading');
    else if (heading != null) set('motion.heading', Number(heading), { source, kind: 'derived', confidence });
  }

  function setMobility({ mode, evidence, source = 'context', confidence = 1 }) {
    if (mode != null) set('mobility.mode', mode, { source, kind: 'inferred', confidence });
    if (evidence != null) set('mobility.evidence', evidence, { source, kind: 'inferred', confidence });
  }

  window.WanderContext = {
    set, remove, get, value, snapshot, subscribe, updateTime, setContext, setMotion, setMobility, statusFor,
    _write: write, _remove: remove, _notify: notify, _sameValue: sameValue,
  };
})();
