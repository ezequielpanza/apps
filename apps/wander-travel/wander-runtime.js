(() => {
  if (window.__wanderRuntime) return;
  window.__wanderRuntime = true;
  if (typeof map === 'undefined' || typeof marker === 'undefined' || typeof L === 'undefined') return;

  const VERSION = 'v0.56.0';
  const $ = (selector) => document.querySelector(selector);
  const STORAGE = {
    simulatorPosition: 'wander.simulator.position',
    tracks: 'wander.tracks',
  };

  const state = {
    gps: { point: null, speed: 0, heading: 0, centered: false },
    sim: { active: false, timer: null, direction: null, speedIndex: 0, water: false },
    tracks: loadTracks(),
    currentTrack: null,
    currentLine: null,
  };

  const icons = {
    dot: L.divIcon({ className: '', html: '<div class="wander-user-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
    arrow: (bearing) => L.divIcon({ className: '', html: `<div class="wander-user-arrow" style="--wander-user-bearing:${bearing}deg"></div>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
  };

  const speeds = [
    { label: 'Caminando', kmh: 5 },
    { label: 'Bicicleta', kmh: 16 },
    { label: 'Auto lento', kmh: 30 },
    { label: 'Auto medio', kmh: 50 },
    { label: 'Auto rápido', kmh: 80 },
  ];
  const directions = {
    north: { n: 1, e: 0, b: 0, label: 'norte' },
    northeast: { n: Math.SQRT1_2, e: Math.SQRT1_2, b: 45, label: 'noreste' },
    east: { n: 0, e: 1, b: 90, label: 'este' },
    southeast: { n: -Math.SQRT1_2, e: Math.SQRT1_2, b: 135, label: 'sureste' },
    south: { n: -1, e: 0, b: 180, label: 'sur' },
    southwest: { n: -Math.SQRT1_2, e: -Math.SQRT1_2, b: 225, label: 'suroeste' },
    west: { n: 0, e: -1, b: 270, label: 'oeste' },
    northwest: { n: Math.SQRT1_2, e: -Math.SQRT1_2, b: 315, label: 'noroeste' },
  };
  const opposites = { north: 'south', south: 'north', east: 'west', west: 'east', northeast: 'southwest', southwest: 'northeast', northwest: 'southeast', southeast: 'northwest' };

  boot();

  function boot() {
    document.title = `Wander Travel ${VERSION}`;
    $('.app-version') && ($('.app-version').textContent = VERSION);
    marker.setOpacity(0);
    marker.setIcon(icons.dot);
    buildMenu();
    buildSettingsGear();
    polishButtons();
    buildSimulator();
    buildTrackList();
    bindTrackRecorder();
    startGps();
    renderMetrics({ moving: false, speed_mps: 0, heading_degrees: null, likely_boat: false });
    setInterval(() => marker.setIcon(currentMoving() ? icons.arrow(currentHeading()) : icons.dot), 750);
  }

  function loadTracks() {
    try { return JSON.parse(localStorage.getItem(STORAGE.tracks) || '[]'); } catch { return []; }
  }
  function saveTracks() { localStorage.setItem(STORAGE.tracks, JSON.stringify(state.tracks)); }
  function showMarker() { marker.setOpacity(1); }
  function normalize(value) { return ((Number(value) || 0) % 360 + 360) % 360; }
  function currentMoving() { return Boolean(window.wanderMotionContext?.moving) && Number(window.wanderMotionContext?.speed_mps || 0) > 0.6; }
  function currentHeading() { return normalize(window.wanderMotionContext?.heading_degrees || 0); }
  function bearing(a, b) {
    const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return normalize(Math.atan2(y, x) * 180 / Math.PI);
  }

  function publishMotion(detail) {
    window.wanderMotionContext = detail;
    document.dispatchEvent(new CustomEvent('wander:motion-context', { detail }));
    renderMetrics(detail);
    marker.setIcon(detail.moving && detail.speed_mps > 0.6 ? icons.arrow(detail.heading_degrees || 0) : icons.dot);
    if (state.currentTrack) addTrackPoint(detail.location);
  }

  function renderMetrics(detail) {
    const moving = Boolean(detail.moving) && Number(detail.speed_mps || 0) > 0.6;
    const boat = Boolean(detail.likely_boat || detail.on_water_hint);
    const speed = Number(detail.speed_mps || 0);
    const status = boat ? (moving ? 'Navegando' : 'Fondeado') : (moving ? landStatus(speed) : 'Detenido');
    const speedText = boat ? `${(speed * 1.943844).toFixed(1)} kn` : `${(speed * 3.6).toFixed(1)} km/h`;
    const heading = Number.isFinite(detail.heading_degrees) && moving ? `${Math.round(normalize(detail.heading_degrees))}°` : '—';
    setMetric(1, status);
    setMetric(2, speedText);
    setMetric(3, heading);
  }
  function landStatus(speed) {
    const kmh = speed * 3.6;
    if (kmh < 8) return 'Caminando';
    if (kmh < 25) return 'Bicicleta';
    return 'Conduciendo';
  }
  function setMetric(index, value) {
    const item = $(`.status-rail .metric:nth-child(${index}) strong`);
    if (item) item.textContent = value;
  }

  function startGps() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition(onGps, () => {}, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
  }
  function onGps(pos) {
    const point = L.latLng(pos.coords.latitude, pos.coords.longitude);
    const old = state.gps.point || point;
    let speed = Number.isFinite(pos.coords.speed) && pos.coords.speed >= 0 ? pos.coords.speed : 0;
    let heading = Number.isFinite(pos.coords.heading) && pos.coords.heading >= 0 ? pos.coords.heading : state.gps.heading;
    const moved = map.distance(old, point);
    if (!speed && moved > 1.5) speed = moved / 2;
    if (!(Number.isFinite(pos.coords.heading) && pos.coords.heading >= 0) && moved > 1.5) heading = bearing(old, point);
    state.gps = { point, speed, heading, centered: state.gps.centered };
    if (state.sim.active) return;
    showMarker();
    marker.setLatLng(point);
    if (!state.gps.centered) {
      state.gps.centered = true;
      map.setView(point, Math.max(map.getZoom(), 14), { animate: false });
    }
    publishMotion({ moving: speed > 0.6, speed_mps: speed, speed_knots: speed * 1.943844, heading_degrees: heading, likely_boat: false, on_water_hint: false, location: { lat: point.lat, lng: point.lng }, updated_at: new Date().toISOString() });
  }

  function buildMenu() {
    const tools = $('.map-tools');
    if (!tools || $('#wander-clean-menu-button')) return;
    const button = document.createElement('button');
    button.id = 'wander-clean-menu-button';
    button.className = 'clean-menu-button';
    button.type = 'button';
    button.setAttribute('aria-label', 'Menú');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>';
    tools.prepend(button);
    const backdrop = document.createElement('div');
    backdrop.className = 'clean-menu-backdrop';
    const menu = document.createElement('nav');
    menu.id = 'wander-clean-menu';
    menu.className = 'clean-menu';
    menu.innerHTML = '<button data-menu="travel">Travel</button><button data-menu="boat">Barco</button><button data-menu="developer">Desarrollador</button><button data-menu="simulator">Simulador</button>';
    $('.map-stage')?.append(backdrop, menu);
    button.addEventListener('click', () => toggleMenu(true));
    backdrop.addEventListener('click', () => toggleMenu(false));
    menu.addEventListener('click', (event) => {
      const item = event.target.closest('[data-menu]');
      if (!item) return;
      toggleMenu(false);
      if (item.dataset.menu === 'simulator') setSimulator(true);
      if (item.dataset.menu === 'developer') document.body.classList.add('dev-panel-open');
      if (item.dataset.menu === 'travel') $('.app-shell')?.classList.remove('panel-collapsed');
      if (item.dataset.menu === 'boat') say('Wander Boat', 'Boat queda reservado para funciones náuticas. Por ahora Travel sigue activo.');
    });
    function toggleMenu(force) {
      menu.classList.toggle('is-open', force);
      backdrop.classList.toggle('is-open', force);
    }
  }

  function buildSettingsGear() {
    const tools = $('.map-tools');
    if (!tools || $('#wander-settings-gear')) return;
    const gear = document.createElement('button');
    gear.id = 'wander-settings-gear';
    gear.type = 'button';
    gear.className = 'map-tool';
    gear.setAttribute('aria-label', 'Configuración');
    gear.textContent = '⚙️';
    gear.addEventListener('click', () => $('#settings-panel')?.classList.toggle('settings-collapsed'));
    tools.appendChild(gear);
  }

  function polishButtons() {
    $('#locate-button')?.remove();
    $('#real-poi-button')?.remove();
    $('#route-button')?.remove();
    $('#track-route-button') && ($('#track-route-button').innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="record-dot" cx="12" cy="12" r="6"/></svg>');
  }

  function buildSimulator() {
    if ($('#movement-simulator-overlay')) return;
    const pad = $('#developer-panel .move-pad');
    const status = $('#simulator-status');
    const pin = $('#manual-location-button');
    if (!pad || !status || !pin) return;
    const overlay = document.createElement('section');
    overlay.id = 'movement-simulator-overlay';
    overlay.className = 'movement-overlay is-hidden';
    overlay.innerHTML = '<div class="movement-overlay-header"><div><span>Simulador</span><strong>Movimiento</strong></div><button id="hide-movement-overlay" type="button" aria-label="Cerrar simulador">×</button></div>';
    pin.className = 'overlay-location-button';
    pin.innerHTML = '<span aria-hidden="true">📍</span><strong>Fijar posición</strong>';
    pad.querySelector('[data-stop-move]').textContent = '🛑';
    overlay.append(pin, pad, status);
    $('.map-stage')?.append(overlay);
    $('#hide-movement-overlay').addEventListener('click', () => setSimulator(false));
    pad.addEventListener('click', (event) => {
      const stop = event.target.closest('[data-stop-move]');
      const move = event.target.closest('[data-move]');
      if (stop) stopSimMovement();
      if (move) startSimMovement(move.dataset.move, move);
    });
    pin.addEventListener('click', () => { showMarker(); setSimulator(true); });
  }
  function setSimulator(active) {
    state.sim.active = active;
    $('#movement-simulator-overlay')?.classList.toggle('is-hidden', !active);
    if (active) {
      showMarker();
      if (state.gps.point) marker.setLatLng(state.gps.point);
      publishMotion({ moving: false, speed_mps: 0, heading_degrees: null, likely_boat: state.sim.water, on_water_hint: state.sim.water, location: pointObject(marker.getLatLng()), simulated: true });
    } else {
      stopSimMovement();
      if (state.gps.point) {
        marker.setLatLng(state.gps.point);
        publishMotion({ moving: state.gps.speed > 0.6, speed_mps: state.gps.speed, heading_degrees: state.gps.heading, likely_boat: false, on_water_hint: false, location: pointObject(state.gps.point) });
      }
    }
  }
  function startSimMovement(direction, button) {
    if (!directions[direction]) return;
    setSimulator(true);
    if (state.sim.timer && state.sim.direction === direction) state.sim.speedIndex = Math.min(state.sim.speedIndex + 1, speeds.length - 1);
    else if (state.sim.timer && opposites[state.sim.direction] === direction && state.sim.speedIndex > 0) state.sim.speedIndex -= 1;
    else { state.sim.direction = direction; state.sim.speedIndex = 0; }
    document.querySelectorAll('[data-move],[data-stop-move]').forEach((b) => b.classList.remove('is-active'));
    button?.classList.add('is-active');
    if (state.sim.timer) clearInterval(state.sim.timer);
    simTick();
    state.sim.timer = setInterval(simTick, 250);
  }
  function stopSimMovement() {
    if (state.sim.timer) clearInterval(state.sim.timer);
    state.sim.timer = null;
    state.sim.direction = null;
    state.sim.speedIndex = 0;
    document.querySelectorAll('[data-move],[data-stop-move]').forEach((b) => b.classList.remove('is-active'));
    document.querySelector('[data-stop-move]')?.classList.add('is-active');
    publishMotion({ moving: false, speed_mps: 0, heading_degrees: null, likely_boat: state.sim.water, on_water_hint: state.sim.water, location: pointObject(marker.getLatLng()), simulated: true });
    $('#simulator-status') && ($('#simulator-status').textContent = 'Movimiento detenido · Mapa libre');
  }
  function simTick() {
    const dir = directions[state.sim.direction];
    if (!dir) return;
    const speed = speeds[state.sim.speedIndex];
    const p = marker.getLatLng();
    const meters = (speed.kmh * 1000 / 3600) * 0.25;
    const next = L.latLng(p.lat + (meters * dir.n) / 111320, p.lng + (meters * dir.e) / (111320 * Math.max(0.15, Math.cos(p.lat * Math.PI / 180))));
    marker.setLatLng(next);
    publishMotion({ moving: true, speed_mps: speed.kmh / 3.6, heading_degrees: dir.b, likely_boat: state.sim.water, on_water_hint: state.sim.water, location: pointObject(next), simulated: true });
    $('#simulator-status') && ($('#simulator-status').textContent = `Moviendo hacia ${dir.label} · ${speed.label} · ${speed.kmh} km/h · Mapa libre`);
  }

  function bindTrackRecorder() {
    $('#track-route-button')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      state.currentTrack ? stopTrack() : startTrack();
    }, true);
    $('#save-route-button')?.addEventListener('click', () => exportTrack(state.currentTrack || state.tracks.at(-1)), true);
  }
  function startTrack() {
    const id = `track-${Date.now()}`;
    state.currentTrack = { id, name: `${trackPrefix()} · ${new Date().toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}`, started_at: new Date().toISOString(), ended_at: null, points: [] };
    state.currentLine = L.polyline([], { weight: 5, opacity: 0.85 }).addTo(map);
    $('#track-route-button')?.classList.add('active');
    addTrackPoint(pointObject(marker.getLatLng()));
    renderTracks();
  }
  function stopTrack() {
    state.currentTrack.ended_at = new Date().toISOString();
    state.tracks.push(state.currentTrack);
    saveTracks();
    state.currentTrack = null;
    state.currentLine = null;
    $('#track-route-button')?.classList.remove('active');
    renderTracks();
  }
  function addTrackPoint(point) {
    if (!state.currentTrack || !point) return;
    const last = state.currentTrack.points.at(-1);
    if (last && map.distance([last.lat, last.lng], [point.lat, point.lng]) < 2) return;
    state.currentTrack.points.push({ lat: point.lat, lng: point.lng, at: new Date().toISOString() });
    state.currentLine?.setLatLngs(state.currentTrack.points.map((p) => [p.lat, p.lng]));
    renderTracks();
  }
  function trackPrefix() {
    const status = $('.status-rail .metric:nth-child(1) strong')?.textContent || 'Track';
    if (state.sim.active) return 'Simulación';
    if (status.includes('Naveg')) return 'Navegación';
    if (status.includes('Bici')) return 'Bicicleta';
    if (status.includes('Condu')) return 'Auto';
    if (status.includes('Camin')) return 'Caminata';
    return 'Track';
  }
  function buildTrackList() {
    const section = $('.route-tracker-section');
    if (!section || $('#wander-track-list')) return;
    const list = document.createElement('div');
    list.id = 'wander-track-list';
    list.className = 'wander-track-list';
    section.appendChild(list);
    renderTracks();
  }
  function renderTracks() {
    const summary = $('#track-summary');
    if (summary) summary.textContent = state.currentTrack ? `Grabando: ${state.currentTrack.name} · ${state.currentTrack.points.length} puntos` : `${state.tracks.length} ${state.tracks.length === 1 ? 'track guardado' : 'tracks guardados'}`;
    const badge = $('#track-status-badge');
    if (badge) badge.textContent = state.currentTrack ? 'REC' : 'OFF';
    const list = $('#wander-track-list');
    if (!list) return;
    list.innerHTML = [...state.tracks, state.currentTrack].filter(Boolean).slice(-5).map((track) => `<div class="wander-track-row"><div><strong>${track.name}</strong><small>${track.points.length} puntos</small></div><button type="button" data-export-track="${track.id}">Exportar</button></div>`).join('');
    list.querySelectorAll('[data-export-track]').forEach((button) => button.addEventListener('click', () => exportTrack([...state.tracks, state.currentTrack].find((track) => track?.id === button.dataset.exportTrack))));
  }
  function exportTrack(track) {
    if (!track) return;
    const feature = { type: 'Feature', properties: { name: track.name, started_at: track.started_at, ended_at: track.ended_at }, geometry: { type: 'LineString', coordinates: track.points.map((p) => [p.lng, p.lat]) } };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(feature, null, 2)], { type: 'application/geo+json' }));
    a.download = `${track.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.geojson`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function pointObject(point) { return { lat: point.lat, lng: point.lng }; }
  function say(t, m) { $('#wander-title') && ($('#wander-title').textContent = t); $('#wander-message') && ($('#wander-message').textContent = m); $('.companion-panel')?.classList.remove('is-hidden'); }
})();