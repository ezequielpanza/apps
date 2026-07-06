(() => {
  const base = window.WanderBase;
  const context = window.WanderContext;
  if (!base || !context) return;

  const providers = window.WanderProviders || (window.WanderProviders = {});
  const $ = (selector) => document.querySelector(selector);
  const MAX_SPEED_KMH = 40;
  let enabled = false;
  let timer = null;
  let heading = null;
  let speedKmh = 0;
  let pointerId = null;
  let lastTickAt = null;

  function overridePosition() {
    if (context.value('location.override.enabled', false) !== true) return null;
    const lat = Number(context.value('location.override.lat'));
    const lng = Number(context.value('location.override.lng'));
    return Number.isFinite(lat) && Number.isFinite(lng) ? L.latLng(lat, lng) : null;
  }

  function seedFromReal() {
    const real = base.getRealPosition?.();
    if (!real || !context.setLocationOverride({ lat: real.lat, lng: real.lng, speedMps: 0 })) return null;
    base.map.setView(real, Math.max(base.map.getZoom(), 15));
    return real;
  }

  function currentPosition() {
    return overridePosition() || seedFromReal();
  }

  function syncVisual() {
    const toggle = $('#simulation-toggle');
    const controls = $('#simulation-map-controls');
    const state = $('#simulation-toggle-state');
    if (toggle) toggle.checked = enabled;
    if (controls) controls.hidden = !enabled;
    if (state) state.textContent = enabled ? 'Activado' : 'Desactivado';
    document.body.classList.toggle('simulation-enabled', enabled);
  }

  function panelStatus(text) {
    const node = $('#sim-status');
    if (node) node.textContent = text;
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
    lastTickAt = null;
  }

  function stopMotion() {
    stopTimer();
    heading = null;
    speedKmh = 0;
    const knob = $('#simulation-joystick-knob');
    if (knob) knob.style.transform = 'translate(0px, 0px)';
    const current = enabled ? currentPosition() : null;
    if (current) context.setLocationOverride({ lat: current.lat, lng: current.lng, speedMps: 0 });
  }

  function setEnabled(next) {
    const target = Boolean(next);
    if (target === enabled) return syncVisual();
    stopMotion();
    enabled = target;

    if (enabled) {
      const seed = seedFromReal();
      context.set('simulation.status', 'active', { source: 'simulator', kind: 'observed', ttlMs: Infinity, confidence: 1 });
      panelStatus(seed ? 'Simulación activa · iniciada desde la última ubicación real conocida' : 'Simulación activa · esperando una ubicación real para inicializar');
    } else {
      context.clearLocationOverride();
      context.set('simulation.status', 'inactive', { source: 'simulator', kind: 'observed', ttlMs: Infinity, confidence: 1 });
      panelStatus('Simulación desactivada · ubicación efectiva restaurada desde GPS real');
    }
    syncVisual();
  }

  function tick() {
    const now = performance.now();
    if (lastTickAt == null) return void (lastTickAt = now);
    const elapsedMs = Math.min(Math.max(0, now - lastTickAt), 250);
    lastTickAt = now;
    if (!enabled || !Number.isFinite(heading) || speedKmh <= 0 || elapsedMs <= 0) return;

    const current = currentPosition();
    if (!current) return;
    const meters = speedKmh / 3.6 * elapsedMs / 1000;
    const radians = heading * Math.PI / 180;
    const next = L.latLng(
      current.lat + Math.cos(radians) * meters / 111320,
      current.lng + Math.sin(radians) * meters / (111320 * Math.max(0.15, Math.cos(current.lat * Math.PI / 180)))
    );
    context.setLocationOverride({ lat: next.lat, lng: next.lng, heading, speedMps: speedKmh / 3.6 });
    window.WanderTracks?.addPoint(next);
    const hud = $('#simulation-hud-value');
    if (hud) hud.textContent = speedKmh.toFixed(1) + ' km/h · ' + Math.round(heading) + '°';
  }

  function moveJoystick(x, y) {
    const joystick = $('#simulation-joystick-base');
    const knob = $('#simulation-joystick-knob');
    if (!joystick || !knob) return;
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const max = rect.width * 0.34;
    let dx = x - cx;
    let dy = y - cy;
    const distance = Math.hypot(dx, dy);
    const limited = Math.min(distance, max);
    if (distance > 0) { dx = dx / distance * limited; dy = dy / distance * limited; }
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    speedKmh = (max ? limited / max : 0) * MAX_SPEED_KMH;
    heading = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    if (!timer) { lastTickAt = performance.now(); timer = setInterval(tick, 100); }
  }

  function release(event) {
    if (pointerId != null && event?.pointerId != null && event.pointerId !== pointerId) return;
    pointerId = null;
    stopMotion();
    const hud = $('#simulation-hud-value');
    if (hud) hud.textContent = '0.0 km/h · —';
  }

  context.subscribe((key) => {
    if (enabled && !overridePosition() && (key === 'location.real' || key.startsWith('location.real.'))) seedFromReal();
  });

  $('#simulation-toggle')?.addEventListener('change', (event) => setEnabled(event.target.checked));
  const joystick = $('#simulation-joystick-base');
  joystick?.addEventListener('pointerdown', (event) => { if (!enabled) return; pointerId = event.pointerId; joystick.setPointerCapture?.(event.pointerId); moveJoystick(event.clientX, event.clientY); });
  joystick?.addEventListener('pointermove', (event) => { if (enabled && event.pointerId === pointerId) moveJoystick(event.clientX, event.clientY); });
  joystick?.addEventListener('pointerup', release);
  joystick?.addEventListener('pointercancel', release);
  joystick?.addEventListener('lostpointercapture', release);

  providers.simulator = {
    enable: () => setEnabled(true),
    disable: () => setEnabled(false),
    setEnabled,
    isEnabled: () => enabled,
    stop: stopMotion,
  };

  window.WanderSimulator = providers.simulator;
  context.set('simulation.status', 'inactive', { source: 'init', kind: 'observed', ttlMs: Infinity, confidence: 1 });
  syncVisual();
})();
