(() => {
  const context = window.WanderContext;
  if (!context) return;

  const STORAGE_KEY = 'wander.contextDashboard.config.v1';
  const DEFAULT_VISIBLE_FIELDS = Object.freeze(['summary', 'speed', 'heading']);

  function textValue(value, fallback) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'object') {
      return value.name || value.label || value.displayName || fallback;
    }
    return String(value);
  }

  function placeValue() {
    return textValue(
      context.value('place.city') ||
      context.value('place.zone') ||
      context.value('place.country') ||
      context.value('place.displayName'),
      'Lugar pendiente'
    );
  }

  function currentPOIValue() {
    const value = context.value('currentPOI.value') || context.value('currentPOI.current');
    if (!value) return 'Sin POI actual';
    return textValue(value, 'POI actual');
  }

  function mobilityValue() {
    const value = context.value('mobility.mode');
    const labels = {
      walking: 'Caminando', running: 'Corriendo', cycling: 'Bicicleta', motorcycle: 'Moto',
      car: 'Auto', bus: 'Bus', train: 'Tren', boat: 'Barco', sailing: 'Navegando',
      aircraft: 'Avión', paragliding: 'Parapente', skiing: 'Esquí', horse: 'Caballo',
      stationary: 'Detenido', unknown: 'Desconocido',
    };
    return labels[value] || textValue(value, 'Desconocido');
  }

  function nearbyValue() {
    const current = context.value('nearby.current');
    const items = current?.items || context.value('nearby.items');
    if (Array.isArray(items)) return items.length + (items.length === 1 ? ' lugar' : ' lugares');
    const status = context.value('nearby.status');
    const labels = {
      ready: 'Disponible', loading: 'Buscando', partial: 'Parcial', unavailable: 'No disponible', pending: 'Pendiente',
    };
    return labels[status] || textValue(status, 'Pendiente');
  }

  function lastSuggestionValue() {
    const value = context.value('fieldGuide.lastSuggestion');
    return textValue(value, 'Sin sugerencia');
  }

  function simulationValue() {
    const value = context.value('simulation.status');
    if (value === true || value === 'active' || value === 'enabled') return 'Activada';
    if (value === false || value === 'inactive' || value === 'disabled') return 'Desactivada';
    return textValue(value, 'Desactivada');
  }

  const FIELDS = Object.freeze([
    Object.freeze({ id: 'summary', label: 'Resumen', icon: 'target', metricId: 'metric-status', value: () => context.value('context.status', 'Preparando contexto') }),
    Object.freeze({ id: 'speed', label: 'Velocidad', icon: 'speed', metricId: 'metric-speed', value: () => {
      const speed = Number(context.value('motion.speedKmh'));
      return Number.isFinite(speed) ? speed.toFixed(1) + ' km/h' : '—';
    } }),
    Object.freeze({ id: 'heading', label: 'Rumbo', icon: 'heading', metricId: 'metric-heading', value: () => {
      const heading = Number(context.value('motion.heading'));
      const moving = context.value('motion.status') === 'moving';
      return moving && Number.isFinite(heading) ? Math.round(heading) + '°' : '—';
    } }),
    Object.freeze({ id: 'currentPOI', label: 'POI actual', icon: 'pin', metricId: 'metric-current-poi', value: currentPOIValue }),
    Object.freeze({ id: 'place', label: 'Lugar / ciudad', icon: 'city', metricId: 'metric-place', value: placeValue }),
    Object.freeze({ id: 'mobility', label: 'Modo de movilidad', icon: 'compass', metricId: 'metric-mobility', value: mobilityValue }),
    Object.freeze({ id: 'accuracy', label: 'Precisión GPS', icon: 'target', metricId: 'metric-accuracy', value: () => {
      const accuracy = Number(context.value('location.effective.accuracy'));
      return Number.isFinite(accuracy) ? Math.round(accuracy) + ' m' : '—';
    } }),
    Object.freeze({ id: 'nearby', label: 'Estado Nearby', icon: 'pin', metricId: 'metric-nearby', value: nearbyValue }),
    Object.freeze({ id: 'lastSuggestion', label: 'Última sugerencia', icon: 'chat', metricId: 'metric-last-suggestion', value: lastSuggestionValue }),
    Object.freeze({ id: 'simulation', label: 'Simulación', icon: 'flask', metricId: 'metric-simulation', value: simulationValue }),
  ]);

  const fieldIds = new Set(FIELDS.map((field) => field.id));
  let visibleFields = loadVisibleFields();

  function loadVisibleFields() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (Array.isArray(stored?.visibleFields)) {
        return stored.visibleFields.filter((id, index, items) => fieldIds.has(id) && items.indexOf(id) === index);
      }
    } catch {}
    return [...DEFAULT_VISIBLE_FIELDS];
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ visibleFields }));
    } catch {}
  }

  function isVisible(fieldId) {
    return visibleFields.includes(fieldId);
  }

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
    renderControls();
    return getVisibleFields();
  }

  function getVisibleFields() {
    return [...visibleFields];
  }

  function reset() {
    visibleFields = [...DEFAULT_VISIBLE_FIELDS];
    persist();
    render();
    renderControls();
    return getVisibleFields();
  }

  function render() {
    let shown = 0;
    document.querySelectorAll('[data-dashboard-field]').forEach((element) => {
      const visible = isVisible(element.dataset.dashboardField);
      element.hidden = !visible;
      if (visible) shown += 1;
    });

    FIELDS.forEach((field) => {
      const element = document.querySelector('#' + field.metricId);
      if (element) element.textContent = field.value();
    });

    const empty = document.querySelector('[data-dashboard-empty]');
    if (empty) empty.hidden = shown > 0;
  }

  function renderControls() {
    const list = document.querySelector('#context-dashboard-fields');
    if (!list) return;
    list.innerHTML = FIELDS.map((field) => {
      const checked = isVisible(field.id) ? ' checked' : '';
      return '<label class="context-dashboard-option">' +
        '<span><svg class="section-icon" aria-hidden="true"><use href="wander-icons.svg#' + field.icon + '"></use></svg><strong>' + field.label + '</strong></span>' +
        '<input type="checkbox" data-dashboard-toggle="' + field.id + '" aria-label="Mostrar ' + field.label + '"' + checked + '>' +
        '</label>';
    }).join('');
  }

  document.querySelector('#context-dashboard-fields')?.addEventListener('change', (event) => {
    const input = event.target.closest('[data-dashboard-toggle]');
    if (!input) return;
    setFieldVisible(input.dataset.dashboardToggle, input.checked);
  });

  context.subscribe(() => render());
  render();
  renderControls();

  window.WanderContextDashboard = Object.freeze({
    storageKey: STORAGE_KEY,
    fields: FIELDS,
    getVisibleFields,
    isVisible,
    setFieldVisible,
    reset,
    render,
    renderControls,
  });
})();
