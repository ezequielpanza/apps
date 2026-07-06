(() => {
  const base = window.WanderBase;
  const body = window.WanderBody;
  const context = window.WanderContext;
  if (!base || !body || !context) return;

  const $ = (selector) => document.querySelector(selector);
  let enabled = false;
  let timer = null;
  let heading = null;
  let speedKmh = 0;
  let pointerId = null;
  let lastTickAt = null;

  const MAX_SPEED_KMH = 80;
  const TICK_MS = 100;
  const MAX_DELTA_MS = 250;

  function setPanelStatus(message) {
    const item = $('#sim-status');
    if (item) item.textContent = message;
  }

  function syncVisualState() {
    const toggle = $('#simulation-toggle');
    const controls = $('#simulation-map-controls');
    const stateText = $('#simulation-toggle-state');
    if (toggle) toggle.checked = enabled;
    if (controls) controls.hidden = !enabled;
    if (stateText) stateText.textContent = enabled ? 'Activado' : 'Desactivado';
    document.body.classList.toggle('simulation-enabled', enabled);
  }

  function existingOverridePosition() {
    const override = body.getLocationOverride();
    if (!override?.enabled || override.status !== 'available') return null;
    return L.latLng(override.lat, override.lng);
  }

  function seedOverrideFromReal() {
    const real = body.getRealLocation();
    if (!real || real.status !== 'available') return null;
    if (!body.setLocationOverride({ lat: real.lat, lng: real.lng, speedMps: 0 })) return null;
    const seeded = L.latLng(real.lat, real.lng);
    base.map.setView(seeded, Math.max(base.map.getZoom(), 15));
    return seeded;
  }

  function ensureOverridePosition() {
    return existingOverridePosition() || seedOverrideFromReal();
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
    lastTickAt = null;
  }

  function startTimer() {
    if (timer) return;
    lastTickAt = performance.now();
    timer = setInterval(tick, TICK_MS);
  }

  function stopMotion() {
    stopTimer();
    heading = null;
    speedKmh = 0;
    const knob = $('#simulation-joystick-knob');
    if (knob) knob.style.transform = 'translate(0px, 0px)';
    if (!enabled) return;
    const current = ensureOverridePosition();
    if (current) body.setLocationOverride({ lat: current.lat, lng: current.lng, speedMps: 0 });
  }

  function setEnabled(next) {
    const shouldEnable = Boolean(next);
    if (shouldEnable === enabled) {
      syncVisualState();
      return;
    }

    stopMotion();
    enabled = shouldEnable;
    window.WanderSimulationActive = enabled;

    if (enabled) {
      const seed = seedOverrideFromReal();
      setPanelStatus(seed
        ? 'Simulación activa · iniciada desde la última ubicación real conocida'
        : 'Simulación activa · esperando una ubicación real para inicializar');
      context.set('simulation.status', 'active', { source: 'simulator', ttlMs: Infinity, confidence: 1 });
    } else {
      body.clearLocationOverride();
      setPanelStatus('Simulación desactivada · ubicación efectiva restaurada desde GPS real');
      context.set('simulation.status', 'inactive', { source: 'simulator', ttlMs: Infinity, confidence: 1 });
    }

    syncVisualState();
  }

  function tick() {
    const now = performance.now();
    if (lastTickAt == null) {
      lastTickAt = now;
      return;
    }

    const elapsedMs = Math.min(Math.max(0, now - lastTickAt), MAX_DELTA_MS);
    lastTickAt = now;
    if (!enabled || !Number.isFinite(heading) || speedKmh <= 0 || elapsedMs <= 0) return;

    const current = ensureOverridePosition();
    if (!current) return;

    const distanceMeters = (speedKmh * 1000 / 3600) * (elapsedMs / 1000);
    const radians = heading * Math.PI / 180;
    const north = Math.cos(radians) * distanceMeters;
    const east = Math.sin(radians) * distanceMeters;
    const next = L.latLng(
      current.lat + north / 111320,
      current.lng + east / (111320 * Math.max(0.15, Math.cos(current.lat * Math.PI / 180)))
    );

    body.setLocationOverride({
      lat: next.lat,
      lng: next.lng,
      heading,
      speedMps: speedKmh / 3.6,
    });
    window.WanderTracks?.addPoint(next);

    const hud = $('#simulation-hud-value');
    if (hud) hud.textContent = speedKmh.toFixed(1) + ' km/h · ' + Math.round(heading) + '°';
  }

  function updateJoystick(clientX, clientY) {
    const baseElement = $('#simulation-joystick-base');
    const knob = $('#simulation-joystick-knob');
    if (!baseElement || !knob) return;

    const rect = baseElement.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxRadius = rect.width * 0.34;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const distance = Math.hypot(dx, dy);
    const limited = Math.min(distance, maxRadius);

    if (distance > 0) {
      dx = dx / distance * limited;
      dy = dy / distance * limited;
    }

    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    const intensity = maxRadius ? limited / maxRadius : 0;
    speedKmh = intensity * MAX_SPEED_KMH;
    heading = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    startTimer();

    const hud = $('#simulation-hud-value');
    if (hud) hud.textContent = speedKmh.toFixed(1) + ' km/h · ' + Math.round(heading) + '°';
  }

  function releaseJoystick(event) {
    if (pointerId != null && event?.pointerId != null && event.pointerId !== pointerId) return;
    pointerId = null;
    stopMotion();
    const hud = $('#simulation-hud-value');
    if (hud) hud.textContent = '0.0 km/h · —';
  }

  body.subscribe((channel) => {
    if (!enabled || existingOverridePosition()) return;
    if (channel === 'location.real') {
      const seeded = seedOverrideFromReal();
      if (seeded) setPanelStatus('Simulación activa · iniciada desde la última ubicación real conocida');
    }
  });

  $('#simulation-toggle')?.addEventListener('change', (event) => setEnabled(event.target.checked));

  const joystick = $('#simulation-joystick-base');
  joystick?.addEventListener('pointerdown', (event) => {
    if (!enabled) return;
    pointerId = event.pointerId;
    joystick.setPointerCapture?.(event.pointerId);
    updateJoystick(event.clientX, event.clientY);
  });
  joystick?.addEventListener('pointermove', (event) => {
    if (!enabled || event.pointerId !== pointerId) return;
    updateJoystick(event.clientX, event.clientY);
  });
  joystick?.addEventListener('pointerup', releaseJoystick);
  joystick?.addEventListener('pointercancel', releaseJoystick);
  joystick?.addEventListener('lostpointercapture', releaseJoystick);

  window.WanderSimulator = {
    enable: () => setEnabled(true),
    disable: () => setEnabled(false),
    setEnabled,
    isEnabled: () => enabled,
    stop: stopMotion,
  };

  context.set('simulation.status', 'inactive', { source: 'init', ttlMs: Infinity, confidence: 1 });
  syncVisualState();
})();