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
    ['history.currentPlace', 'Memoria del lugar', 'brain'],
  ];

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
    'nearby.status','nearby.current','nearby.items','nearby.updatedAt','nearby.diagnostics',
    'fieldGuide.candidate','fieldGuide.lastSuggestion',
    'currentPOI.status','currentPOI.value','currentPOI.alternatives','currentPOI.updatedAt',
  ];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function placeMemoryValue(place) {
    if (!place) return 'Pendiente';
    const current = place.city || place.zone || place.country;
    if (!current) return 'Sin memoria';

    const labels = {
      assumed_new: 'asumido nuevo',
      new_confirmed: 'nuevo confirmado',
      recent_presence: 'presencia reciente',
      known: 'conocido por vos',
    };
    const status = labels[current.presenceStatus] || current.presenceStatus || 'sin historial';
    const yesterday = current.seenYesterday ? ' · estuvo ayer' : '';
    return (current.name || 'Lugar actual') + ' · ' + status + yesterday;
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
    if ((key === 'journey.event' || key === 'situation.transition' || key === 'situation.placeEvent' || key === 'history.areaEvent') && entry.value?.type) return entry.value.type;
    if (key === 'history.currentPlace') return placeMemoryValue(entry.value);
    if (key === 'conversation.pendingClarification') return entry.value?.question || 'Aclaración pendiente';
    if (key === 'places.items' && Array.isArray(entry.value)) return entry.value.length + ' lugares';
    if (key === 'nearby.items' && Array.isArray(entry.value)) return entry.value.length + ' POIs';
    if (key === 'fieldGuide.lastSuggestion' && entry.value?.name) return entry.value.name;
    if (key === 'currentPOI.value' && entry.value?.name) return entry.value.name;
    if (key === 'currentPOI.alternatives' && Array.isArray(entry.value)) return entry.value.length + ' alternativas';
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
      return '<div class="context-row"><div class="context-label">' + icon(iconName) + '<strong>' + escapeHtml(label) + '</strong></div><div><b>' + escapeHtml(readableValue(key, entry)) + '</b></div></div>';
    }).join('');
  }

  function renderTechnical() {
    const list = $('#context-technical');
    if (!list) return;
    list.innerHTML = TECHNICAL.map((key) => {
      const entry = context.get(key);
      const kind = entry?.kind || 'pending';
      return '<div class="technical-row"><code>' + escapeHtml(key) + '</code><span>' + escapeHtml(readableValue(key, entry)) + ' · ' + escapeHtml(kind) + ' · ' + escapeHtml(context.statusFor(entry)) + ' · ' + escapeHtml(formatAge(entry)) + '</span></div>';
    }).join('');
  }

  function renderContextRailControls() {
    const list = $('#context-rail-field-list');
    const rail = window.WanderContextRail;
    if (!list || !rail) return;
    const config = rail.getConfig();
    const visible = new Set(config.visibleFields || []);
    list.innerHTML = rail.getFields().map((field) => {
      const checked = visible.has(field.id) ? ' checked' : '';
      return '<div class="context-rail-field-row">' +
        '<div class="context-rail-field-label">' + icon(field.icon) + '<div><strong>' + escapeHtml(field.label) + '</strong><span>' + escapeHtml(field.id) + '</span></div></div>' +
        '<label class="context-rail-toggle"><input type="checkbox" data-context-rail-field-toggle="' + escapeHtml(field.id) + '"' + checked + '><span>Mostrar</span></label>' +
      '</div>';
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
    renderContextRailControls();
    syncSummary();
  }

  $('#refresh-context-button')?.addEventListener('click', () => {
    context.updateTime();
    window.WanderProviders?.place?.refresh?.(true);
    render();
  });

  $('#context-rail-field-list')?.addEventListener('change', (event) => {
    const input = event.target.closest('[data-context-rail-field-toggle]');
    if (!input) return;
    window.WanderContextRail?.toggleField(input.dataset.contextRailFieldToggle, input.checked);
    renderContextRailControls();
  });

  document.addEventListener('wander:context-rail-config', renderContextRailControls);
  context.subscribe(render);
  render();
  setInterval(render, 15000);

  window.WanderContextPanel = { render, syncSummary, renderContextRailControls };
})();
