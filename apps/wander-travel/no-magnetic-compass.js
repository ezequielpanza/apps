(() => {
  if (window.__wanderNoMagneticCompass) return;
  window.__wanderNoMagneticCompass = true;

  const MODES = ['center', 'route', 'north'];
  let modeIndex = 0;
  let visualRotation = 0;

  function normalize(value) {
    return ((Number(value) || 0) % 360 + 360) % 360;
  }

  function shortestEquivalent(target, reference) {
    let next = target;
    while (next - reference > 180) next -= 360;
    while (next - reference < -180) next += 360;
    return next;
  }

  function currentRouteBearing() {
    return normalize(window.wanderMotionContext?.heading_degrees || 0);
  }

  function setRotation(value) {
    const target = -normalize(value);
    visualRotation = shortestEquivalent(target, visualRotation);
    document.documentElement.style.setProperty('--wander-map-rotation', `${visualRotation}deg`);
  }

  function resetRotation() {
    visualRotation = shortestEquivalent(0, visualRotation);
    document.documentElement.style.setProperty('--wander-map-rotation', `${visualRotation}deg`);
  }

  function centerOnMarker(force = false) {
    try {
      if (typeof map === 'undefined' || typeof marker === 'undefined') return;
      const point = marker.getLatLng();
      if (!point) return;
      if (force) {
        map.panTo(point, { animate: true });
        return;
      }
      const center = map.latLngToContainerPoint(map.getCenter());
      const target = map.latLngToContainerPoint(point);
      if (center.distanceTo(target) > 36) map.panTo(point, { animate: true });
    } catch {}
  }

  function iconFor(mode) {
    if (mode === 'route') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 21 12 17 5 21 12 3Z" fill="currentColor" stroke="none"/></svg><span class="mode-badge">R</span>';
    if (mode === 'north') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V5"/><path d="m6 11 6-6 6 6"/><text x="12" y="5.7" text-anchor="middle" style="font:800 5px system-ui;fill:currentColor;stroke:none">N</text></svg><span class="mode-badge">N</span>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/><circle cx="12" cy="12" r="4"/></svg><span class="mode-badge">•</span>';
  }

  function render() {
    const button = document.querySelector('#locate-button');
    if (!button) return;
    const mode = MODES[modeIndex];
    button.dataset.orientation = mode;
    button.innerHTML = iconFor(mode);
    button.setAttribute('aria-label', 'Ubicación y orientación');
    button.title = mode === 'center' ? 'Centrar ubicación' : mode === 'route' ? 'Alinear con la ruta' : 'Norte arriba';
    const svg = button.querySelector('svg');
    if (svg && mode === 'route') svg.style.transform = `rotate(${currentRouteBearing()}deg)`;
  }

  function apply() {
    const mode = MODES[modeIndex];
    document.body.classList.toggle('wander-map-heading', mode === 'route');
    if (mode === 'route') {
      setRotation(currentRouteBearing());
      centerOnMarker(true);
    } else {
      resetRotation();
      if (mode === 'center') centerOnMarker(true);
    }
    render();
  }

  function handle(event) {
    const button = event.target?.closest?.('#locate-button');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    modeIndex = (modeIndex + 1) % MODES.length;
    apply();
  }

  document.addEventListener('click', handle, true);
  document.addEventListener('touchend', handle, true);
  document.addEventListener('wander:motion-context', () => {
    if (MODES[modeIndex] === 'route') apply();
  });

  window.WanderOrientationMode = {
    modes: () => [...MODES],
    current: () => MODES[modeIndex],
    set(mode) {
      const index = MODES.indexOf(mode);
      if (index >= 0) {
        modeIndex = index;
        apply();
      }
    }
  };

  render();
  window.setInterval(render, 1000);
})();