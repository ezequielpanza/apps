(() => {
  if (typeof map === 'undefined' || typeof marker === 'undefined' || typeof L === 'undefined') return;

  const routeButton = document.querySelector('[data-message="route"]');
  if (!routeButton) return;

  let navigationLayer = null;
  let destinationMarker = null;
  let activeDestination = null;
  let recalcTimer = null;
  let lastRouteOrigin = null;
  let selectedTravelMode = localStorage.getItem('wander-travel-route-mode') || null;

  const status = document.createElement('div');
  status.id = 'wander-navigation-status';
  status.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:1200;display:none;max-width:min(92vw,520px);padding:12px 16px;border-radius:16px;background:#173f3b;color:#fff;box-shadow:0 12px 32px rgba(20,35,55,.28);font:700 .88rem/1.35 system-ui,sans-serif;text-align:center';
  document.body.appendChild(status);

  const modePanel = document.createElement('div');
  modePanel.id = 'wander-route-mode-panel';
  modePanel.style.cssText = 'position:fixed;left:50%;bottom:82px;transform:translateX(-50%);z-index:1250;display:none;max-width:min(92vw,420px);padding:14px;border-radius:18px;background:#fff;color:#173f3b;box-shadow:0 16px 42px rgba(20,35,55,.24);font:700 .86rem system-ui,sans-serif;text-align:center';
  modePanel.innerHTML = '<div style="margin-bottom:10px">Cómo vamos?</div><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button data-route-mode="walk">Caminando</button><button data-route-mode="bike">Bici / monopatín</button><button data-route-mode="car">Auto</button></div>';
  document.body.appendChild(modePanel);

  const modeStyle = document.createElement('style');
  modeStyle.textContent = '#wander-route-mode-panel button{border:1px solid #d7dee6;background:#fff;border-radius:999px;padding:9px 12px;cursor:pointer;font-weight:800;color:#173f3b}#wander-route-mode-panel button:hover{background:#e8f2f0}';
  document.head.appendChild(modeStyle);

  function inferredMode() {
    const mode = document.querySelector('.status-rail .metric:nth-child(1) strong')?.textContent?.toLowerCase() || '';
    if (mode.includes('bicicleta') || mode.includes('monopatín')) return 'bike';
    if (mode.includes('auto')) return 'car';
    if (mode.includes('caminando') || mode.includes('caminar')) return 'walk';
    return null;
  }

  function profileFor(mode) {
    if (mode === 'bike') return { bases: ['https://routing.openstreetmap.de/routed-bike/route/v1/driving'], speed: 16, label: 'en bici/monopatín', mode: 'bike' };
    if (mode === 'car') return { bases: ['https://router.project-osrm.org/route/v1/driving'], speed: 45, label: 'en auto', mode: 'car' };
    return { bases: ['https://routing.openstreetmap.de/routed-foot/route/v1/foot', 'https://routing.openstreetmap.de/routed-foot/route/v1/driving'], speed: 5, label: 'caminando', mode: 'walk' };
  }

  function currentProfile() {
    return profileFor(selectedTravelMode || inferredMode() || 'walk');
  }

  function formatDistance(meters) {
    return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
  }

  function showStatus(text) {
    status.textContent = text;
    status.style.display = 'block';
  }

  function setRouteButtonVisible(visible) {
    routeButton.hidden = !visible;
    routeButton.style.display = visible ? '' : 'none';
  }

  function getSuggestedDestination() {
    const destination = window.wanderGuideDestination;
    if (!destination || !Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) return null;
    return destination;
  }

  function drawDirectRoute(origin, destination, profile, fit, reason = 'Ruta directa aproximada') {
    if (navigationLayer) map.removeLayer(navigationLayer);
    navigationLayer = L.polyline([[origin.lat, origin.lng], [destination.lat, destination.lng]], { weight: 6, opacity: 0.75, dashArray: '10 8', color: '#147d78' }).addTo(map);
    const directDistance = map.distance(origin, [destination.lat, destination.lng]);
    const minutes = Math.max(1, Math.round((directDistance / 1000) / profile.speed * 60));
    showStatus(`${reason} a ${destination.name || 'el destino'} · ${profile.label} · ${formatDistance(directDistance)} · ${minutes} min`);
    if (fit) map.fitBounds(navigationLayer.getBounds().pad(0.2));
    lastRouteOrigin = L.latLng(origin.lat, origin.lng);
  }

  async function fetchRouteFromBases(profile, origin, destination) {
    let lastError = null;
    for (const base of profile.bases) {
      try {
        const url = `${base}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&steps=true&alternatives=true`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Routing ${response.status}`);
        const data = await response.json();
        const routes = (data.routes || []).filter((route) => route?.geometry?.coordinates?.length);
        if (routes.length) return routes.sort((a, b) => a.distance - b.distance)[0];
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Sin ruta');
  }

  async function buildRoute(destination, fit = true) {
    const origin = marker.getLatLng();
    const profile = currentProfile();
    const directDistance = map.distance(origin, [destination.lat, destination.lng]);

    try {
      const route = await fetchRouteFromBases(profile, origin, destination);
      const tooLongForWalk = profile.mode === 'walk' && directDistance > 0 && route.distance / directDistance > 1.75 && route.distance - directDistance > 250;
      if (tooLongForWalk) {
        drawDirectRoute(origin, destination, profile, fit, 'Camino más corto aproximado');
        return;
      }

      const latLngs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      if (navigationLayer) map.removeLayer(navigationLayer);
      navigationLayer = L.polyline(latLngs, { weight: 7, opacity: 0.88, color: '#147d78' }).addTo(map);

      if (destinationMarker) map.removeLayer(destinationMarker);
      destinationMarker = L.marker([destination.lat, destination.lng]).addTo(map).bindPopup(`<strong>${destination.name || 'Destino'}</strong>`);

      const minutes = Math.max(1, Math.round(route.duration / 60));
      showStatus(`En ruta a ${destination.name || 'el destino'} · ${profile.label} · ${formatDistance(route.distance)} · ${minutes} min`);
      if (fit) map.fitBounds(navigationLayer.getBounds().pad(0.16));
      lastRouteOrigin = L.latLng(origin.lat, origin.lng);
    } catch {
      drawDirectRoute(origin, destination, profile, fit, 'Ruta aproximada');
    }
  }

  function startGuidance(destination) {
    activeDestination = destination;
    buildRoute(destination, true);
    if (recalcTimer) clearInterval(recalcTimer);
    recalcTimer = setInterval(() => {
      if (!activeDestination) return;
      const current = marker.getLatLng();
      const remaining = map.distance(current, [activeDestination.lat, activeDestination.lng]);
      if (remaining < 35) {
        showStatus(`Llegaste a ${activeDestination.name || 'tu destino'}`);
        clearInterval(recalcTimer);
        recalcTimer = null;
        return;
      }
      if (!lastRouteOrigin || map.distance(lastRouteOrigin, current) > 120) buildRoute(activeDestination, false);
    }, 8000);
  }

  function shouldAskMode() {
    if (selectedTravelMode) return false;
    const mode = inferredMode();
    return !mode || mode === 'walk';
  }

  function askModeThenStart(destination) {
    modePanel.style.display = 'block';
    showStatus(`Antes de llevarte a ${destination.name || 'el destino'}: elegí cómo vamos.`);
  }

  modePanel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-route-mode]');
    if (!button) return;
    selectedTravelMode = button.dataset.routeMode;
    localStorage.setItem('wander-travel-route-mode', selectedTravelMode);
    modePanel.style.display = 'none';
    const destination = getSuggestedDestination();
    if (destination) startGuidance(destination);
  });

  document.addEventListener('wander:route-mode-reset', () => {
    selectedTravelMode = null;
    localStorage.removeItem('wander-travel-route-mode');
  });

  routeButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const destination = getSuggestedDestination();
    if (!destination) {
      setRouteButtonVisible(false);
      return;
    }
    if (shouldAskMode()) askModeThenStart(destination);
    else startGuidance(destination);
  }, true);

  document.addEventListener('wander:guide-destination', (event) => {
    const destination = event.detail;
    window.wanderGuideDestination = destination || null;
    setRouteButtonVisible(Boolean(destination));
  });

  setRouteButtonVisible(Boolean(getSuggestedDestination()));
})();
