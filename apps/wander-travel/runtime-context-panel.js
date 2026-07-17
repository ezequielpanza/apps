(() => {
  const context = window.WanderContext;
  if (!context) return;

  const $ = (selector) => document.querySelector(selector);
  const icon = (name) => '<svg class="section-icon" aria-hidden="true"><use href="wander-icons.svg#' + name + '"></use></svg>';
  const COORDINATE_FORMAT_KEY = 'wander.coordinates.format.v1';
  const COORDINATE_FORMATS = ['dd', 'dm', 'dms'];

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
    ['mobility.method', 'Método de desplazamiento', 'compass', 'mobility'],
    ['motion.speedKmh', 'Velocidad', 'speed', 'speed'],
    ['motion.heading', 'Rumbo', 'heading', 'heading'],
    ['journey.current', 'Journey', 'route', 'journey'],
    ['place.country', 'País', 'pin', 'country'],
    ['place.city', 'Ciudad', 'city', 'place'],
    ['place.zone', 'Zona', 'zone', 'zone'],
    ['history.currentPlace', 'Memoria del lugar', 'brain', 'placeMemory'],
  ];

  const EXTRA_DASHBOARD_FIELDS = ['currentPOI', 'nearby', 'simulation', 'appVersion'];
  const TECHNICAL = [
    'app.version','simulation.status','context.status','context.activity','time.now','time.dayPeriod',
    'location.real.status','location.real.lat','location.real.lng','location.real.accuracy','location.real.altitude','location.real.heading','location.real.speedMps','location.real.updatedAt','location.real.source',
    'location.override.enabled','location.override.status','location.override.lat','location.override.lng','location.override.accuracy','location.override.altitude','location.override.heading','location.override.speedMps','location.override.updatedAt','location.override.source',
    'location.effective.status','location.effective.lat','location.effective.lng','location.effective.accuracy','location.effective.altitude','location.effective.heading','location.effective.speedMps','location.effective.updatedAt','location.effective.source',
    'motion.status','motion.speedKmh','motion.heading',
    'mobility.method','mobility.methodId','mobility.methodConfidence','mobility.methodEvidence','mobility.methodCandidates','mobility.mode','mobility.evidence','mobility.override.mode','mobility.provider.mode','mobility.provider.confidence',
    'journey.current','journey.event','situation.transition','situation.placeEvent','situation.current',
    'place.status','place.current','place.country','place.countryCode','place.countryId','place.region','place.regionId',
    'place.city','place.cityId','place.district','place.districtId','place.neighborhood','place.neighborhoodId',
    'place.zone','place.zoneId','place.type','place.displayName','place.source','place.sourceRef','place.resolvedLat','place.resolvedLng','place.updatedAt','place.attribution',
    'history.currentPlace','conversation.pendingClarification','history.currentArea','history.areaEvent','environment.weatherStatus','places.items',
  ];

  function dashboard() { return window.WanderContextDashboard; }
  function dashboardField(fieldId) { return dashboard()?.fields?.find((field) => field.id === fieldId) || null; }
  function dashboardToggle(fieldId, label) {
    if (!fieldId || !dashboardField(fieldId)) return '';
    const checked = dashboard()?.isVisible?.(fieldId) ? ' checked' : '';
    return '<label class="context-dashboard-inline-toggle" title="Mostrar en el dashboard"><input type="checkbox" data-dashboard-inline-toggle="' + fieldId + '" aria-label="Mostrar ' + label + ' en el dashboard"' + checked + '><span aria-hidden="true"></span></label>';
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

  function movementMethodValue(method) {
    if (!method) return 'Desconocido';
    const label = method.label || method.id || 'Desconocido';
    const confidence = Number(method.confidence);
    return Number.isFinite(confidence) ? label + ' · ' + Math.round(confidence * 100) + '%' : label;
  }

  function placeStatusValue(value) {
    const labels = { pending: 'Pendiente', resolving: 'Resolviendo', available: 'Disponible', unavailable: 'No disponible' };
    return labels[value] || String(value || 'Pendiente');
  }

  function coordinateFormat() {
    try { const stored = localStorage.getItem(COORDINATE_FORMAT_KEY); return COORDINATE_FORMATS.includes(stored) ? stored : 'dd'; }
    catch { return 'dd'; }
  }

  function coordinatePart(value, positive, negative, format) {
    const hemisphere = value >= 0 ? positive : negative;
    const absolute = Math.abs(value);
    if (format === 'dd') return absolute.toFixed(6) + '° ' + hemisphere;
    const degrees = Math.floor(absolute);
    const minutesFull = (absolute - degrees) * 60;
    if (format === 'dm') return degrees + '° ' + minutesFull.toFixed(3) + '′ ' + hemisphere;
    const minutes = Math.floor(minutesFull);
    const seconds = (minutesFull - minutes) * 60;
    return degrees + '° ' + minutes + '′ ' + seconds.toFixed(1) + '″ ' + hemisphere;
  }

  function coordinatesValue() {
    const effective = context.getEffectiveLocation?.();
    const lat = Number(effective?.lat ?? context.value('location.effective.lat'));
    const lng = Number(effective?.lng ?? context.value('location.effective.lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'Pendiente';
    const format = coordinateFormat();
    if (format === 'dd') return lat.toFixed(6) + ', ' + lng.toFixed(6);
    return coordinatePart(lat, 'N', 'S', format) + ' · ' + coordinatePart(lng, 'E', 'W', format);
  }

  function cycleCoordinateFormat() {
    const current = coordinateFormat();
    const next = COORDINATE_FORMATS[(COORDINATE_FORMATS.indexOf(current) + 1) % COORDINATE_FORMATS.length];
    try { localStorage.setItem(COORDINATE_FORMAT_KEY, next); } catch {}
    window.dispatchEvent(new CustomEvent('wander:coordinate-format-change', { detail: { format: next } }));
    dashboard()?.render?.(); renderHuman();
  }

  function readableValue(key, entry) {
    if (key === 'location.effective.coordinates') return coordinatesValue();
    if (!entry) return 'Pendiente';
    if (key.endsWith('.accuracy')) return Number(entry.value).toFixed(0) + ' m';
    if (key.endsWith('.speedMps')) return (Number(entry.value) * 3.6).toFixed(1) + ' km/h';
    if (key.endsWith('.heading') || key === 'motion.heading') return Number.isFinite(Number(entry.value)) ? Math.round(Number(entry.value)) + '°' : '—';
    if (key === 'motion.speedKmh') return Number(entry.value || 0).toFixed(1) + ' km/h';
    if (key === 'mobility.method') return movementMethodValue(entry.value);
    if ((key === 'mobility.methodEvidence' || key === 'mobility.evidence') && Array.isArray(entry.value)) return entry.value.join(', ') || 'Sin evidencia';
    if (key === 'journey.current') return journeyValue(entry.value);
    if (key === 'place.status') return placeStatusValue(entry.value);
    if ((key === 'journey.event' || key === 'situation.transition' || key === 'situation.placeEvent' || key === 'history.areaEvent') && entry.value?.type) return entry.value.type;
    if (key === 'history.currentPlace') return placeMemoryValue(entry.value);
    if (key === 'conversation.pendingClarification') return entry.value?.question || 'Aclaración pendiente';
    if (key === 'places.items' && Array.isArray(entry.value)) return entry.value.length + ' lugares';
    if (entry.value && typeof entry.value === 'object') { try { return JSON.stringify(entry.value); } catch { return '[objeto]'; } }
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
    const field = dashboardField(fieldId);
    const value = field?.value ? field.value() : readableValue(key, entry);
    const valueHtml = fieldId === 'coordinates' ? '<button type="button" class="coordinate-format-button" data-coordinate-format-button title="Tocar para cambiar el formato" aria-label="Cambiar formato de coordenadas"><b>' + value + '</b></button>' : '<b>' + value + '</b>';
    return '<div class="context-row has-dashboard-toggle"' + (fieldId === 'coordinates' ? ' data-coordinate-format-row' : '') + '><div class="context-label">' + dashboardToggle(fieldId, label) + icon(iconName) + '<strong>' + label + '</strong></div><div class="context-row-value">' + valueHtml + '</div></div>';
  }

  function extraDashboardRow(fieldId) {
    const field = dashboardField(fieldId);
    if (!field) return '';
    return '<div class="context-row has-dashboard-toggle"><div class="context-label">' + dashboardToggle(field.id, field.label) + icon(field.icon) + '<strong>' + field.label + '</strong></div><div class="context-row-value"><b>' + field.value() + '</b></div></div>';
  }

  function renderHuman() { const list = $('#context-list'); if (list) list.innerHTML = HUMAN.map((item) => humanRow(...item)).join('') + EXTRA_DASHBOARD_FIELDS.map(extraDashboardRow).join(''); }
  function renderTechnical() {
    const list = $('#context-technical');
    if (!list) return;
    list.innerHTML = TECHNICAL.map((key) => { const entry = context.get(key); const kind = entry?.kind || 'pending'; return '<div class="technical-row"><code>' + key + '</code><span>' + readableValue(key, entry) + ' · ' + kind + ' · ' + context.statusFor(entry) + ' · ' + formatAge(entry) + '</span></div>'; }).join('');
  }
  function syncSummary() { const time = context.value('time.now'); const period = context.value('time.dayPeriod'); if (time) window.WanderUI?.setText('#context-time', time); if (period) window.WanderUI?.setText('#context-period', period); }
  function removeLegacyDashboardSelector() { $('#context-dashboard-fields')?.closest('.screen-card')?.remove(); }
  function render() { removeLegacyDashboardSelector(); renderHuman(); renderTechnical(); syncSummary(); }

  $('#context-list')?.addEventListener('change', (event) => { const input = event.target.closest('[data-dashboard-inline-toggle]'); if (!input) return; dashboard()?.setFieldVisible?.(input.dataset.dashboardInlineToggle, input.checked); renderHuman(); });
  $('#context-list')?.addEventListener('click', (event) => { const button = event.target.closest('[data-coordinate-format-button]'); if (!button) return; event.preventDefault(); event.stopPropagation(); cycleCoordinateFormat(); });
  $('#refresh-context-button')?.addEventListener('click', () => { context.updateTime(); window.WanderProviders?.place?.refresh?.(true); window.WanderSituationEngine?.evaluate?.(); render(); });

  context.subscribe(render);
  window.addEventListener('wander:coordinate-format-change', renderHuman);
  render(); setInterval(render, 15000);
  window.WanderContextPanel = { render, syncSummary, cycleCoordinateFormat };
})();
