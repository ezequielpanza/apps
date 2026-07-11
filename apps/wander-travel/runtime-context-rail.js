(() => {
  const context = window.WanderContext;
  if (!context) return;

  const STORAGE_KEY = 'wander.contextRail.config.v1';
  const DEFAULT_VISIBLE_FIELDS = Object.freeze(['summary', 'speed', 'heading']);
  const $ = (selector) => document.querySelector(selector);

  function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function mobilityLabel(value) {
    const labels = {
      unknown: 'Modo —',
      walking: 'A pie',
      running: 'Corriendo',
      cycling: 'Bici',
      motorcycle: 'Moto',
      car: 'Auto',
      bus: 'Bus',
      train: 'Tren',
      boat: 'Barco',
      sailing: 'Navegando',
      aircraft: 'Vuelo',
    };
    return labels[value] || String(value || 'Modo —');
  }

  function nearbyStatusLabel(value) {
    const labels = {
      pending: 'Nearby pendiente',
      searching: 'Buscando cerca',
      available: 'Nearby listo',
      available_partial: 'Nearby parcial',
      empty: 'Sin POIs cerca',
      unavailable: 'Nearby no disponible',
    };
    return labels[value] || String(value || 'Nearby —');
  }

  function simulationLabel(value) {
    if (value === true || value === 'active' || value === 'enabled') return 'SIM activa';
    if (value === false || value === 'inactive' || value === 'disabled') return 'SIM off';
    return value ? String(value) : 'SIM off';
  }

  function placeLabel() {
    const memory = context.value('history.currentPlace');
    const current = memory?.city || memory?.zone || memory?.country;
    if (current?.name) return current.name;

    const place = context.value('place.current');
    if (!place || typeof place !== 'object') return 'Lugar —';
    return place.displayName || place.city || place.zone || place.region || place.country || 'Lugar —';
  }

  function currentPOILabel() {
    const status = context.value('currentPOI.status', null);
    const value = context.value('currentPOI.value', null) || context.value('currentPOI.current', null);
    const name = value?.name || value?.label || null;
    if (!name) {
      if (status === 'ambiguous') return 'Varios lugares cerca';
      if (status === 'possible') return 'POI posible';
      return 'Sin POI actual';
    }
    if (status === 'confirmed') return `En ${name}`;
    if (status === 'possible') return `Posible: ${name}`;
    if (status === 'leaving') return `Saliendo de ${name}`;
    return name;
  }

  const FIELD_DEFINITIONS = Object.freeze([
    Object.freeze({
      id: 'summary',
      label: 'Resumen',
      icon: 'target',
      read: () => context.value('context.status', 'Preparando contexto') || 'Preparando contexto',
    }),
    Object.freeze({
      id: 'speed',
      label: 'Velocidad',
      icon: 'speed',
      read: () => {
        const speed = finiteNumber(context.value('motion.speedKmh'));
        return speed === null ? '—' : `${speed.toFixed(1)} km/h`;
      },
    }),
    Object.freeze({
      id: 'heading',
      label: 'Rumbo',
      icon: 'heading',
      read: () => {
        const heading = finiteNumber(context.value('motion.heading'));
        const moving = context.value('motion.status') === 'moving';
        return moving && heading !== null ? `${Math.round(heading)}°` : '—';
      },
    }),
    Object.freeze({ id: 'currentPOI', label: 'POI actual', icon: 'pin', read: currentPOILabel }),
    Object.freeze({ id: 'place', label: 'Lugar / ciudad', icon: 'city', read: placeLabel }),
    Object.freeze({ id: 'mobility', label: 'Modo de movilidad', icon: 'compass', read: () => mobilityLabel(context.value('mobility.mode', 'unknown')) }),
    Object.freeze({
      id: 'accuracy',
      label: 'Precisión GPS',
      icon: 'target',
      read: () => {
        const accuracy = finiteNumber(context.value('location.effective.accuracy'));
        return accuracy === null ? 'GPS —' : `GPS ${Math.round(accuracy)} m`;
      },
    }),
    Object.freeze({ id: 'nearbyStatus', label: 'Nearby status', icon: 'layers', read: () => nearbyStatusLabel(context.value('nearby.status', null)) }),
    Object.freeze({
      id: 'lastSuggestion',
      label: 'Última sugerencia',
      icon: 'chat',
      read: () => {
        const suggestion = context.value('fieldGuide.lastSuggestion');
        return suggestion?.name ? `Última: ${suggestion.name}` : 'Sin sugerencia';
      },
    }),
    Object.freeze({ id: 'simulation', label: 'Simulación', icon: 'flask', read: () => simulationLabel(context.value('simulation.status', false)) }),
  ]);

  const FIELD_BY_ID = new Map(FIELD_DEFINITIONS.map((field) => [field.id, field]));

  function validFields(fields) {
    return [...new Set((Array.isArray(fields) ? fields : []).map(String))].filter((id) => FIELD_BY_ID.has(id));
  }

  function loadConfig() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      const visibleFields = validFields(stored?.visibleFields);
      if (stored?.version === 1) return { version: 1, visibleFields };
    } catch {}
    return { version: 1, visibleFields: [...DEFAULT_VISIBLE_FIELDS] };
  }

  let config = loadConfig();

  function saveConfig() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch {}
  }

  function getConfig() {
    return { version: 1, visibleFields: [...config.visibleFields] };
  }

  function getFields() {
    return FIELD_DEFINITIONS.map((field) => ({ id: field.id, label: field.label, icon: field.icon }));
  }

  function setVisibleFields(fields) {
    config = { version: 1, visibleFields: validFields(fields) };
    saveConfig();
    render();
    document.dispatchEvent(new CustomEvent('wander:context-rail-config', { detail: getConfig() }));
    return getConfig();
  }

  function toggleField(fieldId, visible = null) {
    const id = String(fieldId || '');
    if (!FIELD_BY_ID.has(id)) return getConfig();
    const current = new Set(config.visibleFields);
    const shouldShow = visible === null ? !current.has(id) : Boolean(visible);
    if (shouldShow) current.add(id);
    else current.delete(id);
    return setVisibleFields(Array.from(current));
  }

  function fieldHtml(field) {
    let value = '—';
    try { value = field.read(); } catch {}
    return '<span class="context-rail-item" data-context-rail-field="' + escapeHtml(field.id) + '" title="' + escapeHtml(field.label) + '">' +
      '<svg class="status-icon" aria-hidden="true"><use href="wander-icons.svg#' + escapeHtml(field.icon) + '"></use></svg>' +
      '<strong>' + escapeHtml(value || '—') + '</strong>' +
    '</span>';
  }

  function render() {
    const rail = $('#context-rail');
    if (!rail) return;
    const fields = config.visibleFields.map((id) => FIELD_BY_ID.get(id)).filter(Boolean);
    rail.innerHTML = fields.length
      ? fields.map(fieldHtml).join('')
      : '<span class="context-rail-item context-rail-empty"><svg class="status-icon" aria-hidden="true"><use href="wander-icons.svg#brain"></use></svg><strong>Contexto</strong></span>';
    rail.setAttribute('aria-label', 'Abrir resumen de contexto');
  }

  function openContextPanel() {
    window.WanderScreen?.open?.('context');
  }

  const rail = $('#context-rail');
  rail?.addEventListener('click', openContextPanel);

  context.subscribe(render);
  render();

  window.WanderContextRail = Object.freeze({
    storageKey: STORAGE_KEY,
    defaultVisibleFields: [...DEFAULT_VISIBLE_FIELDS],
    getFields,
    getConfig,
    setVisibleFields,
    toggleField,
    render,
  });
})();
