(() => {
  const context = window.WanderContext;
  if (!context) return;

  const write = context._write;
  const remove = context._remove;
  const notify = context._notify;
  const sameValue = context._sameValue;
  const get = context.get;
  const value = context.value;
  const LOCATION_FIELDS = ['status','lat','lng','accuracy','altitude','heading','speedMps','updatedAt','source'];

  function finiteNumber(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function validCoordinate(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  function branchValues(prefix) {
    const out = {};
    LOCATION_FIELDS.forEach((field) => { out[field] = value(prefix + '.' + field); });
    return out;
  }

  function sameBranch(a, b) {
    return LOCATION_FIELDS.every((field) => sameValue(a[field], b[field]));
  }

  function copyLocationBranch(fromPrefix, toPrefix, sourceOverride = null) {
    LOCATION_FIELDS.forEach((field) => {
      const sourceEntry = get(fromPrefix + '.' + field);
      const targetKey = toPrefix + '.' + field;
      if (!sourceEntry) return void remove(targetKey, false);
      write(targetKey, sourceEntry.value, {
        source: sourceOverride || sourceEntry.source,
        kind: 'derived',
        updatedAt: sourceEntry.updatedAt,
        ttlMs: sourceEntry.ttlMs,
        confidence: sourceEntry.confidence,
      }, false);
    });
  }

  function recomputeEffectiveLocation() {
    const before = branchValues('location.effective');
    const overrideEnabled = value('location.override.enabled', false) === true;
    const overrideLat = finiteNumber(value('location.override.lat'));
    const overrideLng = finiteNumber(value('location.override.lng'));
    const realLat = finiteNumber(value('location.real.lat'));
    const realLng = finiteNumber(value('location.real.lng'));

    if (overrideEnabled && validCoordinate(overrideLat, overrideLng)) {
      copyLocationBranch('location.override', 'location.effective', 'simulator');
      write('location.effective.status', 'available', { source: 'simulator', kind: 'derived', ttlMs: Infinity, confidence: 1 }, false);
      write('location.effective.source', 'simulator', { source: 'simulator', kind: 'derived', ttlMs: Infinity, confidence: 1 }, false);
    } else if (validCoordinate(realLat, realLng)) {
      copyLocationBranch('location.real', 'location.effective');
      write('location.effective.source', value('location.real.source', 'gps'), { source: 'location', kind: 'derived', ttlMs: Infinity, confidence: 1 }, false);
    } else {
      LOCATION_FIELDS.filter((field) => field !== 'status').forEach((field) => remove('location.effective.' + field, false));
      write('location.effective.status', value('location.real.status', 'pending'), { source: 'location', kind: 'derived', confidence: 1 }, false);
    }

    const after = branchValues('location.effective');
    if (!sameBranch(before, after)) notify('location.effective', get('location.effective.lat') || get('location.effective.status'));
    return validCoordinate(finiteNumber(after.lat), finiteNumber(after.lng));
  }

  function setRealLocation(payload = {}) {
    const lat = finiteNumber(payload.lat);
    const lng = finiteNumber(payload.lng);
    if (!validCoordinate(lat, lng)) return false;

    const before = branchValues('location.real');
    const updatedAt = payload.updatedAt || Date.now();
    const options = { source: payload.source || 'gps', kind: 'observed', confidence: payload.confidence ?? 1, updatedAt };
    write('location.real.status', 'available', options, false);
    write('location.real.lat', Number(lat.toFixed(7)), options, false);
    write('location.real.lng', Number(lng.toFixed(7)), options, false);
    write('location.real.source', payload.source || 'gps', { ...options, ttlMs: Infinity }, false);
    write('location.real.updatedAt', new Date(updatedAt).toISOString(), options, false);

    ['accuracy','altitude','heading','speedMps'].forEach((field) => {
      const numeric = finiteNumber(payload[field]);
      if (numeric !== null) write('location.real.' + field, numeric, options, false);
      else remove('location.real.' + field, false);
    });

    const after = branchValues('location.real');
    if (!sameBranch(before, after)) notify('location.real', get('location.real.lat'));
    recomputeEffectiveLocation();
    return true;
  }

  function setRealLocationStatus(status, options = {}) {
    const before = branchValues('location.real');
    write('location.real.status', status, { source: options.source || 'geolocation', kind: 'observed', confidence: 1 }, false);
    if (status !== 'available') {
      ['lat','lng','accuracy','altitude','heading','speedMps','updatedAt'].forEach((field) => remove('location.real.' + field, false));
    }
    const after = branchValues('location.real');
    if (!sameBranch(before, after)) notify('location.real.status', get('location.real.status'));
    recomputeEffectiveLocation();
  }

  function setLocationOverride(payload = {}) {
    const lat = finiteNumber(payload.lat);
    const lng = finiteNumber(payload.lng);
    if (!validCoordinate(lat, lng)) return false;

    const before = branchValues('location.override');
    const updatedAt = payload.updatedAt || Date.now();
    const options = { source: 'simulator', kind: 'observed', ttlMs: Infinity, confidence: 1, updatedAt };
    write('location.override.enabled', true, options, false);
    write('location.override.status', 'available', options, false);
    write('location.override.lat', Number(lat.toFixed(7)), options, false);
    write('location.override.lng', Number(lng.toFixed(7)), options, false);
    write('location.override.source', 'simulator', options, false);
    write('location.override.updatedAt', new Date(updatedAt).toISOString(), options, false);

    ['accuracy','altitude','heading','speedMps'].forEach((field) => {
      const numeric = finiteNumber(payload[field]);
      if (numeric !== null) write('location.override.' + field, numeric, options, false);
      else remove('location.override.' + field, false);
    });

    const after = branchValues('location.override');
    if (!sameBranch(before, after)) notify('location.override', get('location.override.lat'));
    recomputeEffectiveLocation();
    return true;
  }

  function clearLocationOverride() {
    const before = branchValues('location.override');
    const current = context.snapshot();
    Object.keys(current).filter((key) => key.startsWith('location.override.')).forEach((key) => remove(key, false));
    write('location.override.enabled', false, { source: 'simulator', kind: 'observed', ttlMs: Infinity, confidence: 1 }, false);
    const after = branchValues('location.override');
    if (!sameBranch(before, after)) notify('location.override', get('location.override.enabled'));
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

  Object.assign(context, {
    setRealLocation,
    setRealLocationStatus,
    setLocationOverride,
    clearLocationOverride,
    recomputeEffectiveLocation,
    getEffectiveLocation,
  });
})();
