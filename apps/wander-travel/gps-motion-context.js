(() => {
  if (window.__wanderGpsMotionContext) return;
  window.__wanderGpsMotionContext = true;
  if (typeof marker === 'undefined' || typeof L === 'undefined') return;

  let lastPoint = marker.getLatLng();
  let lastAt = Date.now();
  let lastHeading = 0;
  let lastSpeed = 0;
  let initialCentered = false;
  let lastGpsPoint = null;
  let lastGpsSpeed = 0;
  let lastGpsHeading = 0;

  function normalize(value) { return ((Number(value) || 0) % 360 + 360) % 360; }
  function bearing(a, b) {
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return normalize(Math.atan2(y, x) * 180 / Math.PI);
  }
  function publish(point, speedMps, heading) {
    const speedKnots = speedMps * 1.943844;
    const likelyBoat = speedKnots >= 3.5;
    const detail = {
      transport_mode: likelyBoat ? 'boat' : 'walking_or_land',
      likely_boat: likelyBoat,
      speed_mps: speedMps,
      speed_knots: speedKnots,
      heading_degrees: normalize(heading),
      moving: speedMps > 0.6,
      on_water_hint: likelyBoat,
      location: { lat: point.lat, lng: point.lng },
      updated_at: new Date().toISOString(),
    };
    window.wanderMotionContext = detail;
    document.dispatchEvent(new CustomEvent('wander:motion-context', { detail }));
  }
  function setReadout(point, label) {
    const readout = document.querySelector('#location-readout');
    if (!readout) return;
    const strong = readout.querySelector('strong');
    const small = readout.querySelector('small');
    if (strong) strong.textContent = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
    if (small) small.textContent = label;
  }
  function update(point, gpsSpeed, gpsHeading, options = {}) {
    lastGpsPoint = point;
    lastGpsSpeed = Number.isFinite(gpsSpeed) && gpsSpeed >= 0 ? gpsSpeed : lastGpsSpeed;
    lastGpsHeading = Number.isFinite(gpsHeading) && gpsHeading >= 0 ? gpsHeading : lastGpsHeading;
    if (window.WanderSimulationActive && !options.forceReal) return;
    const now = Date.now();
    const elapsed = Math.max(0.2, (now - lastAt) / 1000);
    let speed = Number.isFinite(gpsSpeed) && gpsSpeed >= 0 ? gpsSpeed : 0;
    let heading = Number.isFinite(gpsHeading) && gpsHeading >= 0 ? gpsHeading : lastHeading;
    try {
      const moved = typeof map !== 'undefined' ? map.distance(lastPoint, point) : 0;
      if (!speed && moved > 0.5) speed = moved / elapsed;
      if (!(Number.isFinite(gpsHeading) && gpsHeading >= 0) && moved > 1.5) heading = bearing(lastPoint, point);
    } catch {}
    lastPoint = point;
    lastAt = now;
    lastSpeed = speed;
    lastHeading = heading;
    try { window.WanderRevealMarker?.(); marker.setLatLng(point); } catch {}
    setReadout(point, 'GPS');
    if (!initialCentered && typeof map !== 'undefined') {
      initialCentered = true;
      try { map.setView(point, Math.max(map.getZoom(), 14), { animate: false }); } catch {}
    }
    publish(point, speed, heading);
  }
  function returnToGps() {
    window.WanderSimulationActive = false;
    window.WanderSimulatedMotion = null;
    if (lastGpsPoint) update(lastGpsPoint, lastGpsSpeed, lastGpsHeading, { forceReal: true });
  }
  function start() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition(
      (pos) => update(L.latLng(pos.coords.latitude, pos.coords.longitude), pos.coords.speed, pos.coords.heading),
      () => {},
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }
  window.WanderGpsContext = { returnToGps, last: () => lastGpsPoint };
  document.addEventListener('wander:simulation-closed', returnToGps);
  start();
})();