(() => {
  if (typeof map === 'undefined' || typeof marker === 'undefined') return;

  const originalFetch = window.fetch.bind(window);
  let lastPoint = marker.getLatLng();
  let lastHeading = null;

  function bearing(from, to) {
    const lat1 = from.lat * Math.PI / 180;
    const lat2 = to.lat * Math.PI / 180;
    const deltaLon = (to.lng - from.lng) * Math.PI / 180;
    const y = Math.sin(deltaLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function angleDiff(a, b) {
    return ((b - a + 540) % 360) - 180;
  }

  function updateHeading() {
    const current = marker.getLatLng();
    if (map.distance(lastPoint, current) > 8) lastHeading = bearing(lastPoint, current);
    lastPoint = L.latLng(current.lat, current.lng);
  }

  marker.on('moveend', updateHeading);
  marker.on('dragend', updateHeading);

  function screenDirection(from, to) {
    const a = map.latLngToContainerPoint(from);
    const b = map.latLngToContainerPoint(to);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) > Math.abs(dy) * 1.35) return dx > 0 ? 'a la derecha en el mapa' : 'a la izquierda en el mapa';
    if (Math.abs(dy) > Math.abs(dx) * 1.35) return dy > 0 ? 'hacia abajo en el mapa' : 'hacia arriba en el mapa';
    if (dx > 0 && dy < 0) return 'arriba a la derecha en el mapa';
    if (dx > 0 && dy > 0) return 'abajo a la derecha en el mapa';
    if (dx < 0 && dy < 0) return 'arriba a la izquierda en el mapa';
    return 'abajo a la izquierda en el mapa';
  }

  function humanDirection(from, to) {
    const target = bearing(from, to);
    if (Number.isFinite(lastHeading)) {
      const diff = angleDiff(lastHeading, target);
      const abs = Math.abs(diff);
      if (abs < 25) return 'casi de frente';
      if (abs < 70) return diff > 0 ? 'un poco hacia tu derecha' : 'un poco hacia tu izquierda';
      if (abs < 125) return diff > 0 ? 'hacia tu derecha' : 'hacia tu izquierda';
      return 'casi detrás de vos';
    }
    return screenDirection(from, to);
  }

  function formatDistance(meters) {
    if (meters < 250) return `${Math.round(meters / 10) * 10} m`;
    if (meters < 1000) return `${Math.round(meters / 50) * 50} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }

  function walkingMinutes(meters) {
    return Math.max(1, Math.round((meters / 1000) / 4.8 * 60));
  }

  function addCandidate(list, item) {
    if (!item?.name || !Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return;
    const key = item.name.trim().toLowerCase();
    if (list.some((existing) => existing.name.trim().toLowerCase() === key)) return;
    list.push(item);
  }

  function mapPoiCandidates(origin) {
    const candidates = [];
    for (const layer of Object.values(map._layers || {})) {
      if (layer === marker || typeof layer?.getLatLng !== 'function' || typeof layer?.getPopup !== 'function') continue;
      const content = layer.getPopup()?.getContent?.();
      if (typeof content !== 'string') continue;
      const div = document.createElement('div');
      div.innerHTML = content;
      const name = div.querySelector('strong')?.textContent?.trim() || div.textContent?.trim()?.split('\n')[0];
      const point = layer.getLatLng();
      if (!name || !point) continue;
      const distance = map.distance(origin, point);
      if (distance > 2500) continue;
      addCandidate(candidates, { name, lat: point.lat, lng: point.lng, source: 'map', summary: div.textContent?.replace(/\s+/g, ' ').trim() || '' });
    }
    return candidates;
  }

  function buildRouteOptions(context = {}) {
    const origin = marker.getLatLng();
    const options = [];
    for (const poi of window.wanderInternetPois || []) {
      addCandidate(options, { name: poi.name, lat: poi.lat, lng: poi.lng, source: poi.source || 'internet', summary: poi.summary || '' });
    }
    for (const poi of mapPoiCandidates(origin)) addCandidate(options, poi);

    const road = context?.place?.address?.road || context?.place?.address?.pedestrian || context?.place?.address?.footway || null;
    return options
      .map((item) => {
        const destination = L.latLng(item.lat, item.lng);
        const distance = map.distance(origin, destination);
        return {
          name: item.name,
          source: item.source,
          summary: item.summary,
          distance_m: Math.round(distance),
          distance_text: formatDistance(distance),
          walking_minutes: walkingMinutes(distance),
          human_direction: humanDirection(origin, destination),
          visual_reference: screenDirection(origin, destination),
          current_road: road,
          wording_hint: road
            ? `desde la zona de ${road}, queda ${humanDirection(origin, destination)}, a unos ${formatDistance(distance)} o ${walkingMinutes(distance)} min caminando`
            : `queda ${humanDirection(origin, destination)}, a unos ${formatDistance(distance)} o ${walkingMinutes(distance)} min caminando`,
          lat: item.lat,
          lng: item.lng,
        };
      })
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, 8);
  }

  window.WanderHumanRouteContext = { buildRouteOptions };

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (url === '/api/assistant' && init?.body) {
      try {
        const payload = JSON.parse(init.body);
        if (payload?.context?.mode === 'tour_guide') {
          const routeOptions = buildRouteOptions(payload.context);
          payload.context.route_options = routeOptions;
          payload.context.route_language_instructions = {
            goal: 'Cuando el usuario empieza a explorar, asumí que necesita elegir un objetivo. Ofrecé alternativas concretas y comparables, no solo datos sueltos.',
            style: 'Explicá dónde queda cada opción con lenguaje humano: derecha, izquierda, de frente, detrás, sobre la calle actual, a tantas cuadras, a tantos metros o minutos. Evitá puntos cardinales salvo que sean imprescindibles.',
            examples: 'a 10 minutos hacia tu derecha; siguiendo por la avenida donde estás, en unas 4 cuadras; a 400 metros, arriba a la izquierda en el mapa; si querés algo corto, esto queda más cerca.',
          };
          payload.message = `${payload.message} Además, cuando propongas lugares para visitar, ofrecé alternativas con distancia, tiempo estimado y orientación humana. Evitá norte, sur, este u oeste si podés decir derecha, izquierda, de frente, detrás, sobre la calle actual, cuadras, metros o minutos. La persona probablemente está decidiendo hacia dónde empezar a moverse.`;
          init = { ...init, body: JSON.stringify(payload) };
        }
      } catch {
        return originalFetch(input, init);
      }
    }
    return originalFetch(input, init);
  };
})();
