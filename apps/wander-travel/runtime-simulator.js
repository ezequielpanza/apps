(() => {
  const base = window.WanderBase;
  if (!base) return;

  const map = base.map;
  const $ = (selector) => document.querySelector(selector);
  let enabled = false;
  let timer = null;
  let heading = null;
  let speedKmh = 0;
  let pointerId = null;

  const MAX_SPEED_KMH = 80;
  const TICK_MS = 100;

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

  function ensurePosition() {
    if (base.hasPosition()) return true;
    const center = map.getCenter();
    const position = base.setPosition(center, { source: 'simulator', confidence: 1 });
    if (!position) return false;
    map.setView(position, Math.max(map.getZoom(), 15));
    return true;
  }

  function stopMotion({ updateContext = true } = {}) {
    if (timer) clearInterval(timer);
    timer = null;
    heading = null;
    speedKmh = 0;

    const knob = $('#simulation-joystick-knob');
    if (knob) knob.style.transform = 'translate(0px, 0px)';

    if (enabled && updateContext && base.hasPosition()) {
      window.WanderUI?.setMotion(false, 0, null, {
        source: 'simulator',
        motionStatus: 'stationary',
        motionMode: 'unknown',
        contextStatus: 'En pausa',
        contextActivity: 'paused',
        confidence: 1,
      });
    }
  }

  function setEnabled(next) {
    enabled = Boolean(next);
    window.WanderSimulationActive = enabled;
    stopMotion({ updateContext: false });

    if (enabled) {
      ensurePosition();
      setPanelStatus('Simulación activa · controles disponibles sobre el mapa');
      window.WanderContext?.set('simulation.status', 'active', { source: 'simulator', ttlMs: Infinity, confidence: 1 });
    } else {
      setPanelStatus('Simulación desactivada · Wander usa contexto real');
      window.WanderContext?.set('simulation.status', 'inactive', { source: 'simulator', ttlMs: Infinity, confidence: 1 });
    }

    syncVisualState();
  }

  function profileForSpeed(kmh) {
    if (kmh < 8) return { mode: 'walking', status: 'Caminando', activity: 'walking' };
    if (kmh < 25) return { mode: 'cycling', status: 'Andando en bicicleta', activity: 'cycling' };
    return { mode: 'driving', status: 'Conduciendo', activity: 'driving' };
  }

  function tick() {
    if (!enabled || !Number.isFinite(heading) || speedKmh <= 0) return;
    if (!ensurePosition()) return;

    const current = base.getPosition();
    if (!current) return;

    const distanceMeters = (speedKmh * 1000 / 3600) * (TICK_MS / 1000);
    const radians = heading * Math.PI / 180;
    const north = Math.cos(radians) * distanceMeters;
    const east = Math.sin(radians) * distanceMeters;
    const next = L.latLng(
      current.lat + north / 111320,
      current.lng + east / (111320 * Math.max(0.15, Math.cos(current.lat * Math.PI / 180)))
    );

    const profile = profileForSpeed(speedKmh);
    base.setPosition(next, { source: 'simulator', confidence: 1 });
    window.WanderUI?.setMotion(true, speedKmh / 3.6, heading, {
      source: 'simulator',
      motionStatus: 'moving',
      motionMode: profile.mode,
      contextStatus: profile.status,
      contextActivity: profile.activity,
      confidence: 1,
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

    if (!timer) timer = setInterval(tick, TICK_MS);
    tick();
  }

  function releaseJoystick(event) {
    if (pointerId != null && event?.pointerId != null && event.pointerId !== pointerId) return;
    pointerId = null;
    stopMotion();
    const hud = $('#simulation-hud-value');
    if (hud) hud.textContent = '0.0 km/h · —';
  }

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

  setEnabled(false);
})();
