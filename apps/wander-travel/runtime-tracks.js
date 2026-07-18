(() => {
  const base = window.WanderBase;
  if (!base) return;

  const map = base.map;
  const line = base.route;
  const currentLine = base.currentTrack || null;
  const LEGACY_KEY = 'wander.tracks';
  const CURRENT_TRACK_VISIBLE_KEY = 'wander.tracks.current.visible.v1';
  const $ = (selector) => document.querySelector(selector);
  const icon = (name, className = 'button-icon') => `<svg class="${className}" aria-hidden="true"><use href="wander-icons.svg#${name}"></use></svg>`;
  let legacyTracks = [];
  let initialized = false;
  let currentTrackVisible = loadCurrentTrackVisibility();

  try {
    const stored = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    legacyTracks = Array.isArray(stored) ? stored : [];
  } catch { legacyTracks = []; }

  function loadCurrentTrackVisibility() {
    try {
      const stored = localStorage.getItem(CURRENT_TRACK_VISIBLE_KEY);
      return stored == null ? true : stored === 'true';
    } catch { return true; }
  }

  function persistCurrentTrackVisibility() {
    try { localStorage.setItem(CURRENT_TRACK_VISIBLE_KEY, String(currentTrackVisible)); } catch {}
    window.WanderContext?.set?.('sessions.currentTrackVisible', currentTrackVisible, {
      source: 'tracks-ui',
      kind: 'confirmed',
      confidence: 1,
      ttlMs: Infinity,
    });
  }

  function engine() {
    return window.WanderSessionEngine || null;
  }

  function durationLabel(ms) {
    const minutes = Math.max(0, Math.round(Number(ms || 0) / 60000));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours} h ${minutes % 60} min`;
  }

  function distanceLabel(meters) {
    const value = Math.max(0, Math.round(Number(meters || 0)));
    return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} km` : `${value} m`;
  }

  function dateLabel(value) {
    if (!value) return 'Sin fecha';
    return new Date(value).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function phaseLabel(state) {
    const labels = {
      disabled: 'Registro automático desactivado',
      preparing: 'Preparando contexto',
      waiting: 'Esperando movimiento',
      moving: 'Registrando movimiento',
      staying: 'Registrando permanencia',
      'confirming-overnight': 'Confirmando permanencia nocturna',
    };
    return labels[state?.phase] || 'Preparando sesiones';
  }

  function routeCard() {
    return $('#track-list')?.closest('.screen-card') || $('[data-app-screen="routes"] .screen-card');
  }

  function recordingOptionsMarkup() {
    const profiles = engine()?.recordingProfiles?.() || [];
    return profiles.map((profile) => {
      const detail = profile.id === 'manual' ? '' : ` · ${profile.intervalSec} s / ${profile.distanceM} m`;
      return `<option value="${profile.id}">${profile.label}${detail}</option>`;
    }).join('');
  }

  function buildScreen() {
    const card = routeCard();
    if (!card || card.dataset.sessionUi === 'true') return Boolean(card);
    card.dataset.sessionUi = 'true';
    card.innerHTML = `
      <h3>${icon('route', 'section-icon')}Sesiones</h3>
      <div class="session-auto-card">
        <div><strong>Registro automático</strong><span>Wander registra movimiento y permanencias sin usar un botón de grabación.</span></div>
        <label class="switch-control"><input id="session-auto-toggle" type="checkbox" role="switch" aria-label="Registro automático"><span class="switch-track"><span class="switch-thumb"></span></span></label>
      </div>
      <div class="session-auto-card">
        <div><strong>Mostrar recorrido actual</strong><span>Dibuja en el mapa el trayecto acumulado de la sesión activa.</span></div>
        <label class="switch-control"><input id="session-map-toggle" type="checkbox" role="switch" aria-label="Mostrar recorrido actual en el mapa"><span class="switch-track"><span class="switch-thumb"></span></span></label>
      </div>
      <div class="session-recording-card">
        <div class="session-recording-heading">
          <div><strong>Perfil de grabación</strong><span id="session-recording-summary">Equilibrado · 5 s · 5 m</span></div>
        </div>
        <label class="session-recording-field">
          <span>Perfil</span>
          <select id="session-recording-profile" aria-label="Perfil de grabación del recorrido">${recordingOptionsMarkup()}</select>
        </label>
        <div id="session-recording-manual" class="session-recording-manual" hidden>
          <label class="session-recording-field"><span>Tiempo mínimo</span><div><input id="session-recording-interval" type="number" inputmode="numeric" min="2" max="60" step="1"><small>segundos</small></div></label>
          <label class="session-recording-field"><span>Distancia mínima</span><div><input id="session-recording-distance" type="number" inputmode="numeric" min="1" max="100" step="1"><small>metros</small></div></label>
        </div>
        <p id="session-recording-description" class="panel-note">Buen detalle con consumo moderado.</p>
      </div>
      <div class="session-current-card">
        <span id="session-phase">Preparando contexto</span>
        <strong id="track-summary">Sin sesión activa</strong>
        <div class="session-stats">
          <div><span>Distancia</span><b id="session-distance">0 m</b></div>
          <div><span>Movimiento</span><b id="session-moving-time">0 min</b></div>
          <div><span>Permanencias</span><b id="session-stay-time">0 min</b></div>
        </div>
      </div>
      <div class="button-row compact-actions session-actions">
        <button id="session-finish-button" type="button">${icon('stop')}<span>Finalizar sesión</span></button>
        <button id="export-track-button" type="button">${icon('export')}<span>Exportar</span></button>
        <button id="clear-panel-button" type="button">${icon('clear')}<span>Limpiar mapa</span></button>
      </div>
      <div class="session-history-heading"><strong>Historial</strong><span id="session-history-count">0 finalizadas</span></div>
      <div id="track-list" class="track-list session-list"></div>`;

    $('#session-auto-toggle')?.addEventListener('change', (event) => {
      engine()?.setAutoEnabled?.(event.target.checked);
      render();
    });
    $('#session-map-toggle')?.addEventListener('change', (event) => {
      setCurrentTrackVisible(event.target.checked);
    });
    $('#session-recording-profile')?.addEventListener('change', (event) => {
      engine()?.setRecordingProfile?.(event.target.value);
      renderRecordingControls();
    });
    const updateManual = () => {
      const intervalSec = Number($('#session-recording-interval')?.value);
      const distanceM = Number($('#session-recording-distance')?.value);
      engine()?.setManualRecordingConfig?.({ intervalSec, distanceM });
      renderRecordingControls();
    };
    $('#session-recording-interval')?.addEventListener('change', updateManual);
    $('#session-recording-distance')?.addEventListener('change', updateManual);
    $('#session-finish-button')?.addEventListener('click', () => {
      const completed = engine()?.finishSession?.('manual');
      if (completed) window.WanderUI?.showToast?.('Sesión finalizada', 'Esperando el próximo movimiento');
      render();
    });
    $('#export-track-button')?.addEventListener('click', exportLast);
    $('#clear-panel-button')?.addEventListener('click', () => {
      line.setLatLngs([]);
      setCurrentTrackVisible(false);
      window.WanderUI?.showToast?.('Vista limpia', 'Las sesiones siguen guardadas');
    });
    $('#track-list')?.addEventListener('click', handleListClick);
    return true;
  }

  function renderRecordingControls(state = null) {
    const recording = state?.recording || engine()?.getRecordingState?.();
    if (!recording?.config) return;
    const config = recording.config;
    const profileSelect = $('#session-recording-profile');
    if (profileSelect) profileSelect.value = recording.profileId;
    const manual = $('#session-recording-manual');
    if (manual) manual.hidden = recording.profileId !== 'manual';
    const interval = $('#session-recording-interval');
    if (interval) interval.value = String(recording.manualIntervalSec);
    const distance = $('#session-recording-distance');
    if (distance) distance.value = String(recording.manualDistanceM);
    window.WanderUI?.setText?.('#session-recording-summary', `${config.label} · ${config.intervalSec} s · ${config.distanceM} m`);
    window.WanderUI?.setText?.('#session-recording-description', config.description || 'Configuración de grabación activa.');
  }

  function activeSummary(active) {
    if (!active) return 'Sin sesión activa · Wander espera el próximo movimiento';
    const stay = active.currentStay;
    if (stay) {
      const place = stay.poiName ? ` en ${stay.poiName}` : '';
      return `En permanencia${place} desde ${new Date(stay.startedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return `Sesión activa desde ${new Date(active.startedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function historyCountLabel(active, history) {
    const finished = history.length;
    const finishedLabel = `${finished} ${finished === 1 ? 'finalizada' : 'finalizadas'}`;
    return active ? `1 activa · ${finishedLabel}` : finishedLabel;
  }

  function rowMarkup(session, active = false) {
    const duration = Math.max(0, Number(session.endedAt || Date.now()) - Number(session.startedAt || Date.now()));
    const details = `${dateLabel(session.startedAt)} · ${durationLabel(duration)} · ${distanceLabel(session.distanceM)}`;
    return `<div class="track-row session-row${active ? ' is-active' : ''}" data-session-id="${session.id}">
      <button class="track-main" type="button" data-session-view="${session.id}">
        <div><strong>${session.name || 'Sesión'}</strong><span>${details}${active ? ' · Activa' : ''}</span></div>${icon('eye', 'ui-icon track-eye')}
      </button>
      ${active ? '' : `<button class="track-delete" type="button" data-session-delete="${session.id}" aria-label="Eliminar sesión">${icon('clear', 'ui-icon')}</button>`}
    </div>`;
  }

  function legacyRowMarkup(track) {
    const points = Array.isArray(track.points) ? track.points : [];
    return `<div class="track-row session-row is-legacy" data-legacy-id="${track.id}">
      <button class="track-main" type="button" data-legacy-view="${track.id}">
        <div><strong>${track.name || 'Recorrido anterior'}</strong><span>Recorrido anterior · ${points.length} puntos · Sin permanencias</span></div>${icon('eye', 'ui-icon track-eye')}
      </button>
    </div>`;
  }

  function sessionPoints(session) {
    return (session?.segments || []).filter((segment) => segment.type === 'movement').flatMap((segment) => segment.points || []);
  }

  function currentLatLngs(active) {
    return sessionPoints(active)
      .filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)))
      .map((point) => [Number(point.lat), Number(point.lng)]);
  }

  function syncCurrentTrack(state = null) {
    if (!currentLine) return [];
    const snapshot = state || engine()?.snapshot?.() || null;
    const latLngs = currentTrackVisible ? currentLatLngs(snapshot?.active) : [];
    currentLine.setLatLngs(latLngs);
    return latLngs;
  }

  function setCurrentTrackVisible(visible) {
    currentTrackVisible = Boolean(visible);
    persistCurrentTrackVisibility();
    const toggle = $('#session-map-toggle');
    if (toggle) toggle.checked = currentTrackVisible;
    syncCurrentTrack();
    return currentTrackVisible;
  }

  function render(state = null) {
    if (!buildScreen()) return;
    const snapshot = state || engine()?.snapshot?.() || { autoEnabled: true, phase: 'preparing', active: null, sessions: [] };
    const active = snapshot.active;
    const live = window.WanderContext?.value?.('sessions.active') || active;
    const history = Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
    const toggle = $('#session-auto-toggle');
    if (toggle) toggle.checked = Boolean(snapshot.autoEnabled);
    const mapToggle = $('#session-map-toggle');
    if (mapToggle) mapToggle.checked = currentTrackVisible;
    const finish = $('#session-finish-button');
    if (finish) finish.disabled = !active;
    renderRecordingControls(snapshot);
    window.WanderUI?.setText('#session-phase', phaseLabel(snapshot));
    window.WanderUI?.setText('#track-summary', activeSummary(live));
    window.WanderUI?.setText('#session-distance', distanceLabel(live?.distanceM || 0));
    window.WanderUI?.setText('#session-moving-time', durationLabel(live?.movingDurationMs || 0));
    window.WanderUI?.setText('#session-stay-time', durationLabel(live?.stationaryDurationMs || 0));
    window.WanderUI?.setText('#session-history-count', historyCountLabel(active, history));
    syncCurrentTrack(snapshot);

    const list = $('#track-list');
    if (!list) return;
    const rows = [];
    if (active) rows.push(rowMarkup({ ...active, ...live }, true));
    history.slice().reverse().slice(0, 20).forEach((session) => rows.push(rowMarkup(session)));
    legacyTracks.slice().reverse().slice(0, 10).forEach((track) => rows.push(legacyRowMarkup(track)));
    list.innerHTML = rows.length ? rows.join('') : '<div class="track-row"><div><strong>Sin sesiones</strong><span>El registro automático comenzará cuando Wander confirme movimiento.</span></div></div>';
  }

  function sessionById(id) {
    const state = engine()?.snapshot?.();
    if (state?.active?.id === id) return state.active;
    return state?.sessions?.find((session) => session.id === id) || null;
  }

  function showSession(id) {
    const state = engine()?.snapshot?.();
    const session = state?.active?.id === id ? state.active : state?.sessions?.find((item) => item.id === id);
    const points = sessionPoints(session);
    if (!session || !points.length) return window.WanderUI?.showToast?.('Sesión', 'Todavía no tiene recorrido visible');
    const latLngs = points.map((point) => [point.lat, point.lng]);
    if (!(state?.active?.id === id && currentTrackVisible)) line.setLatLngs(latLngs);
    map.fitBounds(latLngs, { padding: [40, 40], maxZoom: 16 });
    const distance = session.distanceM || window.WanderContext?.value?.('sessions.active')?.distanceM || 0;
    window.WanderUI?.showToast?.('Sesión', distanceLabel(distance));
  }

  function showLegacy(id) {
    const track = legacyTracks.find((item) => item.id === id);
    const points = Array.isArray(track?.points) ? track.points : [];
    if (!points.length) return;
    const latLngs = points.map((point) => [point.lat, point.lng]);
    line.setLatLngs(latLngs);
    map.fitBounds(latLngs, { padding: [40, 40], maxZoom: 16 });
  }

  function handleListClick(event) {
    const removeButton = event.target.closest('[data-session-delete]');
    if (removeButton) {
      const id = removeButton.dataset.sessionDelete;
      const session = sessionById(id);
      if (session && window.confirm(`¿Eliminar ${session.name}?`)) engine()?.deleteSession?.(id);
      render();
      return;
    }
    const view = event.target.closest('[data-session-view]');
    if (view) return showSession(view.dataset.sessionView);
    const legacy = event.target.closest('[data-legacy-view]');
    if (legacy) showLegacy(legacy.dataset.legacyView);
  }

  function exportSession(session) {
    if (!session) return;
    const payload = { format: 'wander-session', exportedAt: new Date().toISOString(), session };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${session.id}.wander-session.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportLast() {
    const state = engine()?.snapshot?.();
    const session = state?.active || state?.sessions?.[state.sessions.length - 1];
    if (!session) return window.WanderUI?.showToast?.('Exportar', 'Todavía no hay sesiones');
    exportSession(session);
  }

  function initialize() {
    if (initialized || !engine()) return;
    initialized = true;
    persistCurrentTrackVisibility();
    engine().subscribe?.(render);
    buildScreen();
    render();
  }

  window.addEventListener('wander:session-engine-ready', initialize);
  window.addEventListener('wander:recording-profile-changed', () => renderRecordingControls());
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-screen-target="routes"]')) setTimeout(render, 0);
  });

  window.WanderTracks = {
    render,
    manage: () => window.WanderScreen?.open?.('routes'),
    showTrack: showSession,
    exportTrack: exportSession,
    list: () => engine()?.list?.() || [],
    isRecording: () => Boolean(engine()?.isAutoEnabled?.()),
    start: () => engine()?.setAutoEnabled?.(true),
    stop: () => engine()?.finishSession?.('manual'),
    addPoint: () => engine()?.observe?.('legacy-add-point'),
    setCurrentTrackVisible,
    isCurrentTrackVisible: () => currentTrackVisible,
  };

  initialize();
})();
