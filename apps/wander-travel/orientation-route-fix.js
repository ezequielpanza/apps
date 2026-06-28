(() => {
  if (typeof map === 'undefined' || typeof marker === 'undefined' || typeof L === 'undefined') return;

  const MODES = ['center', 'route', 'compass', 'north'];
  let modeIndex = 0;
  let routeBearing = 0;
  let compassBearing = null;
  let lastPoint = marker.getLatLng();
  let isMoving = false;
  let recording = false;
  let recordedPoints = [];
  let compassReady = false;

  const style = document.createElement('style');
  style.textContent = `
    body.wander-map-heading .leaflet-map-pane{rotate:var(--wander-map-rotation,0deg);transform-origin:50% 50%;transition:rotate .18s ease}
    .wander-user-arrow{width:30px;height:30px;display:grid;place-items:center;transform:rotate(var(--wander-user-bearing,0deg))}
    .wander-user-arrow::before{content:"";width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:22px solid #173f3b;filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))}
    .wander-user-dot{width:18px;height:18px;border-radius:50%;background:#173f3b;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)}
    #locate-button .mode-badge{position:absolute;right:5px;bottom:4px;min-width:15px;height:15px;border-radius:999px;background:rgba(23,63,59,.92);color:#fff;font:800 8px/15px system-ui;text-align:center}
    #locate-button[data-orientation="compass"] .mode-badge{background:#fff;color:#173f3b}
  `;
  document.head.appendChild(style);

  const trackLine = L.polyline([], { weight: 5, opacity: 0.85 }).addTo(map);

  function normalize(value) {
    return ((Number(value) || 0) % 360 + 360) % 360;
  }

  function bearing(a, b) {
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return normalize(Math.atan2(y, x) * 180 / Math.PI);
  }

  function isCentered(point) {
    const center = map.latLngToContainerPoint(map.getCenter());
    const target = map.latLngToContainerPoint(point);
    return center.distanceTo(target) < 36;
  }

  function centerOnlyIfNeeded(point) {
    if (!point || isCentered(point)) return;
    map.panTo(point, { animate: true });
    window.setTimeout(() => map.invalidateSize(true), 80);
  }

  function setMapRotation(degrees) {
    document.documentElement.style.setProperty('--wander-map-rotation', `${-normalize(degrees)}deg`);
  }

  function applyMapMode() {
    const mode = MODES[modeIndex];
    const shouldRotate = mode === 'route' || mode === 'compass';
    document.body.classList.toggle('wander-map-heading', shouldRotate);
    if (mode === 'route') setMapRotation(routeBearing);
    else if (mode === 'compass') setMapRotation(Number.isFinite(compassBearing) ? compassBearing : 0);
    else setMapRotation(0);
  }

  function iconForMode(mode) {
    if (mode === 'route') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 21 12 17 5 21 12 3Z" fill="currentColor" stroke="none"/></svg><span class="mode-badge">R</span>';
    if (mode === 'compass') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 4 16 15 12 13 8 15 12 4Z" fill="currentColor" stroke="none"/></svg><span class="mode-badge">B</span>';
    if (mode === 'north') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V5"/><path d="m6 11 6-6 6 6"/><text x="12" y="5.7" text-anchor="middle" style="font:800 5px system-ui;fill:currentColor;stroke:none">N</text></svg><span class="mode-badge">N</span>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/><circle cx="12" cy="12" r="4"/></svg><span class="mode-badge">•</span>';
  }

  function renderLocateButton() {
    const button = document.querySelector('#locate-button');
    if (!button) return;
    const mode = MODES[modeIndex];
    button.dataset.orientation = mode;
    button.innerHTML = iconForMode(mode);
    button.title = mode === 'center' ? 'Centrar' : mode === 'route' ? 'Seguir movimiento' : mode === 'compass' ? 'Seguir brújula' : 'Norte arriba';
    const svg = button.querySelector('svg');
    if (svg && mode === 'route') svg.style.transform = `rotate(${routeBearing}deg)`;
    if (svg && mode === 'compass') svg.style.transform = `rotate(${Number.isFinite(compassBearing) ? compassBearing : 0}deg)`;
  }

  function setUserIcon() {
    const icon = L.divIcon({
      className: '',
      html: isMoving ? `<div class="wander-user-arrow" style="--wander-user-bearing:${routeBearing}deg"></div>` : '<div class="wander-user-dot"></div>',
      iconSize: isMoving ? [30, 30] : [18, 18],
      iconAnchor: isMoving ? [15, 15] : [9, 9],
    });
    marker.setIcon(icon);
  }

  function addRecordedPoint(point) {
    if (!recording || !point) return;
    const last = recordedPoints[recordedPoints.length - 1];
    if (last && map.distance(L.latLng(last[0], last[1]), point) < 2) return;
    recordedPoints.push([point.lat, point.lng]);
    trackLine.setLatLngs(recordedPoints);
    const badge = document.querySelector('#track-status-badge');
    if (badge) badge.textContent = 'ON';
    const summary = document.querySelector('#track-summary');
    if (summary) {
      const km = recordedPoints.length < 2 ? 0 : recordedPoints.slice(1).reduce((total, p, i) => total + map.distance(L.latLng(recordedPoints[i][0], recordedPoints[i][1]), L.latLng(p[0], p[1])), 0) / 1000;
      summary.textContent = `${recordedPoints.length} puntos · ${km.toFixed(2)} km`;
    }
  }

  function updatePosition(point, heading) {
    if (!point) return;
    const movedMeters = lastPoint ? map.distance(lastPoint, point) : 0;
    if (Number.isFinite(heading) && heading >= 0) routeBearing = normalize(heading);
    else if (movedMeters > 1.5) routeBearing = bearing(lastPoint, point);
    isMoving = movedMeters > 1.5;
    lastPoint = L.latLng(point.lat, point.lng);
    marker.setLatLng(point);
    setUserIcon();
    addRecordedPoint(point);
    centerOnlyIfNeeded(point);
    if (MODES[modeIndex] === 'route') setMapRotation(routeBearing);
    renderLocateButton();
  }

  function startGps() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition((position) => {
      updatePosition(L.latLng(position.coords.latitude, position.coords.longitude), position.coords.heading);
    }, () => {}, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
  }

  function startCompass() {
    if (compassReady) return;
    compassReady = true;
    const update = (degrees) => {
      if (!Number.isFinite(degrees)) return;
      compassBearing = normalize(degrees);
      if (MODES[modeIndex] === 'compass') {
        setMapRotation(compassBearing);
        renderLocateButton();
      }
    };
    window.addEventListener('deviceorientationabsolute', (event) => update(event.alpha));
    window.addEventListener('deviceorientation', (event) => {
      if (Number.isFinite(event.webkitCompassHeading)) update(event.webkitCompassHeading);
      else if (Number.isFinite(event.alpha)) update(event.absolute ? event.alpha : 360 - event.alpha);
    });
  }

  async function requestCompass() {
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') return false;
      }
      startCompass();
      return true;
    } catch {
      return false;
    }
  }

  function replaceLocateButton() {
    const oldButton = document.querySelector('#locate-button');
    if (!oldButton) return;
    const button = oldButton.cloneNode(false);
    button.id = 'locate-button';
    button.className = oldButton.className;
    button.type = 'button';
    oldButton.replaceWith(button);
    renderLocateButton();
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      modeIndex = (modeIndex + 1) % MODES.length;
      if (MODES[modeIndex] === 'compass') {
        const ok = await requestCompass();
        if (!ok) modeIndex = 3;
      }
      applyMapMode();
      renderLocateButton();
      centerOnlyIfNeeded(marker.getLatLng());
    });
  }

  function replaceTrackButton() {
    const oldButton = document.querySelector('#track-route-button');
    if (!oldButton) return;
    const button = oldButton.cloneNode(false);
    button.id = 'track-route-button';
    button.className = oldButton.className;
    button.type = 'button';
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="record-dot" cx="12" cy="12" r="6"/></svg>';
    button.setAttribute('aria-label', 'Grabar recorrido');
    oldButton.replaceWith(button);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      recording = !recording;
      button.classList.toggle('active', recording);
      const badge = document.querySelector('#track-status-badge');
      if (badge) badge.textContent = recording ? 'ON' : 'OFF';
      if (recording && recordedPoints.length === 0) addRecordedPoint(marker.getLatLng());
    });
  }

  replaceLocateButton();
  replaceTrackButton();
  setUserIcon();
  startGps();
  startCompass();
})();
