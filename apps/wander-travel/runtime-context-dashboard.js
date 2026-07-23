(() => {
  const context = window.WanderContext;
  if (!context) return;

  const STORAGE_KEY = 'wander.contextDashboard.config.v1';
  const COORDINATE_FORMAT_KEY = 'wander.coordinates.format.v1';
  const DEFAULT_VISIBLE_FIELDS = Object.freeze(['summary', 'speed', 'heading']);
  const ACTIVITY_LABELS = Object.freeze({
    moving: 'En movimiento',
    paused: 'En pausa',
    stationary: 'En pausa',
    pending: 'Preparando contexto',
  });
  const MOTION_LABELS = Object.freeze({
    moving: 'En movimiento',
    stationary: 'Detenido',
    pending: 'Preparando contexto',
  });
  const LOCATION_STATUS_LABELS = Object.freeze({
    available: 'Disponible',
    pending: 'Preparando ubicación',
    denied: 'Permiso denegado',
    unavailable: 'No disponible',
    timeout: 'Sin respuesta',
    unsupported: 'No compatible',
  });
  const LOCATION_SOURCE_LABELS = Object.freeze({
    gps: 'GPS',
    geolocation: 'GPS',
    simulator: 'Simulador',
  });

  function textValue(value, fallback) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'object') return value.name || value.label || value.displayName || fallback;
    return String(value);
  }

  function translatedValue(key, labels, fallback) {
    const value = context.value(key);
    const normalized = String(value ?? '').trim().toLowerCase();
    return labels[normalized] || textValue(value, fallback);
  }

  function activityValue() {
    const motion = String(context.value('motion.status') || '').toLowerCase();
    const summary = textValue(context.value('context.status'), 'Preparando contexto');
    if (motion === 'moving') return 'En movimiento';
    if (motion === 'stationary') return 'En pausa';
    if (motion === 'pending') return summary === 'Confirmando detención' ? summary : 'Preparando contexto';
    return translatedValue('context.activity', ACTIVITY_LABELS, 'Preparando contexto');
  }

  function motionStatusValue() {
    const motion = String(context.value('motion.status') || '').toLowerCase();
    const summary = textValue(context.value('context.status'), 'Preparando contexto');
    if (motion === 'pending' && summary === 'Confirmando detención') return summary;
    return MOTION_LABELS[motion] || translatedValue('motion.status', MOTION_LABELS, 'Preparando contexto');
  }

  function numberValue(key, suffix, digits = 0, fallback = '—') {
    const value = Number(context.value(key));
    return Number.isFinite(value) ? value.toFixed(digits) + suffix : fallback;
  }

  function cardinalDirection(value) {
    const heading = Number(value);
    if (!Number.isFinite(heading)) return '';
    const labels = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const normalized = ((heading % 360) + 360) % 360;
    return labels[Math.round(normalized / 45) % labels.length];
  }

  function directionValue() {
    const source = String(context.value('direction.source') || '').toLowerCase();
    const hybrid = Number(context.value('direction.heading'));
    const gps = Number(context.value('motion.heading'));
    const value = source !== 'none' && source !== 'disabled' && Number.isFinite(hybrid) ? hybrid : gps;
    if (!Number.isFinite(value)) return '—';
    const normalized = ((value % 360) + 360) % 360;
    return `${Math.round(normalized)}° · ${cardinalDirection(normalized)}`;
  }

  function coordinateFormat() {
    try {
      const stored = localStorage.getItem(COORDINATE_FORMAT_KEY);
      return ['dd', 'dm', 'dms'].includes(stored) ? stored : 'dd';
    } catch { return 'dd'; }
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

  function movementMethodValue() {
    const method = context.value('mobility.method');
    if (!method) return 'Desconocido';
    const label = method.label || method.id || 'Desconocido';
    const confidence = Number(method.confidence);
    return Number.isFinite(confidence) ? label + ' · ' + Math.round(confidence * 100) + '%' : label;
  }

  function journeyValue() {
    const journey = context.value('journey.current');
    if (!journey) return 'Sin Journey activo';
    const state = journey.state === 'paused' ? 'Pausado' : 'Activo';
    const distanceKm = Number(journey.distanceM || 0) / 1000;
    return state + ' · ' + distanceKm.toFixed(distanceKm >= 10 ? 0 : 1) + ' km';
  }

  function placeMemoryValue() {
    const place = context.value('history.currentPlace');
    if (!place) return 'Pendiente';
    const current = place.city || place.zone || place.country;
    if (!current) return 'Sin memoria';
    const labels = { assumed_new: 'asumido nuevo', new_confirmed: 'nuevo confirmado', recent_presence: 'presencia reciente', known: 'conocido por vos' };
    const status = labels[current.presenceStatus] || current.presenceStatus || 'sin historial';
    return (current.name || 'Lugar actual') + ' · ' + status + (current.seenYesterday ? ' · estuvo ayer' : '');
  }

  function shortPlaceName(value) {
    return String(value || '').replace(/^hotel\s+/i, '').replace(/\s*[-–—]\s*(adults? only|solo adultos|all[- ]inclusive.*)$/i, '').replace(/\s+/g, ' ').trim();
  }

  function currentPOIValue() {
    const current = context.value('currentPOI.value') || context.value('currentPOI.current');
    if (!current) return 'Sin POI actual';
    return shortPlaceName(textValue(current, 'POI actual')) || 'POI actual';
  }

  function nearbyValue() {
    const current = context.value('nearby.current');
    const items = current?.items || context.value('nearby.items');
    if (Array.isArray(items)) return items.length + (items.length === 1 ? ' lugar' : ' lugares');
    const status = context.value('nearby.status');
    const labels = { ready: 'Disponible', loading: 'Buscando', partial: 'Parcial', unavailable: 'No disponible', pending: 'Pendiente' };
    return labels[status] || textValue(status, 'Pendiente');
  }

  function simulationValue() {
    const value = context.value('simulation.status');
    if (value === true || value === 'active' || value === 'enabled') return 'Activada';
    if (value === false || value === 'inactive' || value === 'disabled') return 'Desactivada';
    return textValue(value, 'Desactivada');
  }

  function webVersionValue() { return textValue(context.value('app.webVersion') || context.value('app.version') || window.WanderWebVersion || window.WanderVersion, 'Pendiente'); }
  function apkVersionValue() { return textValue(context.value('app.apkVersion'), 'No disponible'); }

  const FIELDS = Object.freeze([
    { id: 'summary', label: 'Estado actual', icon: 'target', metricId: 'metric-status', value: () => textValue(context.value('context.status'), 'Preparando contexto') },
    { id: 'activity', label: 'Actividad', icon: 'route', metricId: 'metric-activity', value: activityValue },
    { id: 'time', label: 'Hora', icon: 'clock', metricId: 'metric-time', value: () => textValue(context.value('time.now'), 'Pendiente') },
    { id: 'dayPeriod', label: 'Momento del día', icon: 'day', metricId: 'metric-day-period', value: () => textValue(context.value('time.dayPeriod'), 'Pendiente') },
    { id: 'locationStatus', label: 'Ubicación', icon: 'pin', metricId: 'metric-location-status', value: () => translatedValue('location.effective.status', LOCATION_STATUS_LABELS, 'Pendiente') },
    { id: 'coordinates', label: 'Coordenadas', icon: 'pin', metricId: 'metric-coordinates', value: coordinatesValue },
    { id: 'locationSource', label: 'Fuente de ubicación', icon: 'target', metricId: 'metric-location-source', value: () => translatedValue('location.effective.source', LOCATION_SOURCE_LABELS, 'Pendiente') },
    { id: 'accuracy', label: 'Precisión', icon: 'target', metricId: 'metric-accuracy', value: () => numberValue('location.effective.accuracy', ' m') },
    { id: 'motionStatus', label: 'Movimiento físico', icon: 'route', metricId: 'metric-motion-status', value: motionStatusValue },
    { id: 'mobility', label: 'Método de desplazamiento', icon: 'compass', metricId: 'metric-mobility', value: movementMethodValue },
    { id: 'speed', label: 'Velocidad', icon: 'speed', metricId: 'metric-speed', value: () => numberValue('motion.speedKmh', ' km/h', 1) },
    { id: 'heading', label: 'Dirección', icon: 'heading', metricId: 'metric-heading', value: directionValue },
    { id: 'journey', label: 'Journey', icon: 'route', metricId: 'metric-journey', value: journeyValue },
    { id: 'country', label: 'País', icon: 'pin', metricId: 'metric-country', value: () => textValue(context.value('place.country'), 'Pendiente') },
    { id: 'place', label: 'Ciudad', icon: 'city', metricId: 'metric-place', value: () => textValue(context.value('place.city'), 'Pendiente') },
    { id: 'zone', label: 'Zona', icon: 'zone', metricId: 'metric-zone', value: () => textValue(context.value('place.zone'), 'Pendiente') },
    { id: 'placeMemory', label: 'Memoria del lugar', icon: 'brain', metricId: 'metric-place-memory', value: placeMemoryValue },
    { id: 'currentPOI', label: 'POI actual', icon: 'pin', metricId: 'metric-current-poi', value: currentPOIValue },
    { id: 'nearby', label: 'Estado Nearby', icon: 'pin', metricId: 'metric-nearby', value: nearbyValue },
    { id: 'simulation', label: 'Simulación', icon: 'flask', metricId: 'metric-simulation', value: simulationValue },
    { id: 'appVersion', label: 'Versión Web', icon: 'info', metricId: 'metric-app-version', value: webVersionValue },
    { id: 'apkVersion', label: 'Versión APK', icon: 'info', metricId: 'metric-apk-version', value: apkVersionValue },
  ].map(Object.freeze));

  const fieldIds = new Set(FIELDS.map((field) => field.id));
  let visibleFields = loadVisibleFields();

  function loadVisibleFields() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (Array.isArray(stored?.visibleFields)) return stored.visibleFields.filter((id, index, items) => fieldIds.has(id) && items.indexOf(id) === index);
    } catch {}
    return [...DEFAULT_VISIBLE_FIELDS];
  }

  function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ visibleFields })); } catch {} }
  function isVisible(fieldId) { return visibleFields.includes(fieldId); }
  function setFieldVisible(fieldId, visible) {
    if (!fieldIds.has(fieldId)) throw new Error('Unknown context dashboard field: ' + fieldId);
    const next = visibleFields.filter((id) => id !== fieldId);
    if (visible) {
      const order = FIELDS.map((field) => field.id);
      next.push(fieldId);
      next.sort((left, right) => order.indexOf(left) - order.indexOf(right));
    }
    visibleFields = next;
    persist();
    render();
    return getVisibleFields();
  }
  function getVisibleFields() { return [...visibleFields]; }
  function reset() { visibleFields = [...DEFAULT_VISIBLE_FIELDS]; persist(); render(); return getVisibleFields(); }

  function ensureDashboardItems() {
    const dashboard = document.querySelector('#context-dashboard');
    const empty = dashboard?.querySelector('[data-dashboard-empty]');
    if (!dashboard) return;
    FIELDS.forEach((field) => {
      let item = dashboard.querySelector('[data-dashboard-field="' + field.id + '"]');
      if (!item) {
        item = document.createElement('span');
        item.className = 'status-item';
        item.dataset.dashboardField = field.id;
        item.innerHTML = '<svg class="status-icon"><use href="wander-icons.svg#' + field.icon + '"></use></svg><strong id="' + field.metricId + '">—</strong>';
        dashboard.insertBefore(item, empty || null);
      }
    });
  }

  function render() {
    ensureDashboardItems();
    let shown = 0;
    document.querySelectorAll('[data-dashboard-field]').forEach((element) => {
      const visible = isVisible(element.dataset.dashboardField);
      element.hidden = !visible;
      if (visible) shown += 1;
    });
    FIELDS.forEach((field) => {
      const element = document.querySelector('#' + field.metricId);
      if (!element) return;
      const value = field.value();
      if (element.textContent !== value) element.textContent = value;
    });
    const empty = document.querySelector('[data-dashboard-empty]');
    if (empty) empty.hidden = shown > 0;
  }

  context.subscribe(render);
  window.addEventListener('wander:coordinate-format-change', render);
  render();
  window.WanderContextDashboard = Object.freeze({ storageKey: STORAGE_KEY, fields: FIELDS, getVisibleFields, isVisible, setFieldVisible, reset, render, restore: render });
})();
