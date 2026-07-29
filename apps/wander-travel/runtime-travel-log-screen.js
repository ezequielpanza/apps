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

  function engine() {
    return window.WanderSessionEngine || null;
  }

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

  function durationLabel(ms) {
    const minutes = Math.max(0, Math.round(Number(ms || 0) / 60000));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours} h ${minutes % 60} min`;
  }

  function distanceLabel(meters) {
    const value = Math.max(0, Math.round(Number(meters || 0)));
    if (value >= 10000) return `${Math.round(value / 1000)} km`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)} km`;
    return `${value} m`;
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
      'conversation-status': 'Conversación',
    }[kind] || 'Memoria';
  }

  function methodLabel(method) {
    const normalized = String(method || '').toLowerCase();
    return {
      walking: 'Caminando',
      walk: 'Caminando',
      foot: 'Caminando',
      driving: 'En auto',
      car: 'En auto',
      vehicle: 'En vehículo',
      cycling: 'En bicicleta',
      bicycle: 'En bicicleta',
      boat: 'En barco',
      sailing: 'Navegando',
      motorboat: 'En lancha',
      bus: 'En bus',
      train: 'En tren',
    }[normalized] || 'Desplazamiento';
  }

  function ensureMenuButton(menuGroup) {
    const existingLog = menuGroup.querySelector('[data-screen-target="travel-log"]');
    const routesButton = menuGroup.querySelector('[data-screen-target="routes"]');
    const button = existingLog || routesButton || document.createElement('button');
    button.type = 'button';
    button.dataset.screenTarget = 'travel-log';
    button.innerHTML = '<svg class="nav-icon"><use href="wander-icons.svg#route"></use></svg><span>Bitácora</span>';
    if (!button.parentElement) menuGroup.appendChild(button);
    if (existingLog && routesButton && existingLog !== routesButton) routesButton.remove();
    return button;
  }

  function recordingOptionsMarkup() {
    return (engine()?.recordingProfiles?.() || []).map((profile) => {
      const details = profile.id === 'manual' ? '' : ` · ${profile.intervalSec} s / ${profile.distanceM} m`;
      return `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.label + details)}</option>`;
    }).join('');
  }

  function ensureShell() {
    if (initialized) return true;
    const app = document.querySelector('.wander-app');
    const menuGroup = document.querySelector('#main-menu .drawer-group');
    if (!app || !menuGroup) return false;

    ensureMenuButton(menuGroup);
    const oldRoutes = document.querySelector('[data-app-screen="routes"]');
    if (oldRoutes) oldRoutes.hidden = true;

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
          <div class="travel-log-recorder">
            <div class="travel-log-recorder-head"><div><span id="travel-log-recording-phase">Preparando registro</span><strong id="travel-log-recording-summary">Wander espera el próximo movimiento</strong></div></div>
            <div class="travel-log-recorder-toggles">
              <label class="travel-log-recorder-toggle"><span>Registrar viaje</span><span class="switch-control"><input id="travel-log-auto-toggle" type="checkbox" role="switch" aria-label="Registrar viaje automáticamente"><span class="switch-track"><span class="switch-thumb"></span></span></span></label>
              <label class="travel-log-recorder-toggle"><span>Mostrar track actual</span><span class="switch-control"><input id="travel-log-map-toggle" type="checkbox" role="switch" aria-label="Mostrar track actual"><span class="switch-track"><span class="switch-thumb"></span></span></span></label>
            </div>
            <div class="travel-log-recorder-stats"><div><span>Distancia</span><strong id="travel-log-recording-distance">0 m</strong></div><div><span>Movimiento</span><strong id="travel-log-recording-moving">0 min</strong></div><div><span>Detenido</span><strong id="travel-log-recording-stays">0 min</strong></div></div>
            <div class="travel-log-recorder-actions"><button id="travel-log-finish-session" type="button">Finalizar viaje</button><button id="travel-log-export-session" type="button">Exportar último</button></div>
            <details class="travel-log-recording-details"><summary>Configuración de grabación</summary><div class="travel-log-recording-grid"><label><span>Perfil</span><select id="travel-log-recording-profile">${recordingOptionsMarkup()}</select></label><label data-log-manual-field hidden><span>Tiempo mínimo (s)</span><input id="travel-log-recording-interval" type="number" min="1" max="60" step="1"></label><label data-log-manual-field hidden><span>Distancia mínima (m)</span><input id="travel-log-recording-min-distance" type="number" min="0" max="100" step="1"></label></div><p id="travel-log-recording-description" class="panel-note"></p></details>
          </div>
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
      if (oldRoutes) oldRoutes.before(screen);
      else app.appendChild(screen);
    }

    bindEvents();
    initialized = true;
    render();
    return true;
  }

  function sessionSnapshot() {
    return engine()?.snapshot?.() || { autoEnabled: true, phase: 'preparing', active: null, sessions: [], recording: null };
  }

  function allSessions() {
    const snapshot = sessionSnapshot();
    return snapshot.active ? [...(snapshot.sessions || []), snapshot.active] : [...(snapshot.sessions || [])];
  }

  function stayLabel(stay, fallback) {
    if (stay?.poiName) return stay.poiName;
    if (stay?.startedAt) return `Detención ${timeLabel(stay.startedAt)}`;
    return fallback;
  }

  function movementItemsForDay(day) {
    const items = [];
    allSessions().forEach((session) => {
      const stays = [...(session.stays || [])].sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0));
      (session.segments || []).filter((segment) => segment?.type === 'movement').forEach((segment) => {
        if (log.dayKey(segment.startedAt) !== day) return;
        const startedAt = Number(segment.startedAt || 0);
        const endedAt = Number(segment.endedAt || Date.now());
        const previousStay = [...stays].reverse().find((stay) => Number(stay.endedAt || Infinity) <= startedAt + 1500) || null;
        const nextStay = stays.find((stay) => Number(stay.startedAt || 0) >= endedAt - 1500) || null;
        items.push({
          type: 'movement',
          at: segment.endedAt || segment.startedAt,
          day,
          sessionId: session.id,
          segmentId: segment.id,
          startedAt: segment.startedAt,
          endedAt: segment.endedAt || null,
          distanceM: Number(segment.distanceM || 0),
          durationMs: Math.max(0, endedAt - startedAt),
          method: segment.method,
          points: Array.isArray(segment.points) ? segment.points : [],
          from: stayLabel(previousStay, 'Inicio'),
          to: segment.endedAt ? stayLabel(nextStay, 'Punto detenido') : 'En movimiento',
          active: !segment.endedAt,
        });
      });
    });
    return items.sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
  }

  function showMovement(sessionId, segmentId) {
    const snapshot = sessionSnapshot();
    const session = snapshot.active?.id === sessionId ? snapshot.active : (snapshot.sessions || []).find((item) => item.id === sessionId);
    const segment = (session?.segments || []).find((item) => item.id === segmentId && item.type === 'movement');
    const rawPoints = (segment?.points || [])
      .filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)));
    const latLngs = window.WanderTracks?.displayLatLngs?.(rawPoints)
      || rawPoints.map((point) => [Number(point.lat), Number(point.lng)]);
    if (latLngs.length < 2) {
      window.WanderUI?.showToast?.('Tramo', 'Todavía no tiene suficientes puntos para mostrar');
      return false;
    }
    window.WanderScreen?.open?.('map');
    setTimeout(() => {
      window.WanderMapCore?.route?.setLatLngs?.(latLngs);
      window.WanderMapCore?.map?.fitBounds?.(latLngs, { padding: [42, 42], maxZoom: 17 });
      window.WanderUI?.showToast?.('Tramo recorrido', distanceLabel(segment.distanceM));
    }, 40);
    return true;
  }

  function phaseLabel(phase) {
    return {
      disabled: 'Registro desactivado',
      preparing: 'Preparando contexto',
      waiting: 'Esperando movimiento',
      moving: 'Registrando desplazamiento',
      staying: 'Registrando detención',
      'confirming-overnight': 'Confirmando cierre nocturno',
    }[phase] || 'Preparando registro';
  }

  function activeSummary(snapshot) {
    const active = window.WanderContext?.value?.('sessions.active') || snapshot.active;
    if (!active) return 'Wander espera el próximo movimiento';
    if (active.currentStay) {
      const place = active.currentStay.poiName ? ` en ${active.currentStay.poiName}` : '';
      return `Detenido${place} desde ${timeLabel(active.currentStay.startedAt)}`;
    }
    return `Viaje activo desde ${timeLabel(active.startedAt)}`;
  }

  function renderRecorder() {
    if (!screen) return;
    const snapshot = sessionSnapshot();
    const active = window.WanderContext?.value?.('sessions.active') || snapshot.active;
    const autoToggle = screen.querySelector('#travel-log-auto-toggle');
    if (autoToggle) autoToggle.checked = Boolean(snapshot.autoEnabled);
    const mapToggle = screen.querySelector('#travel-log-map-toggle');
    if (mapToggle) mapToggle.checked = window.WanderTracks?.isCurrentTrackVisible?.() !== false;
    screen.querySelector('#travel-log-finish-session').disabled = !snapshot.active;
    screen.querySelector('#travel-log-recording-phase').textContent = phaseLabel(snapshot.phase);
    screen.querySelector('#travel-log-recording-summary').textContent = activeSummary(snapshot);
    screen.querySelector('#travel-log-recording-distance').textContent = distanceLabel(active?.distanceM || 0);
    screen.querySelector('#travel-log-recording-moving').textContent = durationLabel(active?.movingDurationMs || 0);
    screen.querySelector('#travel-log-recording-stays').textContent = durationLabel(active?.stationaryDurationMs || 0);

    const recording = snapshot.recording || engine()?.getRecordingState?.();
    const profile = screen.querySelector('#travel-log-recording-profile');
    if (profile && recording?.profileId) profile.value = recording.profileId;
    screen.querySelectorAll('[data-log-manual-field]').forEach((field) => { field.hidden = recording?.profileId !== 'manual'; });
    const interval = screen.querySelector('#travel-log-recording-interval');
    if (interval && recording) interval.value = String(recording.manualIntervalSec ?? 5);
    const minimumDistance = screen.querySelector('#travel-log-recording-min-distance');
    if (minimumDistance && recording) minimumDistance.value = String(recording.manualDistanceM ?? 5);
    const description = screen.querySelector('#travel-log-recording-description');
    if (description) description.textContent = recording?.config?.description || 'El track se divide automáticamente cada vez que Wander confirma una detención.';
  }

  function bindEvents() {
    screen.querySelectorAll('[data-log-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        activeTab = button.dataset.logTab;
        render();
      });
    });

    screen.querySelector('#travel-log-auto-toggle')?.addEventListener('change', (event) => {
      engine()?.setAutoEnabled?.(event.target.checked);
      render();
    });
    screen.querySelector('#travel-log-map-toggle')?.addEventListener('change', (event) => {
      window.WanderTracks?.setCurrentTrackVisible?.(event.target.checked);
      renderRecorder();
    });
    screen.querySelector('#travel-log-finish-session')?.addEventListener('click', () => {
      const completed = engine()?.finishSession?.('manual');
      if (completed) window.WanderUI?.showToast?.('Viaje finalizado', 'Los tramos quedaron guardados en la Bitácora');
      render();
    });
    screen.querySelector('#travel-log-export-session')?.addEventListener('click', () => {
      const snapshot = sessionSnapshot();
      const session = snapshot.active || snapshot.sessions?.[snapshot.sessions.length - 1];
      if (!session) return window.WanderUI?.showToast?.('Exportar', 'Todavía no hay recorridos');
      window.WanderTracks?.exportTrack?.(session);
    });
    screen.querySelector('#travel-log-recording-profile')?.addEventListener('change', (event) => {
      engine()?.setRecordingProfile?.(event.target.value);
      renderRecorder();
    });
    const updateManual = () => {
      engine()?.setManualRecordingConfig?.({
        intervalSec: Number(screen.querySelector('#travel-log-recording-interval')?.value),
        distanceM: Number(screen.querySelector('#travel-log-recording-min-distance')?.value),
      });
      renderRecorder();
    };
    screen.querySelector('#travel-log-recording-interval')?.addEventListener('change', updateManual);
    screen.querySelector('#travel-log-recording-min-distance')?.addEventListener('change', updateManual);

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
      const movement = event.target.closest('[data-log-movement]');
      if (movement) showMovement(movement.dataset.sessionId, movement.dataset.segmentId);
    });
  }

  function planMarkup(plan) {
    const when = plan.scheduledAt
      ? new Date(plan.scheduledAt).toLocaleString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : 'Sin fecha';
    const pending = !['completed', 'cancelled'].includes(plan.status);
    return `<article class="travel-log-plan" data-plan-id="${escapeHtml(plan.id)}"><div class="travel-log-body"><strong>${escapeHtml(plan.title)}</strong><p>${escapeHtml(when)}${plan.placeName ? ` · ${escapeHtml(plan.placeName)}` : ''}</p>${plan.notes ? `<div class="travel-log-context">${escapeHtml(plan.notes)}</div>` : ''}<div class="travel-log-meta"><span class="travel-log-chip">${escapeHtml(statusLabel(plan.status))}</span></div></div><div class="travel-log-plan-actions">${pending ? `<button type="button" data-plan-action="complete" data-plan-id="${escapeHtml(plan.id)}">Hecho</button><button type="button" data-plan-action="postpone" data-plan-id="${escapeHtml(plan.id)}">Mañana</button><button type="button" data-plan-action="cancel" data-plan-id="${escapeHtml(plan.id)}">Cancelar</button>` : ''}</div></article>`;
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
    return `<article class="travel-log-entry" data-kind="${escapeHtml(entry.kind)}"><time class="travel-log-time" datetime="${escapeHtml(entry.at)}">${escapeHtml(timeLabel(entry.at))}</time><div class="travel-log-body"><strong>${escapeHtml(entry.title)}</strong><p>${escapeHtml(entry.summary)}</p>${contextMarkup(entry.contextChanges)}<div class="travel-log-meta">${chips.map((chip) => `<span class="travel-log-chip">${escapeHtml(chip)}</span>`).join('')}</div></div></article>`;
  }

  function movementMarkup(item) {
    const timeRange = `${timeLabel(item.startedAt)}${item.endedAt ? `–${timeLabel(item.endedAt)}` : '–ahora'}`;
    return `<button class="travel-log-movement" type="button" data-log-movement data-session-id="${escapeHtml(item.sessionId)}" data-segment-id="${escapeHtml(item.segmentId)}"><span class="travel-log-movement-icon"><svg class="ui-icon"><use href="wander-icons.svg#route"></use></svg></span><span class="travel-log-movement-route"><strong>${escapeHtml(item.from)} → ${escapeHtml(item.to)}</strong><p>${escapeHtml(timeRange)} · ${escapeHtml(methodLabel(item.method))}${item.active ? ' · En curso' : ''}</p><span class="travel-log-meta"><span class="travel-log-chip travel-log-session-chip">Track entre detenciones</span></span></span><span class="travel-log-movement-metrics"><strong>${escapeHtml(distanceLabel(item.distanceM))}</strong><span>${escapeHtml(durationLabel(item.durationMs))}</span></span></button>`;
  }

  function timelineMarkup(day) {
    const timeline = [];
    log.entriesForDay(day)
      .filter((entry) => entry.kind !== 'session-link')
      .forEach((entry) => timeline.push({ at: Date.parse(entry.at) || 0, markup: entryMarkup(entry) }));
    movementItemsForDay(day).forEach((item) => timeline.push({ at: Number(item.at || 0), markup: movementMarkup(item) }));
    return timeline.sort((a, b) => b.at - a.at).map((item) => item.markup).join('');
  }

  function renderSummary() {
    const today = log.dayKey();
    const todayEntries = log.entriesForDay(today).filter((entry) => entry.kind !== 'session-link');
    const todayPlans = log.plansForDay(today);
    const tracks = movementItemsForDay(today);
    const element = screen.querySelector('#travel-log-summary');
    element.innerHTML = `<div><strong>${todayPlans.length}</strong><span>planes hoy</span></div><div><strong>${tracks.length}</strong><span>tramos hoy</span></div><div><strong>${todayEntries.length}</strong><span>eventos hoy</span></div>`;
  }

  function renderToday() {
    const day = log.dayKey();
    const plans = log.plansForDay(day).sort((a, b) => Date.parse(a.scheduledAt || 0) - Date.parse(b.scheduledAt || 0));
    const timeline = timelineMarkup(day);
    const blocks = [];
    if (plans.length) blocks.push(`<div class="travel-log-day"><h3>Plan del día</h3>${plans.map(planMarkup).join('')}</div>`);
    if (timeline) blocks.push(`<div class="travel-log-day"><h3>Lo que pasó hoy</h3>${timeline}</div>`);
    return blocks.join('') || '<div class="travel-log-empty"><strong>La bitácora de hoy está lista</strong><p>Wander guardará detenciones, tracks, lugares, conversaciones y decisiones.</p></div>';
  }

  function renderUpcoming() {
    const today = log.dayKey();
    const plans = log.listPlans().filter((plan) => !['completed', 'cancelled'].includes(plan.status) && (!plan.day || plan.day > today)).sort((a, b) => Date.parse(a.scheduledAt || '9999-12-31') - Date.parse(b.scheduledAt || '9999-12-31'));
    return plans.length ? plans.map(planMarkup).join('') : '<div class="travel-log-empty"><strong>No hay planes futuros</strong><p>Las actividades conversadas con Wander podrán quedar guardadas acá.</p></div>';
  }

  function renderHistory() {
    const days = new Set(log.listEntries().filter((entry) => entry.kind !== 'session-link').map((entry) => entry.day));
    allSessions().forEach((session) => (session.segments || []).filter((segment) => segment.type === 'movement').forEach((segment) => days.add(log.dayKey(segment.startedAt))));
    const ordered = [...days].sort().reverse();
    if (!ordered.length) return '<div class="travel-log-empty"><strong>La memoria comienza ahora</strong><p>Los próximos lugares, detenciones y recorridos quedarán registrados.</p></div>';
    return ordered.map((day) => `<div class="travel-log-day"><h3>${escapeHtml(dateLabel(day))}</h3>${timelineMarkup(day)}</div>`).join('');
  }

  function render() {
    if (!ensureShell()) return;
    screen.querySelectorAll('[data-log-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.logTab === activeTab));
    renderSummary();
    renderRecorder();
    const content = screen.querySelector('#travel-log-content');
    content.innerHTML = activeTab === 'today' ? renderToday() : activeTab === 'upcoming' ? renderUpcoming() : renderHistory();
  }

  window.addEventListener('wander:screen-change', (event) => {
    if (event.detail?.to === 'travel-log') render();
  });
  window.addEventListener('wander:sessions-changed', render);
  window.addEventListener('wander:recording-profile-changed', renderRecorder);
  log.subscribe(render);

  window.WanderTravelLogScreen = Object.freeze({
    render,
    open: () => window.WanderScreen?.open?.('travel-log'),
    movementItemsForDay,
    showMovement,
  });
  ensureShell();
})();