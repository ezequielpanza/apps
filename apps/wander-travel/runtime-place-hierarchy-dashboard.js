(() => {
  const context = window.WanderContext;
  const base = window.WanderContextDashboard;
  if (!context || !base || window.WanderPlaceHierarchyDashboard) return;

  const STORAGE_KEY = base.storageKey || 'wander.contextDashboard.config.v1';

  function text(value, fallback = 'Pendiente') {
    if (value == null || value === '') return fallback;
    if (typeof value === 'object') return String(value.name || value.label || value.displayName || fallback);
    return String(value);
  }

  function currentPlaceValue() {
    const hierarchy = context.value('placeHierarchy.current');
    return text(hierarchy?.current || hierarchy, 'Sin lugar definido');
  }

  function percent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${Math.round(number * 100)}%` : 'Pendiente';
  }

  const EXTRA_FIELDS = Object.freeze([
    { id: 'currentPlace', label: 'Lugar actual', icon: 'pin', metricId: 'metric-current-place', value: currentPlaceValue },
    { id: 'specificPlace', label: 'POI específico', icon: 'target', metricId: 'metric-specific-place', value: () => text(context.value('placeHierarchy.specific'), 'Sin POI específico') },
    { id: 'containerPlace', label: 'Contenedor', icon: 'zone', metricId: 'metric-container-place', value: () => text(context.value('placeHierarchy.container'), 'Sin contenedor') },
    { id: 'placeConfidence', label: 'Confianza del lugar', icon: 'brain', metricId: 'metric-place-confidence', value: () => percent(context.value('placeHierarchy.confidence')) },
    { id: 'placeSource', label: 'Fuente del lugar', icon: 'info', metricId: 'metric-place-source', value: () => text(context.value('placeHierarchy.source'), 'Pendiente') },
  ].map(Object.freeze));

  const fields = Object.freeze([...base.fields, ...EXTRA_FIELDS]);
  const knownIds = new Set(fields.map((field) => field.id));

  function readConfig() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {};
      const visibleFields = Array.isArray(stored.visibleFields)
        ? stored.visibleFields.filter((id, index, items) => knownIds.has(id) && items.indexOf(id) === index)
        : base.getVisibleFields();
      const fieldOrder = Array.isArray(stored.fieldOrder)
        ? stored.fieldOrder.filter((id, index, items) => knownIds.has(id) && items.indexOf(id) === index)
        : fields.map((field) => field.id);
      for (const field of fields) if (!fieldOrder.includes(field.id)) fieldOrder.push(field.id);
      return { visibleFields, fieldOrder };
    } catch {
      return { visibleFields: base.getVisibleFields(), fieldOrder: fields.map((field) => field.id) };
    }
  }

  let config = readConfig();

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch {}
  }

  function ensureItems() {
    const dashboard = document.querySelector('#context-dashboard');
    const empty = dashboard?.querySelector('[data-dashboard-empty]');
    if (!dashboard) return;
    for (const field of EXTRA_FIELDS) {
      let item = dashboard.querySelector(`[data-dashboard-field="${field.id}"]`);
      if (!item) {
        item = document.createElement('span');
        item.className = 'status-item';
        item.dataset.dashboardField = field.id;
        item.innerHTML = `<svg class="status-icon"><use href="wander-icons.svg#${field.icon}"></use></svg><strong id="${field.metricId}">—</strong>`;
        dashboard.insertBefore(item, empty || null);
      }
    }
  }

  function render() {
    base.render();
    ensureItems();
    const dashboard = document.querySelector('#context-dashboard');
    if (!dashboard) return;

    for (const field of EXTRA_FIELDS) {
      const metric = document.querySelector(`#${field.metricId}`);
      if (metric) metric.textContent = field.value();
    }

    const visible = new Set(config.visibleFields);
    dashboard.querySelectorAll('[data-dashboard-field]').forEach((item) => {
      item.hidden = !visible.has(item.dataset.dashboardField);
    });
    const empty = dashboard.querySelector('[data-dashboard-empty]');
    if (empty) empty.hidden = config.visibleFields.length > 0;
  }

  function setFieldVisible(fieldId, visible) {
    if (!knownIds.has(fieldId)) throw new Error(`Unknown context dashboard field: ${fieldId}`);
    config.visibleFields = config.visibleFields.filter((id) => id !== fieldId);
    if (visible) config.visibleFields.push(fieldId);
    persist();
    render();
    return getVisibleFields();
  }

  function isVisible(fieldId) {
    return config.visibleFields.includes(fieldId);
  }

  function getVisibleFields() {
    return config.fieldOrder.filter((id) => config.visibleFields.includes(id));
  }

  function reset() {
    config = { visibleFields: ['summary', 'speed', 'heading'], fieldOrder: fields.map((field) => field.id) };
    persist();
    render();
    return getVisibleFields();
  }

  window.WanderContextDashboard = Object.freeze({
    ...base,
    storageKey: STORAGE_KEY,
    fields,
    getVisibleFields,
    isVisible,
    setFieldVisible,
    reset,
    render,
    restore: render,
  });

  window.WanderPlaceHierarchyDashboard = Object.freeze({ fields: EXTRA_FIELDS, render });
  context.subscribe(render);
  render();
})();
