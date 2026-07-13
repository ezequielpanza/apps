(() => {
  const context = window.WanderContext;
  if (!context) return;

  const $ = (selector) => document.querySelector(selector);
  const icon = (name) => '<svg class="section-icon" aria-hidden="true"><use href="wander-icons.svg#' + name + '"></use></svg>';

  const HUMAN = [
    ['context.status', 'Estado actual', 'target', 'summary'],
    ['context.activity', 'Actividad', 'route', 'activity'],
    ['time.now', 'Hora', 'clock', 'time'],
    ['time.dayPeriod', 'Momento del día', 'day', 'dayPeriod'],
    ['location.effective.status', 'Ubicación', 'pin', 'locationStatus'],
    ['location.effective.coordinates', 'Coordenadas', 'pin', 'coordinates'],
    ['location.effective.source', 'Fuente de ubicación', 'target', 'locationSource'],
    ['location.effective.accuracy', 'Precisión', 'target', 'accuracy'],
    ['motion.status', 'Movimiento físico', 'route', 'motionStatus'],
    ['mobility.mode', 'Modo de movilidad', 'compass', 'mobility'],
    ['motion.speedKmh', 'Velocidad', 'speed', 'speed'],
    ['motion.heading', 'Rumbo', 'heading', 'heading'],
    ['journey.current', 'Journey', 'route', 'journey'],
    ['place.country', 'País', 'pin', 'country'],
    ['place.city', 'Ciudad', 'city', 'place'],
    ['place.zone', 'Zona', 'zone', 'zone'],
    ['history.currentPlace', 'Memoria del lugar', 'brain', 'placeMemory'],
  ];

  const EXTRA_DASHBOARD_FIELDS = ['currentPOI', 'nearby', 'lastSuggestion', 'simulation'];

  const TECHNICAL = [
    'app.version','simulation.status','context.status','context.activity','time.now','time.dayPeriod',
    'location.real.status','location.real.lat','location.real.lng','location.real.accuracy','location.real.altitude','location.real.heading','location.real.speedMps','location.real.updatedAt','location.real.source',
    'location.override.enabled','location.override.status','location.override.lat','location.override.lng','location.override.accuracy','location.override.altitude','location.override.heading','location.override.speedMps','location.override.updatedAt','location.override.source',
    'location.effective.status','location.effective.lat','location.effective.lng','location.effective.accuracy','location.effective.altitude','location.effective.heading','location.effective.speedMps','location.effective.updatedAt','location.effective.source',
    'motion.status','motion.speedKmh','motion.heading',
    'mobility.mode','mobility.evidence','mobility.override.mode','mobility.provider.mode','mobility.provider.confidence',
    'journey.current','journey.event','situation.transition','situation.placeEvent',
    'place.status','place.current','place.country','place.countryCode','place.countryId','place.region','place.regionId',
    'place.city','place.cityId','place.district','place.districtId','place.neighborhood','place.neighborhoodId',
    'place.zone','place.zoneId','place.type','place.displayName','place.source','place.sourceRef','place.resolvedLat','place.resolvedLng','place.updatedAt','place.attribution',
    'history.currentPlace','conversation.pendingClarification',
    'history.currentArea','history.areaEvent','environment.weatherStatus','places.items',
  ];

  function dashboard() { return window.WanderContextDashboard; }
  function dashboardField(fieldId) { return dashboard()?.fields?.find((field) => field.id === fieldId) || null; }

  function dashboardToggle(fieldId, label) {
    if (!fieldId || !dashboardField(fieldId)) return '';
    const checked = dashboard()?.isVisible?.(fieldId) ? ' checked' : '';
    return '<label class="context-dashboard-inline-toggle" title="Mostrar en el dashboard">' +
      '<input type="checkbox" data-dashboard-inline-toggle="' + fieldId + '" aria-label="Mostrar ' + label + ' en el dashboard"' + checked + '>' +
      '<span aria-hidden="true"></span></label>';
  }

  function placeMemoryValue(place) {
    if (!place) return 'Pendiente';
    const current = place.city || place.zone || place.country;
    if (!current) return 'Sin memoria';
    const labels = { assumed_new: 'asumido nuevo', new_confirmed: 'nuevo confirmado', recent_presence: 'presencia reciente', known: 'conocido por vos' };
    const status = labels[current.presenceStatus] || current.presenceStatus || 'sin historial';
    return (current.name || 'Lugar actual') + ' · ' + status + (current.seenYesterday ? ' · estuvo ayer' : '');
  }

  function journeyValue(journey) {
    if (!journey) return 'Sin Journey activo';
    const state = journey.state === 'paused' ? 'Pausado' : 'Activo';
    const distanceKm = Number(journey.distanceM || 0) / 1000;
    return state + ' · ' + distanceKm.toFixed(distanceKm >= 10 ? 0 : 1) + ' km';
  }

  function mobilityValue(value) { return !value || value === 'unknown' ? 'Desconocido' : String(value); }

  function placeStatusValue(value) {
    const labels = { pending: 'Pendiente', resolving: 'Resolviendo', available: 'Disponible', unavailable: 'No disponible' };
    return labels[value] || String(value || 'Pendiente');
  }

  function coordinatesValue() {
    const effective = context.getEffectiveLocation?.();
    const lat = Number(effective?.lat ?? context.value('location.effective.lat'));
    const lng = Number(effective?.lng ?? context.value('location.effective.lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'Pendiente';
    return lat.toFixed(6) + ', ' + lng.toFixed(6);
  }

  function readableValue(key, entry) {
    if (key === 'location.effective.coordinates') return coordinatesValue();
    if (!entry) return 'Pendiente';
    if (key.endsWith('.accuracy')) return Number(entry.value).toFixed(0) + ' m';
    if (key.endsWith('.speedMps')) return (Number(entry.value) * 3.6).toFixed(1) + ' km/h';
    if (key.endsWith('.heading') || key === 'motion.heading') return Number.isFinite(Number(entry.value)) ? Math.round(Number(entry.value)) + '°' : '—';
    if (key === 'motion.speedKmh') return Number(entry.value || 0).toFixed(1) + ' km/h';
    if (key === 'mobility.mode') return mobilityValue(entry.value);
    if (key === 'mobility.evidence' && Array.isArray(entry.value)) return entry.value.join(', ') || 'Sin evidencia';
    if (key === 'journey.current') return journeyValue(entry.value);
    if (key === 'place.status') return placeStatusValue(entry.value);
    if ((key === 'journey.event' || key === 'situation.transition' || key === 'situation.placeEvent' || key === 'history.areaEvent') && entry.value?.type) return entry.value.type;
    if (key === 'history.currentPlace') return placeMemoryValue(entry.value);
    if (key === 'conversation.pendingClarification') return entry.value?.question || 'Aclaración pendiente';
    if (key === 'places.items' && Array.isArray(entry.value)) return entry.value.length + ' lugares';
    if (entry.value && typeof entry.value === 'object') {
      try { return JSON.stringify(entry.value); } catch { return '[objeto]'; }
    }
    return entry.value == null || entry.value === '' ? 'Pendiente' : String(entry.value);
  }

  function formatAge(entry) {
    if (!entry) return 'sin datos';
    const age = Math.max(0, Math.round((Date.now() - entry.updatedAt) / 1000));
    if (age < 60) return 'hace ' + age + ' s';
    const minutes = Math.round(age / 60);
    if (minutes < 60) return 'hace ' + minutes + ' min';
    return 'hace ' + Math.round(minutes / 60) + ' h';
  }

  function humanRow(key, label, iconName, fieldId) {
    const entry = context.get(key);
    return '<div class="context-row has-dashboard-toggle">' +
      '<div class="context-label">' + dashboardToggle(fieldId, label) + icon(iconName) + '<strong>' + label + '</strong></div>' +
      '<div class="context-row-value"><b>' + readableValue(key, entry) + '</b></div></div>';
  }

  function extraDashboardRow(fieldId) {
    const field = dashboardField(fieldId);
    if (!field) return '';
    return '<div class="context-row has-dashboard-toggle"><div class="context-label">' + dashboardToggle(field.id, field.label) + icon(field.icon) + '<strong>' + field.label + '</strong></div><div class="context-row-value"><b>' + field.value() + '</b></div></div>';
  }

  function renderHuman() {
    const list = $('#context-list');
    if (!list) return;
    list.innerHTML = HUMAN.map((item) => humanRow(...item)).join('') + EXTRA_DASHBOARD_FIELDS.map(extraDashboardRow).join('');
  }

  function renderTechnical() {
    const list = $('#context-technical');
    if (!list) return;
    list.innerHTML = TECHNICAL.map((key) => {
      const entry = context.get(key);
      const kind = entry?.kind || 'pending';
      return '<div class="technical-row"><code>' + key + '</code><span>' + readableValue(key, entry) + ' · ' + kind + ' · ' + context.statusFor(entry) + ' · ' + formatAge(entry) + '</span></div>';
    }).join('');
  }

  function syncSummary() {
    const time = context.value('time.now');
    const period = context.value('time.dayPeriod');
    if (time) window.WanderUI?.setText('#context-time', time);
    if (period) window.WanderUI?.setText('#context-period', period);
  }

  function removeLegacyDashboardSelector() {
    const selector = $('#context-dashboard-fields');
    selector?.closest('.screen-card')?.remove();
  }

  function render() {
    removeLegacyDashboardSelector();
    renderHuman();
    renderTechnical();
    syncSummary();
  }

  $('#context-list')?.addEventListener('change', (event) => {
    const input = event.target.closest('[data-dashboard-inline-toggle]');
    if (!input) return;
    dashboard()?.setFieldVisible?.(input.dataset.dashboardInlineToggle, input.checked);
    renderHuman();
  });

  $('#refresh-context-button')?.addEventListener('click', () => {
    context.updateTime();
    window.WanderProviders?.place?.refresh?.(true);
    render();
  });

  context.subscribe(render);
  render();
  setInterval(render, 15000);

  window.WanderContextPanel = { render, syncSummary };
})();