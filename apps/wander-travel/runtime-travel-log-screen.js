(() => {
  if (window.WanderTravelLogScreen) return;

  const log = window.WanderTravelLog;
  if (!log) return;

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

  function timeLabel(value) {
    return new Date(value).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  function durationLabel(ms) {
    const minutes = Math.max(0, Math.round(Number(ms || 0) / 60000));
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }

  function distanceLabel(meters) {
    const value = Math.max(0, Math.round(Number(meters || 0)));
    if (value >= 10000) return `${Math.round(value / 1000)} km`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)} km`;
    return `${value} m`;
  }

  function methodLabel(method) {
    const normalized = String(method || '').toLowerCase();
    return {
      walking: 'Caminando', walk: 'Caminando', foot: 'Caminando',
      driving: 'En auto', car: 'En auto', vehicle: 'En vehículo',
      cycling: 'En bicicleta', bicycle: 'En bicicleta', boat: 'En barco',
      sailing: 'Navegando', motorboat: 'En lancha', bus: 'En bus', train: 'En tren',
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
          <div id="travel-log-content" class="travel-log-section"><div class="utl-tree"><details class="utl-folder utl-day" open data-day="${escapeHtml(log.dayKey())}"><summary><span>▰</span><strong>Hoy</strong><small>0 episodios · 0 eventos</small></summary><div><div class="utl-empty">Sin actividad registrada todavía.</div></div></details></div></div>
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
          type: 'movement', at: segment.endedAt || segment.startedAt, day,
          sessionId: session.id, segmentId: segment.id, startedAt: segment.startedAt,
          endedAt: segment.endedAt || null, distanceM: Number(segment.distanceM || 0),
          durationMs: Math.max(0, endedAt - startedAt), method: segment.method,
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
    const rawPoints = (segment?.points || []).filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)));
    const latLngs = window.WanderTracks?.displayLatLngs?.(rawPoints) || rawPoints.map((point) => [Number(point.lat), Number(point.lng)]);
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

  function movementMarkup(item) {
    const range = `${timeLabel(item.startedAt)}${item.endedAt ? `–${timeLabel(item.endedAt)}` : '–ahora'}`;
    return `<button class="travel-log-movement" type="button" data-log-movement data-session-id="${escapeHtml(item.sessionId)}" data-segment-id="${escapeHtml(item.segmentId)}"><span class="travel-log-movement-icon"><svg class="ui-icon"><use href="wander-icons.svg#route"></use></svg></span><span class="travel-log-movement-route"><strong>${escapeHtml(item.from)} → ${escapeHtml(item.to)}</strong><p>${escapeHtml(range)} · ${escapeHtml(methodLabel(item.method))}${item.active ? ' · En curso' : ''}</p><span class="travel-log-meta"><span class="travel-log-chip travel-log-session-chip">Track entre detenciones</span></span></span><span class="travel-log-movement-metrics"><strong>${escapeHtml(distanceLabel(item.distanceM))}</strong><span>${escapeHtml(durationLabel(item.durationMs))}</span></span></button>`;
  }

  function phaseLabel(phase) {
    return {
      disabled: 'Registro desactivado', preparing: 'Preparando contexto', waiting: 'Esperando movimiento',
      moving: 'Registrando desplazamiento', staying: 'Registrando detención',
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
    const finish = screen.querySelector('#travel-log-finish-session');
    if (finish) finish.disabled = !snapshot.active;
    const phase = screen.querySelector('#travel-log-recording-phase');
    if (phase) phase.textContent = phaseLabel(snapshot.phase);
    const summary = screen.querySelector('#travel-log-recording-summary');
    if (summary) summary.textContent = activeSummary(snapshot);
    const dist = screen.querySelector('#travel-log-recording-distance');
    if (dist) dist.textContent = distanceLabel(active?.distanceM || 0);
    const moving = screen.querySelector('#travel-log-recording-moving');
    if (moving) moving.textContent = durationLabel(active?.movingDurationMs || 0);
    const stays = screen.querySelector('#travel-log-recording-stays');
    if (stays) stays.textContent = durationLabel(active?.stationaryDurationMs || 0);

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
    screen.querySelector('#travel-log-content')?.addEventListener('click', (event) => {
      const movement = event.target.closest('[data-log-movement]');
      if (movement) showMovement(movement.dataset.sessionId, movement.dataset.segmentId);
    });
  }

  function render() {
    if (!ensureShell()) return;
    renderRecorder();
    if (window.WanderUnifiedTravelLog?.render) window.WanderUnifiedTravelLog.render();
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
    movementMarkup,
  });
  ensureShell();
})();
