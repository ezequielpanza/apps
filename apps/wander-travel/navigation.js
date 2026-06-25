(() => {
  if (typeof map === 'undefined' || typeof marker === 'undefined' || typeof L === 'undefined') return;

  const routeButton = document.querySelector('[data-message="route"]');
  if (!routeButton) return;

  let navigationLayer = null;
  let destinationMarker = null;
  let activeDestination = null;
  let recalcTimer = null;
  let lastRouteOrigin = null;

  const status = document.createElement('div');
  status.id = 'wander-navigation-status';
  status.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:1200;display:none;max-width:min(92vw,520px);padding:12px 16px;border-radius:16px;background:#173f3b;color:#fff;box-shadow:0 12px 32px rgba(20,35,55,.28);font:700 .88rem/1.35 system-ui,sans-serif;text-align:center';
  document.body.appendChild(status);

  function currentProfile() {
    const mode = document.querySelector('.status-rail .metric:nth-child(1) strong')?.textContent?.toLowerCase() || '';
    if (mode.includes('bicicleta') || mode.includes('monopatín')) return { base: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving', speed: 16 };
    if (mode.includes('auto')) return { base: 'https://router.project-osrm.org/route/v1/driving', speed: 45 };
    return { base: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving', speed: 5 };
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

  async function buildRoute(destination, fit = true) {
    const origin = marker.getLatLng();
    const profile = currentProfile();
    const url = `${profile.base}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&steps=true`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Routing ${response.status}`);
      const data = await response.json();
      const route = data.routes?.[0];
      if (!route?.geometry?.coordinates?.length) throw new Error('Sin ruta');

      const latLngs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      if (navigationLayer) map.removeLayer(navigationLayer);
      navigationLayer = L.polyline(latLngs, { weight: 7, opacity: 0.88, color: '#147d78' }).addTo(map);

      if (destinationMarker) map.removeLayer(destinationMarker);
      destinationMarker = L.marker([destination.lat, destination.lng]).addTo(map).bindPopup(`<strong>${destination.name || 'Destino'}</strong>`);

      const minutes = Math.max(1, Math.round(route.duration / 60));
      showStatus(`En ruta a ${destination.name || 'el destino'} · ${formatDistance(route.distance)} · ${minutes} min`);
      if (fit) map.fitBounds(navigationLayer.getBounds().pad(0.16));
      lastRouteOrigin = L.latLng(origin.lat, origin.lng);
    } catch {
      if (navigationLayer) map.removeLayer(navigationLayer);
      navigationLayer = L.polyline([[origin.lat, origin.lng], [destination.lat, destination.lng]], { weight: 6, opacity: 0.75, dashArray: '10 8', color: '#147d78' }).addTo(map);
      const directDistance = map.distance(origin, [destination.lat, destination.lng]);
      const minutes = Math.max(1, Math.round((directDistance / 1000) / currentProfile().speed * 60));
      showStatus(`Ruta aproximada a ${destination.name || 'el destino'} · ${formatDistance(directDistance)} · ${minutes} min`);
      if (fit) map.fitBounds(navigationLayer.getBounds().pad(0.2));
      lastRouteOrigin = L.latLng(origin.lat, origin.lng);
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

  routeButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const destination = getSuggestedDestination();
    if (!destination) {
      setRouteButtonVisible(false);
      return;
    }
    startGuidance(destination);
  }, true);

  document.addEventListener('wander:guide-destination', (event) => {
    const destination = event.detail;
    window.wanderGuideDestination = destination || null;
    setRouteButtonVisible(Boolean(destination));
  });

  setRouteButtonVisible(Boolean(getSuggestedDestination()));
})();
