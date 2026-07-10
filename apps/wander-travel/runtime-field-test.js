(() => {
  const context = window.WanderContext;
  if (!context) return;

  const STORAGE_KEY = 'wander.field.test.v1';
  const MAX_EVENTS = 2000;
  const LOCATION_SAMPLE_MS = 30000;
  const LOCATION_SAMPLE_M = 100;

  let enabled = window.WanderFieldTestConfig?.enabled !== false;
  let data = load();
  let lastLocationSample = null;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored?.version === 1 && Array.isArray(stored.events)) return stored;
    } catch {}
    return {
      version: 1,
      sessionId: `field-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      events: [],
    };
  }

  function persist() {
    if (data.events.length > MAX_EVENTS) data.events = data.events.slice(-MAX_EVENTS);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  }

  function radians(value) { return value * Math.PI / 180; }

  function distanceMeters(left, right) {
    if (!left || !right) return Infinity;
    const radius = 6371008.8;
    const dLat = radians(right.lat - left.lat);
    const dLng = radians(right.lng - left.lng);
    const lat1 = radians(left.lat);
    const lat2 = radians(right.lat);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function record(type, payload = {}, options = {}) {
    if (!enabled && !options.force) return null;
    const event = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      type: String(type),
      at: new Date().toISOString(),
      payload: clone(payload),
    };
    data.events.push(event);
    persist();
    return clone(event);
  }

  function effectiveLocation() {
    const location = context.getEffectiveLocation?.();
    if (!location || !Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lng))) return null;
    return {
      lat: Number(location.lat),
      lng: Number(location.lng),
      accuracy: Number.isFinite(Number(location.accuracy)) ? Number(location.accuracy) : null,
      heading: Number.isFinite(Number(location.heading)) ? Number(location.heading) : null,
      speedMps: Number.isFinite(Number(location.speedMps)) ? Number(location.speedMps) : null,
      source: location.source || null,
    };
  }

  function sampleLocation(force = false) {
    const location = effectiveLocation();
    if (!location) return null;
    const now = Date.now();
    if (!force && lastLocationSample) {
      const ageMs = now - lastLocationSample.at;
      const movedM = distanceMeters(lastLocationSample.location, location);
      if (ageMs < LOCATION_SAMPLE_MS && movedM < LOCATION_SAMPLE_M) return null;
    }
    lastLocationSample = { at: now, location };
    return record('location_sample', {
      location,
      motionStatus: context.value('motion.status'),
      speedKmh: context.value('motion.speedKmh'),
      mobilityMode: context.value('mobility.mode'),
    });
  }

  function nearbySummary(current) {
    if (!current || typeof current !== 'object') return null;
    return {
      status: current.status,
      center: current.center,
      radiusM: current.radiusM,
      mobility: current.mobility,
      updatedAt: current.updatedAt,
      diagnostics: current.diagnostics,
      topItems: (current.items || []).slice(0, 10).map((item) => ({
        id: item.id,
        name: item.name,
        distanceM: item.distanceM,
        bearingDeg: item.bearingDeg,
        relevanceScore: item.relevanceScore,
        confidence: item.confidence,
        sources: (item.sources || []).map((source) => ({ id: source.id, ref: source.ref || null })),
        categories: (item.categories || []).map((category) => ({ id: category.id, label: category.label })),
      })),
    };
  }

  function onContextChange(key) {
    if (!enabled) return;
    if (key === 'location.effective' || key.startsWith('location.effective.')) {
      sampleLocation(false);
      return;
    }
    if (key === 'place.current') {
      record('place_current', context.value('place.current'));
      return;
    }
    if (key === 'motion.status' || key === 'mobility.mode' || key === 'journey.event') {
      record('context_transition', {
        key,
        value: context.value(key),
        motionStatus: context.value('motion.status'),
        speedKmh: context.value('motion.speedKmh'),
        mobilityMode: context.value('mobility.mode'),
        journey: context.value('journey.current'),
      });
      return;
    }
    if (key === 'nearby.current') {
      const summary = nearbySummary(context.value('nearby.current'));
      if (summary) record('nearby_result', summary);
      return;
    }
    if (key === 'fieldGuide.lastSuggestion') {
      record('field_guide_suggestion', context.value('fieldGuide.lastSuggestion'));
    }
  }

  function snapshot() {
    return clone({
      ...data,
      exportedAt: new Date().toISOString(),
      appVersion: window.WanderVersion || context.value('app.version') || null,
      finalContext: context.snapshot?.() || null,
    });
  }

  function exportFile() {
    const payload = snapshot();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    anchor.href = url;
    anchor.download = `wander-field-test-${date}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    record('field_test_exported', { filename: anchor.download });
    return payload;
  }

  function clear() {
    data = {
      version: 1,
      sessionId: `field-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      events: [],
    };
    lastLocationSample = null;
    persist();
    record('field_test_cleared', {}, { force: true });
  }

  function setEnabled(next) {
    enabled = Boolean(next);
    record(enabled ? 'field_test_enabled' : 'field_test_disabled', {}, { force: true });
    return enabled;
  }

  function installControls() {
    const panel = document.querySelector('#developer-panel');
    if (!panel || document.querySelector('#field-test-controls')) return;

    const card = document.createElement('div');
    card.id = 'field-test-controls';
    card.className = 'screen-card panel-block';
    card.innerHTML = '<h3>Prueba de campo</h3><p class="panel-note">Registra contexto, búsquedas cercanas, consolidación y sugerencias para analizar el viaje después.</p><div class="button-row compact-actions"><button id="export-field-test-button" type="button"><span>Exportar JSON</span></button><button id="clear-field-test-button" type="button"><span>Limpiar registro</span></button></div>';
    panel.appendChild(card);

    card.querySelector('#export-field-test-button')?.addEventListener('click', () => exportFile());
    card.querySelector('#clear-field-test-button')?.addEventListener('click', () => clear());
  }

  context.subscribe(onContextChange);

  window.WanderFieldTest = Object.freeze({
    record,
    sampleLocation,
    snapshot,
    exportFile,
    clear,
    setEnabled,
    isEnabled: () => enabled,
  });

  installControls();
  record('field_test_started', {
    appVersion: window.WanderVersion || context.value('app.version') || null,
    userAgent: navigator.userAgent,
  }, { force: true });
  sampleLocation(true);
})();
