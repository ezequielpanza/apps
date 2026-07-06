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
    ['motion.mode', 'Modo de movimiento', 'compass'],
    ['motion.speedKmh', 'Velocidad', 'speed'],
    ['motion.heading', 'Rumbo', 'heading'],
    ['history.currentArea', 'Memoria de zona', 'brain'],
    ['place.city', 'Ciudad', 'city'],
    ['place.zone', 'Zona', 'zone'],
  ];

  const TECHNICAL = [
    'app.version','simulation.status','context.status','context.activity','time.now','time.dayPeriod',
    'location.real.status','location.real.lat','location.real.lng','location.real.accuracy','location.real.altitude','location.real.heading','location.real.speedMps','location.real.updatedAt','location.real.source',
    'location.override.enabled','location.override.status','location.override.lat','location.override.lng','location.override.accuracy','location.override.altitude','location.override.heading','location.override.speedMps','location.override.updatedAt','location.override.source',
    'location.effective.status','location.effective.lat','location.effective.lng','location.effective.accuracy','location.effective.altitude','location.effective.heading','location.effective.speedMps','location.effective.updatedAt','location.effective.source',
    'motion.status','motion.mode','motion.speedKmh','motion.heading','situation.transition','history.currentArea','environment.weatherStatus','place.city','place.zone','places.items',
  ];

  function relativeVisit(value) {
    const at = Date.parse(value || '');
    if (!Number.isFinite(at)) return null;
    const deltaMs = Math.max(0, Date.now() - at);
    const hours = Math.round(deltaMs / 3600000);
    if (hours < 1) return 'hace menos de una hora';
    if (hours < 24) return 'hace ' + hours + ' h';
    const days = Math.round(hours / 24);
    if (days < 60) return 'hace ' + days + ' días';
    const months = Math.round(days / 30);
    return 'hace ' + months + ' meses';
  }

  function areaMemoryValue(area) {
    if (!area) return 'Pendiente';
    const labels = {
      first_visit: 'Primera visita a esta zona',
      returning: 'Ya estuviste en esta zona',
      familiar: 'Zona familiar',
      frequent: 'Zona frecuente',
    };
    const label = labels[area.familiarity] || area.familiarity || 'Zona conocida';
    const previous = relativeVisit(area.previousVisitAt);
    return previous ? label + ' · ' + previous : label;
  }

  function readableValue(key, entry) {
    if (!entry) return 'Pendiente';
    if (key.endsWith('.accuracy')) return Number(entry.value).toFixed(0) + ' m';
    if (key.endsWith('.speedMps')) return (Number(entry.value) * 3.6).toFixed(1) + ' km/h';
    if (key.endsWith('.heading') || key === 'motion.heading') return Number.isFinite(Number(entry.value)) ? Math.round(Number(entry.value)) + '°' : '—';
    if (key === 'motion.speedKmh') return Number(entry.value || 0).toFixed(1) + ' km/h';
    if (key === 'situation.transition' && entry.value?.type) return entry.value.type;
    if (key === 'history.currentArea') return areaMemoryValue(entry.value);
    if (key === 'places.items' && Array.isArray(entry.value)) return entry.value.length + ' lugares';
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
    render();
  });

  context.subscribe(render);
  render();
  setInterval(render, 15000);

  window.WanderContextPanel = { render, syncSummary };
})();
