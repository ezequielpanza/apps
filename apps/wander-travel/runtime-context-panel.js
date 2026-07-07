(() => {
  const context = window.WanderContext;
  if (!context) return;

  const $ = (selector) => document.querySelector(selector);
  const icon = (name) => '<svg class="section-icon" aria-hidden="true"><use href="wander-icons.svg#' + name + '"></use></svg>';

  const HUMAN = [
    ['context.status', 'Estado actual', 'target'],
    ['context.activity', 'Actividad', 'route'],
    ['time.now', 'Hora', 'clock'],
    ['time.dayPeriod', 'Momento del día', 'day'],
    ['location.effective.status', 'Ubicación', 'pin'],
    ['location.effective.source', 'Fuente de ubicación', 'target'],
    ['location.effective.accuracy', 'Precisión', 'target'],
    ['motion.status', 'Movimiento físico', 'route'],
    ['mobility.mode', 'Modo de movilidad', 'compass'],
    ['motion.speedKmh', 'Velocidad', 'speed'],
    ['motion.heading', 'Rumbo', 'heading'],
    ['journey.current', 'Journey', 'route'],
    ['place.country', 'País', 'pin'],
    ['place.city', 'Ciudad', 'city'],
    ['place.zone', 'Zona', 'zone'],
    ['history.currentArea', 'Memoria de zona', 'brain'],
  ];

  const TECHNICAL = [
    'app.version','simulation.status','context.status','context.activity','time.now','time.dayPeriod',
    'location.real.status','location.real.lat','location.real.lng','location.real.accuracy','location.real.altitude','location.real.heading','location.real.speedMps','location.real.updatedAt','location.real.source',
    'location.override.enabled','location.override.status','location.override.lat','location.override.lng','location.override.accuracy','location.override.altitude','location.override.heading','location.override.speedMps','location.override.updatedAt','location.override.source',
    'location.effective.status','location.effective.lat','location.effective.lng','location.effective.accuracy','location.effective.altitude','location.effective.heading','location.effective.speedMps','location.effective.updatedAt','location.effective.source',
    'motion.status','motion.speedKmh','motion.heading',
    'mobility.mode','mobility.evidence','mobility.override.mode','mobility.provider.mode','mobility.provider.confidence',
    'journey.current','journey.event','situation.transition',
    'place.status','place.current','place.country','place.countryCode','place.countryId','place.region','place.regionId',
    'place.city','place.cityId','place.district','place.districtId','place.neighborhood','place.neighborhoodId',
    'place.zone','place.zoneId','place.type','place.displayName','place.source','place.sourceRef','place.resolvedLat','place.resolvedLng','place.updatedAt','place.attribution',
    'history.currentArea','history.areaEvent','environment.weatherStatus','places.items',
  ];

  function areaMemoryValue(area) {
    if (!area) return 'Pendiente';
    const placeLabels = {
      unexplored: 'Lugar no recorrido',
      first_visit: 'Primera visita real',
      returning: 'Lugar visitado antes',
      familiar: 'Lugar familiar',
      frequent: 'Lugar frecuente',
    };
    const routeLabels = {
      route_new: 'ruta nueva',
      route_returning: 'ruta ya transitada',
      route_familiar: 'ruta familiar',
      route_frequent: 'ruta frecuente',
    };
    const place = placeLabels[area.placeFamiliarity] || area.placeFamiliarity || 'Lugar desconocido';
    const route = routeLabels[area.routeFamiliarity] || area.routeFamiliarity;
    return route ? place + ' · ' + route : place;
  }

  function journeyValue(journey) {
    if (!journey) return 'Sin Journey activo';
    const state = journey.state === 'paused' ? 'Pausado' : 'Activo';
    const distanceKm = Number(journey.distanceM || 0) / 1000;
    return state + ' · ' + distanceKm.toFixed(distanceKm >= 10 ? 0 : 1) + ' km';
  }

  function mobilityValue(value) {
    if (!value || value === 'unknown') return 'Desconocido';
    return String(value);
  }

  function placeStatusValue(value) {
    const labels = {
      pending: 'Pendiente',
      resolving: 'Resolviendo',
      available: 'Disponible',
      unavailable: 'No disponible',
    };
    return labels[value] || String(value || 'Pendiente');
  }

  function readableValue(key, entry) {
    if (!entry) return 'Pendiente';
    if (key.endsWith('.accuracy')) return Number(entry.value).toFixed(0) + ' m';
    if (key.endsWith('.speedMps')) return (Number(entry.value) * 3.6).toFixed(1) + ' km/h';
    if (key.endsWith('.heading') || key === 'motion.heading') return Number.isFinite(Number(entry.value)) ? Math.round(Number(entry.value)) + '°' : '—';
    if (key === 'motion.speedKmh') return Number(entry.value || 0).toFixed(1) + ' km/h';
    if (key === 'mobility.mode') return mobilityValue(entry.value);
    if (key === 'mobility.evidence' && Array.isArray(entry.value)) return entry.value.join(', ') || 'Sin evidencia';
    if (key === 'journey.current') return journeyValue(entry.value);
    if (key === 'place.status') return placeStatusValue(entry.value);
    if ((key === 'journey.event' || key === 'situation.transition' || key === 'history.areaEvent') && entry.value?.type) return entry.value.type;
    if (key === 'history.currentArea') return areaMemoryValue(entry.value);
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

  function renderHuman() {
    const list = $('#context-list');
    if (!list) return;
    list.innerHTML = HUMAN.map(([key, label, iconName]) => {
      const entry = context.get(key);
      return '<div class="context-row"><div class="context-label">' + icon(iconName) + '<strong>' + label + '</strong></div><div><b>' + readableValue(key, entry) + '</b></div></div>';
    }).join('');
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

  function render() {
    renderHuman();
    renderTechnical();
    syncSummary();
  }

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
