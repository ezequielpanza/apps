(() => {
  const context = window.WanderContext;
  if (!context || window.WanderPlaceHierarchyPanel) return;

  const FIELD_IDS = Object.freeze(['currentPlace', 'specificPlace', 'containerPlace', 'placeConfidence', 'placeSource']);
  const TECHNICAL_KEYS = Object.freeze([
    'placeHierarchy.status',
    'placeHierarchy.current',
    'placeHierarchy.personal',
    'placeHierarchy.specific',
    'placeHierarchy.container',
    'placeHierarchy.zone',
    'placeHierarchy.city',
    'placeHierarchy.country',
    'placeHierarchy.path',
    'placeHierarchy.confidence',
    'placeHierarchy.source',
    'placeHierarchy.diagnostics',
  ]);

  let queued = false;

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function dashboard() {
    return window.WanderContextDashboard;
  }

  function fieldRow(field) {
    const checked = dashboard()?.isVisible?.(field.id) ? ' checked' : '';
    return '<div class="context-row has-dashboard-toggle" data-place-hierarchy-field="' + field.id + '">' +
      '<div class="context-label">' +
        '<label class="context-dashboard-inline-toggle" title="Mostrar en el dashboard">' +
          '<input type="checkbox" data-dashboard-inline-toggle="' + field.id + '" aria-label="Mostrar ' + escapeHtml(field.label) + ' en el dashboard"' + checked + '>' +
          '<span aria-hidden="true"></span>' +
        '</label>' +
        '<svg class="section-icon" aria-hidden="true"><use href="wander-icons.svg#' + field.icon + '"></use></svg>' +
        '<strong>' + escapeHtml(field.label) + '</strong>' +
      '</div>' +
      '<div class="context-row-value"><b>' + escapeHtml(field.value()) + '</b></div>' +
    '</div>';
  }

  function ensureHumanRows() {
    const list = document.querySelector('#context-list');
    const fields = dashboard()?.fields || [];
    if (!list) return;

    for (const fieldId of FIELD_IDS) {
      if (list.querySelector(`[data-dashboard-inline-toggle="${fieldId}"]`)) continue;
      const field = fields.find((candidate) => candidate.id === fieldId);
      if (field) list.insertAdjacentHTML('beforeend', fieldRow(field));
    }
  }

  function readable(value) {
    if (value == null || value === '') return 'Pendiente';
    if (typeof value === 'object') {
      if (value.name || value.label) return String(value.name || value.label);
      try { return JSON.stringify(value); } catch { return '[objeto]'; }
    }
    return String(value);
  }

  function technicalRow(key) {
    const entry = context.get(key);
    const kind = entry?.kind || 'pending';
    const status = context.statusFor?.(entry) || 'pending';
    return '<div class="technical-row" data-place-hierarchy-technical="' + key + '">' +
      '<code>' + key + '</code><span>' + escapeHtml(readable(entry?.value)) + ' · ' + escapeHtml(kind) + ' · ' + escapeHtml(status) + '</span>' +
    '</div>';
  }

  function ensureTechnicalRows() {
    const list = document.querySelector('#context-technical');
    if (!list) return;
    for (const key of TECHNICAL_KEYS) {
      if (list.querySelector(`[data-place-hierarchy-technical="${key}"]`)) continue;
      list.insertAdjacentHTML('beforeend', technicalRow(key));
    }
  }

  function diagnosticCandidate(candidate) {
    const selected = candidate.selected ? ' · seleccionado' : '';
    const distance = Number.isFinite(Number(candidate.distanceM)) ? ` · ${Math.round(candidate.distanceM)} m` : '';
    return '<div class="technical-row">' +
      '<code>#' + candidate.rank + ' ' + escapeHtml(candidate.kind) + '</code>' +
      '<span><strong>' + escapeHtml(candidate.name) + '</strong> · ' + escapeHtml(candidate.source) + ' · score ' + escapeHtml(candidate.score) + distance + selected + '</span>' +
    '</div>';
  }

  function renderDiagnosticsCard() {
    const panel = document.querySelector('#context-panel');
    const firstCard = panel?.querySelector('.screen-card');
    if (!panel || !firstCard) return;

    let card = document.querySelector('#place-hierarchy-diagnostics-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'place-hierarchy-diagnostics-card';
      card.className = 'screen-card panel-block';
      firstCard.insertAdjacentElement('afterend', card);
    }

    const diagnostics = context.value('placeHierarchy.diagnostics');
    const current = context.value('placeHierarchy.current');
    const hierarchy = context.value('placeHierarchy.current') ? context.value('placeHierarchy.current') : null;
    const selected = hierarchy?.current || current;
    const candidates = Array.isArray(diagnostics?.candidates) ? diagnostics.candidates : [];
    const reasonLabels = {
      highest_score: 'Mayor puntuación',
      continuity_margin: 'Se mantuvo el lugar anterior por estabilidad',
      challenger_exceeded_margin: 'Un candidato superó el margen de cambio',
      no_candidate: 'Sin candidatos cercanos',
    };

    card.innerHTML = '<h3><svg class="section-icon"><use href="wander-icons.svg#target"></use></svg>Diagnóstico de lugar</h3>' +
      '<p class="panel-note">La decisión actual y los principales candidatos evaluados por Wander.</p>' +
      '<div class="context-list">' +
        '<div class="context-row"><div class="context-label"><strong>Seleccionado</strong></div><div class="context-row-value"><b>' + escapeHtml(selected?.name || 'Pendiente') + '</b></div></div>' +
        '<div class="context-row"><div class="context-label"><strong>Motivo</strong></div><div class="context-row-value"><b>' + escapeHtml(reasonLabels[diagnostics?.selectionReason] || diagnostics?.selectionReason || 'Pendiente') + '</b></div></div>' +
        '<div class="context-row"><div class="context-label"><strong>Precisión GPS</strong></div><div class="context-row-value"><b>' + escapeHtml(diagnostics?.location?.accuracyM != null ? `${diagnostics.location.accuracyM} m` : 'Pendiente') + '</b></div></div>' +
      '</div>' +
      '<details class="technical-details"' + (candidates.length ? '' : ' hidden') + '><summary>Candidatos (' + candidates.length + ')</summary><div class="technical-list">' + candidates.slice(0, 8).map(diagnosticCandidate).join('') + '</div></details>';
  }

  function render() {
    ensureHumanRows();
    ensureTechnicalRows();
    renderDiagnosticsCard();
  }

  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      render();
    });
  }

  context.subscribe(schedule);
  const list = document.querySelector('#context-list');
  list?.addEventListener('change', (event) => {
    const input = event.target.closest('[data-dashboard-inline-toggle]');
    if (!input || !FIELD_IDS.includes(input.dataset.dashboardInlineToggle)) return;
    dashboard()?.setFieldVisible?.(input.dataset.dashboardInlineToggle, input.checked);
    schedule();
  });

  const observer = new MutationObserver(schedule);
  const panel = document.querySelector('#context-panel');
  if (panel) observer.observe(panel, { childList: true, subtree: true });

  window.WanderPlaceHierarchyPanel = Object.freeze({ render, fieldIds: FIELD_IDS });
  render();
})();
