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

  function humanDirection(from, to) {
    const target = bearing(from, to);
    if (!Number.isFinite(lastHeading)) {
      return 'cerca de tu posición actual';
    }
    const diff = angleDiff(lastHeading, target);
    const abs = Math.abs(diff);
    if (abs < 25) return 'casi de frente';
    if (abs < 70) return diff > 0 ? 'un poco hacia tu derecha' : 'un poco hacia tu izquierda';
    if (abs < 125) return diff > 0 ? 'hacia tu derecha' : 'hacia tu izquierda';
    return 'casi detrás de vos';
  }

  function formatDistance(meters) {
    if (meters < 250) return `${Math.round(meters / 10) * 10} m`;
    if (meters < 1000) return `${Math.round(meters / 50) * 50} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }

  function approximateBlocks(meters) {
    if (meters < 120) return 'a menos de 2 cuadras';
    const blocks = Math.max(2, Math.round(meters / 100));
    return `a unas ${blocks} cuadras`;
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
        const direction = humanDirection(origin, destination);
        const placeText = road
          ? `desde la zona de ${road}, ${direction}`
          : direction;
        return {
          name: item.name,
          source: item.source,
          summary: item.summary,
          distance_m: Math.round(distance),
          distance_text: formatDistance(distance),
          walking_minutes: walkingMinutes(distance),
          approximate_blocks: approximateBlocks(distance),
          human_direction: direction,
          current_road: road,
          has_body_heading: Number.isFinite(lastHeading),
          wording_hint: `${placeText}, a unos ${formatDistance(distance)} o ${walkingMinutes(distance)} min caminando`,
          voice_hint: Number.isFinite(lastHeading)
            ? `${direction}, a unos ${walkingMinutes(distance)} minutos caminando`
            : `queda cerca de tu posición actual, a unos ${walkingMinutes(distance)} minutos caminando; cuando empieces a moverte te puedo orientar mejor con derecha o izquierda`,
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
            style: 'Hablá como guía por auriculares. El celular puede estar guardado: no digas en el mapa, arriba, abajo, arriba a la derecha ni abajo a la izquierda. Usá orientación corporal: a tu derecha, a tu izquierda, de frente, detrás, sobre esta calle, cuadras, metros o minutos. Si todavía no hay rumbo real, no inventes derecha o izquierda: decí cerca de tu posición actual y avisá que al empezar a caminar lo vas orientando mejor.',
            examples: 'a 10 minutos hacia tu derecha; siguiendo por esta calle, en unas 4 cuadras; a 400 metros de frente; si querés algo corto, esto queda cerca de tu posición actual.',
          };
          payload.message = `${payload.message} Además, cuando propongas lugares para visitar, ofrecé alternativas con distancia, tiempo estimado y orientación de guía por auriculares. No uses referencias de pantalla ni de mapa como arriba, abajo, arriba a la derecha o abajo a la izquierda. Evitá puntos cardinales. Si no sabés hacia dónde mira o camina la persona, no inventes derecha o izquierda: hablá de cercanía y prometé orientar mejor cuando empiece a moverse.`;
          init = { ...init, body: JSON.stringify(payload) };
        }
      } catch {
        return originalFetch(input, init);
      }
    }
    return originalFetch(input, init);
  };
})();
