(() => {
  if (window.__wanderCompassToggleFix) return;
  window.__wanderCompassToggleFix = true;

  const MODES = ['center', 'route', 'compass', 'north'];
  let modeIndex = 0;
  let compassBearing = null;
  let compassStarted = false;

  function normalize(value) {
    return ((Number(value) || 0) % 360 + 360) % 360;
  }

  function point() {
    try {
      if (typeof marker !== 'undefined' && marker?.getLatLng) return marker.getLatLng();
    } catch {}
    return null;
  }

  function center(force = false) {
    try {
      if (typeof map === 'undefined') return;
      const p = point();
      if (!p) return;
      if (force) map.panTo(p, { animate: true });
      else {
        const centerPoint = map.latLngToContainerPoint(map.getCenter());
        const targetPoint = map.latLngToContainerPoint(p);
        if (centerPoint.distanceTo(targetPoint) > 36) map.panTo(p, { animate: true });
      }
      window.setTimeout(() => map.invalidateSize(true), 80);
    } catch {}
  }

  function routeBearing() {
    return normalize(window.wanderMotionContext?.heading_degrees || 0);
  }

  function setRotation(degrees) {
    document.documentElement.style.setProperty('--wander-map-rotation', `${-normalize(degrees)}deg`);
  }

  function icon(mode) {
    if (mode === 'route') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 21 12 17 5 21 12 3Z" fill="currentColor" stroke="none"/></svg><span class="mode-badge">R</span>';
    if (mode === 'compass') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 4 16 15 12 13 8 15 12 4Z" fill="currentColor" stroke="none"/></svg><span class="mode-badge">B</span>';
    if (mode === 'north') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V5"/><path d="m6 11 6-6 6 6"/><text x="12" y="5.7" text-anchor="middle" style="font:800 5px system-ui;fill:currentColor;stroke:none">N</text></svg><span class="mode-badge">N</span>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/><circle cx="12" cy="12" r="4"/></svg><span class="mode-badge">•</span>';
  }

  function render() {
    const button = document.querySelector('#locate-button');
    if (!button) return;
    const mode = MODES[modeIndex];
    button.dataset.orientation = mode;
    button.innerHTML = icon(mode);
    button.setAttribute('aria-label', 'Brújula y ubicación');
    button.title = mode === 'center' ? 'Centrar ubicación' : mode === 'route' ? 'Seguir movimiento' : mode === 'compass' ? 'Seguir brújula' : 'Norte arriba';
    const svg = button.querySelector('svg');
    if (svg && mode === 'route') svg.style.transform = `rotate(${routeBearing()}deg)`;
    if (svg && mode === 'compass') svg.style.transform = `rotate(${normalize(compassBearing || 0)}deg)`;
  }

  function apply() {
    const mode = MODES[modeIndex];
    const rotate = mode === 'route' || mode === 'compass';
    document.body.classList.toggle('wander-map-heading', rotate);
    if (mode === 'route') setRotation(routeBearing());
    else if (mode === 'compass') setRotation(compassBearing || 0);
    else setRotation(0);
    center(mode === 'route' || mode === 'compass');
    render();
  }

  function startCompass() {
    if (compassStarted) return true;
    compassStarted = true;
    const update = (degrees) => {
      if (!Number.isFinite(degrees)) return;
      compassBearing = normalize(degrees);
      if (MODES[modeIndex] === 'compass') apply();
    };
    window.addEventListener('deviceorientationabsolute', (event) => update(event.alpha));
    window.addEventListener('deviceorientation', (event) => {
      if (Number.isFinite(event.webkitCompassHeading)) update(event.webkitCompassHeading);
      else if (Number.isFinite(event.alpha)) update(event.absolute ? event.alpha : 360 - event.alpha);
    });
    return true;
  }

  async function ensureCompass() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') return false;
      }
      return startCompass();
    } catch {
      return false;
    }
  }

  async function handleClick(event) {
    const button = event.target?.closest?.('#locate-button');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    modeIndex = (modeIndex + 1) % MODES.length;
    if (MODES[modeIndex] === 'compass') {
      const ok = await ensureCompass();
      if (!ok) modeIndex = MODES.indexOf('north');
    }
    apply();
  }

  document.addEventListener('click', handleClick, true);
  document.addEventListener('touchend', handleClick, true);
  document.addEventListener('wander:motion-context', () => {
    if (MODES[modeIndex] === 'route') apply();
  });

  render();
  window.setInterval(render, 1000);
})();