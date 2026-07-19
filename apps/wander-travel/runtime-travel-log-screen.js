(() => {
  if (window.WanderTravelLogScreen) return;

  const log = window.WanderTravelLog;
  if (!log) return;

  let activeTab = 'today';
  let initialized = false;
  let screen = null;

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function localDateTimeInput(date = new Date()) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function dateLabel(day) {
    const date = new Date(`${day}T12:00:00`);
    const today = log.dayKey();
    const yesterday = log.dayKey(Date.now() - 24 * 60 * 60 * 1000);
    if (day === today) return 'Hoy';
    if (day === yesterday) return 'Ayer';
    return date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: day.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' });
  }

  function timeLabel(value) {
    return new Date(value).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  function statusLabel(status) {
    return {
      suggested: 'Sugerido',
      planned: 'Planeado',
      confirmed: 'Confirmado',
      completed: 'Realizado',
      cancelled: 'Cancelado',
      postponed: 'Pospuesto',
    }[status] || status;
  }

  function kindLabel(kind) {
    return {
      conversation: 'Conversación',
      decision: 'Decisión',
      place: 'Lugar',
      context: 'Contexto',
      weather: 'Clima',
      plan: 'Plan',
      note: 'Nota',
      'session-link': 'Recorrido',
      'conversation-status': 'Conversación',
    }[kind] || 'Memoria';
  }

  function ensureShell() {
    if (initialized) return true;
    const app = document.querySelector('.wander-app');
    const menuGroup = document.querySelector('#main-menu .drawer-group');
    if (!app || !menuGroup) return false;

    if (!menuGroup.querySelector('[data-screen-target="travel-log"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.screenTarget = 'travel-log';
      button.innerHTML = '<svg class="nav-icon"><use href="wander-icons.svg#route"></use></svg><span>Bitácora</span>';
      const routesButton = menuGroup.querySelector('[data-screen-target="routes"]');
      menuGroup.insertBefore(button, routesButton || null);
    }

    screen = document.querySelector('[data-app-screen="travel-log"]');
    if (!screen) {
      screen = document.createElement('section');
      screen.className = 'app-screen';
      screen.dataset.appScreen = 'travel-log';
      screen.hidden = true;
      screen.innerHTML = `
        <header class="app-screen-header">
          <button class="screen-close" type="button" data-close-screen aria-label="Cerrar Bitácora"><svg class="ui-icon"><use href="wander-icons.svg#close"></use></svg></button>
          <h1>Bitácora de viaje</h1><span></span>
        </header>
        <div class="app-screen-scroll"><div class="screen-content"><section class="panel-section">
          <div class="travel-log-tabs" role="tablist" aria-label="Vistas de la bitácora">
            <button class="travel-log-tab is-active" type="button" data-log-tab="today">Hoy</button>
            <button class="travel-log-tab" type="button" data-log-tab="upcoming">Próximamente</button>
            <button class="travel-log-tab" type="button" data-log-tab="history">Historial</button>
          </div>
          <div class="travel-log-summary" id="travel-log-summary"></div>
          <div class="travel-log-toolbar">
            <button type="button" id="travel-log-note-button">Agregar nota</button>
            <button type="button" id="travel-log-plan-button">Agregar plan</button>
          </div>
          <form id="travel-log-add-form" class="travel-log-add-form" hidden>
            <label><span>Actividad</span><input id="travel-log-plan-title" type="text" maxlength="160" required placeholder="Ej. Visitar el casco histórico"></label>
            <label><span>Fecha y hora</span><input id="travel-log-plan-date" type="datetime-local"></label>
            <label><span>Estado</span><select id="travel-log-plan-status"><option value="planned">Planeado</option><option value="confirmed">Confirmado</option><option value="suggested">Sugerido</option></select></label>
            <label><span>Notas</span><textarea id="travel-log-plan-notes" rows="2" maxlength="1000" placeholder="Detalles opcionales"></textarea></label>
            <div class="travel-log-add-actions"><button type="button" data-log-form-cancel>Cancelar</button><button type="submit">Guardar</button></div>
          </form>
          <div id="travel-log-content" class="travel-log-section"></div>
        </section></div></div>`;
      const routes = document.querySelector('[data-app-screen="routes"]');
      if (routes) routes.before(screen);
      else app.appendChild(screen);
    }

    bindEvents();
    initialized = true;
    render();
    return true;
  }

  function bindEvents() {
    screen.querySelectorAll('[data-log-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        activeTab = button.dataset.logTab;
        render();
      });
    });

    const form = screen.querySelector('#travel-log-add-form');
    screen.querySelector('#travel-log-plan-button')?.addEventListener('click', () => {
      form.hidden = false;
      const date = screen.querySelector('#travel-log-plan-date');
      if (date && !date.value) date.value = localDateTimeInput(new Date(Date.now() + 60 * 60 * 1000));
      screen.querySelector('#travel-log-plan-title')?.focus();
    });
    screen.querySelector('[data-log-form-cancel]')?.addEventListener('click', () => { form.hidden = true; });
    screen.querySelector('#travel-log-note-button')?.addEventListener('click', () => {
      const note = window.prompt('¿Qué querés guardar en la bitácora?');
      if (note?.trim()) log.addNote(note.trim());
    });
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const title = screen.querySelector('#travel-log-plan-title')?.value?.trim();
      if (!title) return;
      const scheduledValue = screen.querySelector('#travel-log-plan-date')?.value;
      log.addPlan({
        title,
        scheduledAt: scheduledValue ? new Date(scheduledValue).toISOString() : null,
        status: screen.querySelector('#travel-log-plan-status')?.value || 'planned',
        notes: screen.querySelector('#travel-log-plan-notes')?.value?.trim() || '',
        source: 'user',
      });
      form.reset();
      form.hidden = true;
      activeTab = scheduledValue && log.dayKey(new Date(scheduledValue)) === log.dayKey() ? 'today' : 'upcoming';
      render();
    });

    screen.querySelector('#travel-log-content')?.addEventListener('click', (event) => {
      const action = event.target.closest('[data-plan-action]');
      if (action) {
        const id = action.dataset.planId;
        const type = action.dataset.planAction;
        if (type === 'complete') log.updatePlan(id, { status: 'completed' });
        if (type === 'postpone') {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(10, 0, 0, 0);
          log.updatePlan(id, { status: 'postponed', scheduledAt: tomorrow.toISOString(), day: log.dayKey(tomorrow) });
        }
        if (type === 'cancel') log.updatePlan(id, { status: 'cancelled' });
        render();
        return;
      }
      const sessionLink = event.target.closest('[data-log-session]');
      if (sessionLink) {
        window.WanderScreen?.open?.('routes');
        setTimeout(() => window.WanderTracks?.showTrack?.(sessionLink.dataset.logSession), 50);
      }
    });
  }

  function planMarkup(plan) {
    const when = plan.scheduledAt
      ? new Date(plan.scheduledAt).toLocaleString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : 'Sin fecha';
    const pending = !['completed', 'cancelled'].includes(plan.status);
    return `<article class="travel-log-plan" data-plan-id="${escapeHtml(plan.id)}">
      <div class="travel-log-body"><strong>${escapeHtml(plan.title)}</strong><p>${escapeHtml(when)}${plan.placeName ? ` · ${escapeHtml(plan.placeName)}` : ''}</p>${plan.notes ? `<div class="travel-log-context">${escapeHtml(plan.notes)}</div>` : ''}<div class="travel-log-meta"><span class="travel-log-chip">${escapeHtml(statusLabel(plan.status))}</span></div></div>
      <div class="travel-log-plan-actions">${pending ? `<button type="button" data-plan-action="complete" data-plan-id="${escapeHtml(plan.id)}">Hecho</button><button type="button" data-plan-action="postpone" data-plan-id="${escapeHtml(plan.id)}">Mañana</button><button type="button" data-plan-action="cancel" data-plan-id="${escapeHtml(plan.id)}">Cancelar</button>` : ''}</div>
    </article>`;
  }

  function contextMarkup(changes) {
    const items = (Array.isArray(changes) ? changes : []).slice(-4);
    if (!items.length) return '';
    const text = items.map((change) => change.key).join(' · ');
    return `<div class="travel-log-context">Contexto: ${escapeHtml(text)}</div>`;
  }

  function entryMarkup(entry) {
    const chips = [kindLabel(entry.kind)];
    if (entry.placeName) chips.push(entry.placeName);
    if (entry.sessionId) chips.push('Ver recorrido');
    return `<article class="travel-log-entry" data-kind="${escapeHtml(entry.kind)}"${entry.sessionId ? ` data-log-session="${escapeHtml(entry.sessionId)}" role="button" tabindex="0"` : ''}>
      <time class="travel-log-time" datetime="${escapeHtml(entry.at)}">${escapeHtml(timeLabel(entry.at))}</time>
      <div class="travel-log-body"><strong>${escapeHtml(entry.title)}</strong><p>${escapeHtml(entry.summary)}</p>${contextMarkup(entry.contextChanges)}<div class="travel-log-meta">${chips.map((chip) => `<span class="travel-log-chip">${escapeHtml(chip)}</span>`).join('')}</div></div>
    </article>`;
  }

  function renderSummary() {
    const today = log.entriesForDay();
    const todayPlans = log.plansForDay();
    const pending = log.listPlans().filter((plan) => !['completed', 'cancelled'].includes(plan.status));
    const element = screen.querySelector('#travel-log-summary');
    element.innerHTML = `<div><strong>${todayPlans.length}</strong><span>planes hoy</span></div><div><strong>${today.length}</strong><span>memorias hoy</span></div><div><strong>${pending.length}</strong><span>pendientes</span></div>`;
  }

  function renderToday() {
    const plans = log.plansForDay().sort((a, b) => Date.parse(a.scheduledAt || 0) - Date.parse(b.scheduledAt || 0));
    const entries = log.entriesForDay().slice().reverse();
    const blocks = [];
    if (plans.length) blocks.push(`<div class="travel-log-day"><h3>Plan del día</h3>${plans.map(planMarkup).join('')}</div>`);
    if (entries.length) blocks.push(`<div class="travel-log-day"><h3>Lo que pasó hoy</h3>${entries.map(entryMarkup).join('')}</div>`);
    return blocks.join('') || '<div class="travel-log-empty"><strong>La bitácora de hoy está lista</strong><p>Wander va a guardar lugares, conversaciones, decisiones y cambios importantes.</p></div>';
  }

  function renderUpcoming() {
    const today = log.dayKey();
    const plans = log.listPlans()
      .filter((plan) => !['completed', 'cancelled'].includes(plan.status) && (!plan.day || plan.day > today))
      .sort((a, b) => Date.parse(a.scheduledAt || '9999-12-31') - Date.parse(b.scheduledAt || '9999-12-31'));
    return plans.length ? plans.map(planMarkup).join('') : '<div class="travel-log-empty"><strong>No hay planes futuros</strong><p>Las actividades conversadas con Wander podrán quedar guardadas acá.</p></div>';
  }

  function renderHistory() {
    const groups = new Map();
    log.listEntries().slice().reverse().forEach((entry) => {
      if (!groups.has(entry.day)) groups.set(entry.day, []);
      groups.get(entry.day).push(entry);
    });
    if (!groups.size) return '<div class="travel-log-empty"><strong>La memoria comienza ahora</strong><p>Los próximos cambios importantes quedarán registrados.</p></div>';
    return [...groups.entries()].map(([day, items]) => `<div class="travel-log-day"><h3>${escapeHtml(dateLabel(day))}</h3>${items.map(entryMarkup).join('')}</div>`).join('');
  }

  function render() {
    if (!ensureShell()) return;
    screen.querySelectorAll('[data-log-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.logTab === activeTab));
    renderSummary();
    const content = screen.querySelector('#travel-log-content');
    content.innerHTML = activeTab === 'today' ? renderToday() : activeTab === 'upcoming' ? renderUpcoming() : renderHistory();
  }

  window.addEventListener('wander:screen-change', (event) => {
    if (event.detail?.to === 'travel-log') render();
  });
  log.subscribe(render);

  window.WanderTravelLogScreen = Object.freeze({ render, open: () => window.WanderScreen?.open?.('travel-log') });
  ensureShell();
})();
