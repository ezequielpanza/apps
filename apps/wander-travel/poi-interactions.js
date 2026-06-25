(() => {
  if (typeof map === 'undefined' || typeof marker === 'undefined') return;

  const panel = document.querySelector('.companion-panel');
  const title = document.querySelector('#wander-title');
  const message = document.querySelector('#wander-message');
  const tab = document.querySelector('#show-companion');
  const routeButton = document.querySelector('[data-message="route"]');
  const wired = new WeakSet();

  if (!panel || !title || !message || !routeButton) return;

  function stripHtml(value) {
    const div = document.createElement('div');
    div.innerHTML = String(value || '');
    return div.textContent?.replace(/\s+/g, ' ').trim() || '';
  }

  function extractName(layer) {
    if (layer.wanderPoi?.name) return layer.wanderPoi.name;
    const content = layer.getPopup?.()?.getContent?.();
    if (typeof content !== 'string') return null;
    const match = content.match(/<strong>(.*?)<\/strong>/i);
    return stripHtml(match?.[1] || content.split('<br>')[0]);
  }

  function internetPoiFor(layer, name) {
    if (layer.wanderPoi?.source === 'internet') return layer.wanderPoi;
    const point = layer.getLatLng?.();
    if (!point) return null;
    return (window.wanderInternetPois || []).find((poi) => {
      if (name && String(poi.name || '').toLowerCase() === name.toLowerCase()) return true;
      return map.distance(point, [poi.lat, poi.lng]) < 15;
    }) || null;
  }

  function profile() {
    const mode = document.querySelector('.status-rail .metric:nth-child(1) strong')?.textContent?.toLowerCase() || '';
    if (mode.includes('bicicleta') || mode.includes('monopatín')) return 'https://routing.openstreetmap.de/routed-bike/route/v1/driving';
    if (mode.includes('auto')) return 'https://router.project-osrm.org/route/v1/driving';
    return 'https://routing.openstreetmap.de/routed-foot/route/v1/driving';
  }

  function formatDistance(meters) {
    return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
  }

  async function routeEstimate(destination) {
    const origin = marker.getLatLng();
    const directDistance = map.distance(origin, [destination.lat, destination.lng]);
    const url = `${profile()}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false&steps=false`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('routing');
      const data = await response.json();
      const route = data.routes?.[0];
      if (!route) throw new Error('routing');
      return {
        distance: route.distance,
        minutes: Math.max(1, Math.round(route.duration / 60)),
        approximate: false,
      };
    } catch {
      const mode = document.querySelector('.status-rail .metric:nth-child(1) strong')?.textContent?.toLowerCase() || '';
      const speed = mode.includes('auto') ? 45 : mode.includes('bicicleta') || mode.includes('monopatín') ? 16 : 5;
      return {
        distance: directDistance,
        minutes: Math.max(1, Math.round((directDistance / 1000) / speed * 60)),
        approximate: true,
      };
    }
  }

  async function showPoi(layer) {
    const point = layer.getLatLng?.();
    if (!point) return;
    const name = extractName(layer) || 'Lugar cercano';
    const internetPoi = internetPoiFor(layer, name);
    const destination = { name, lat: point.lat, lng: point.lng };

    window.wanderGuideDestination = destination;
    document.dispatchEvent(new CustomEvent('wander:guide-destination', { detail: destination }));

    title.textContent = name;
    message.textContent = 'Calculando la mejor ruta desde tu posición...';
    panel.classList.remove('is-hidden');
    tab?.classList.remove('has-unread');

    const estimate = await routeEstimate(destination);
    const routeText = `${formatDistance(estimate.distance)} · ${estimate.minutes} min${estimate.approximate ? ' aprox.' : ''}`;

    if (internetPoi?.summary) {
      message.textContent = `${internetPoi.summary} Ruta desde tu ubicación: ${routeText}.`;
    } else {
      const popupText = stripHtml(layer.getPopup?.()?.getContent?.());
      const extra = popupText && popupText.toLowerCase() !== name.toLowerCase() ? ` ${popupText}` : '';
      message.textContent = `Este lugar está detectado en el mapa.${extra} Ruta desde tu ubicación: ${routeText}.`;
    }

    routeButton.hidden = false;
    routeButton.style.display = '';
    routeButton.textContent = 'Llévame';
  }

  function wireLayer(layer) {
    if (wired.has(layer) || typeof layer?.getLatLng !== 'function' || typeof layer?.on !== 'function') return;
    if (layer === marker) return;
    const name = extractName(layer);
    if (!name) return;
    wired.add(layer);
    layer.on('click', () => showPoi(layer));
  }

  function scanLayers() {
    Object.values(map._layers || {}).forEach(wireLayer);
  }

  document.addEventListener('wander:internet-pois-updated', scanLayers);
  document.addEventListener('wander:poi-updated', scanLayers);
  map.on('layeradd', (event) => wireLayer(event.layer));
  window.setInterval(scanLayers, 2500);
  window.setTimeout(scanLayers, 1200);
})();
