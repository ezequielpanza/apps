(() => {
  const base = window.WanderContextDashboard;
  const list = document.querySelector('#context-list');
  const dashboardElement = document.querySelector('#context-dashboard');
  if (!base || !list || !dashboardElement) return;

  const STORAGE_KEY = base.storageKey || 'wander.contextDashboard.config.v1';
  const canonicalOrder = base.fields.map((field) => field.id);
  let decorating = false;
  let observer = null;

  function uniqueKnown(values) {
    const result = [];
    for (const id of Array.isArray(values) ? values : []) {
      if (canonicalOrder.includes(id) && !result.includes(id)) result.push(id);
    }
    return result;
  }

  function readConfig() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {};
      const fieldOrder = uniqueKnown(stored.fieldOrder);
      for (const id of canonicalOrder) if (!fieldOrder.includes(id)) fieldOrder.push(id);
      return {
        visibleFields: Array.isArray(stored.visibleFields) ? uniqueKnown(stored.visibleFields) : base.getVisibleFields(),
        fieldOrder,
      };
    } catch {
      return { visibleFields: base.getVisibleFields(), fieldOrder: [...canonicalOrder] };
    }
  }

  let config = readConfig();

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        visibleFields: config.visibleFields,
        fieldOrder: config.fieldOrder,
      }));
    } catch {}
  }

  function isVisible(fieldId) {
    return config.visibleFields.includes(fieldId);
  }

  function getVisibleFields() {
    return config.fieldOrder.filter((id) => config.visibleFields.includes(id));
  }

  function getFieldOrder() {
    return [...config.fieldOrder];
  }

  function renderDashboard() {
    base.render();
    const empty = dashboardElement.querySelector('[data-dashboard-empty]');
    for (const fieldId of config.fieldOrder) {
      const item = dashboardElement.querySelector('[data-dashboard-field="' + fieldId + '"]');
      if (!item) continue;
      item.hidden = !isVisible(fieldId);
      dashboardElement.insertBefore(item, empty || null);
    }
    if (empty) empty.hidden = getVisibleFields().length > 0;
  }

  function setFieldVisible(fieldId, visible) {
    if (!canonicalOrder.includes(fieldId)) throw new Error('Unknown context dashboard field: ' + fieldId);
    base.setFieldVisible(fieldId, visible);
    config.visibleFields = config.visibleFields.filter((id) => id !== fieldId);
    if (visible) config.visibleFields.push(fieldId);
    persist();
    renderDashboard();
    decorateRows();
    return getVisibleFields();
  }

  function moveField(fieldId, direction) {
    const index = config.fieldOrder.indexOf(fieldId);
    const delta = direction === 'up' || direction === -1 ? -1 : direction === 'down' || direction === 1 ? 1 : 0;
    const nextIndex = index + delta;
    if (index < 0 || !delta || nextIndex < 0 || nextIndex >= config.fieldOrder.length) return false;
    const next = [...config.fieldOrder];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    config.fieldOrder = next;
    persist();
    renderDashboard();
    decorateRows();
    return true;
  }

  function reset() {
    base.reset();
    config = { visibleFields: ['summary', 'speed', 'heading'], fieldOrder: [...canonicalOrder] };
    persist();
    renderDashboard();
    decorateRows();
    return getVisibleFields();
  }

  window.WanderContextDashboard = Object.freeze({
    ...base,
    getVisibleFields,
    getFieldOrder,
    isVisible,
    setFieldVisible,
    moveField,
    reset,
    render: renderDashboard,
    restore: renderDashboard,
  });

  function rowFieldId(row) {
    return row.querySelector('[data-dashboard-inline-toggle]')?.dataset.dashboardInlineToggle || null;
  }

  function orderControls(fieldId) {
    const index = config.fieldOrder.indexOf(fieldId);
    const upDisabled = index <= 0 ? ' disabled' : '';
    const downDisabled = index < 0 || index >= config.fieldOrder.length - 1 ? ' disabled' : '';
    return '<span class="context-field-order" aria-label="Orden del campo">' +
      '<button type="button" data-field-order="up" data-field-id="' + fieldId + '" aria-label="Subir campo"' + upDisabled + '>↑</button>' +
      '<button type="button" data-field-order="down" data-field-id="' + fieldId + '" aria-label="Bajar campo"' + downDisabled + '>↓</button>' +
      '</span>';
  }

  function observeRows() {
    observer?.observe(list, { childList: true, subtree: true });
  }

  function decorateRows() {
    if (decorating) return;
    decorating = true;
    observer?.disconnect();
    try {
      const rows = Array.from(list.querySelectorAll('.context-row'));
      const byId = new Map();
      const withoutId = [];
      for (const row of rows) {
        const fieldId = rowFieldId(row);
        if (fieldId) byId.set(fieldId, row);
        else withoutId.push(row);
      }

      for (const fieldId of config.fieldOrder) {
        const row = byId.get(fieldId);
        if (!row) continue;
        row.querySelector('.context-field-order')?.remove();
        row.insertAdjacentHTML('beforeend', orderControls(fieldId));
        list.appendChild(row);
      }
      for (const row of withoutId) list.appendChild(row);
    } finally {
      decorating = false;
      observeRows();
    }
  }

  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-field-order]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    moveField(button.dataset.fieldId, button.dataset.fieldOrder);
  });

  observer = new MutationObserver(() => {
    if (!decorating) queueMicrotask(decorateRows);
  });
  observeRows();

  renderDashboard();
  decorateRows();
})();