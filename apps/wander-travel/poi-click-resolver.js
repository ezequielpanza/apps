(() => {
  if (typeof map === 'undefined' || typeof marker === 'undefined' || typeof L === 'undefined') return;

  let busy = false;

  function panelElements() {
    return {
      panel: document.querySelector('.companion-panel'),
      title: document.querySelector('#wander-title'),
      message: document.querySelector('#wander-message'),
      tab: document.querySelector('#show-companion'),
      routeButton: document.querySelector('[data-message="route"]'),
    };
  }

  function formatDistance(meters) {
    return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
  }

  function categoryFromTags(tags = {}) {
    if (tags.amenity === 'cafe') return 'café';
    if (['restaurant', 'bar', 'pub', 'fast_food'].includes(tags.amenity)) return 'comida';
    if (tags.tourism === 'museum' || tags.amenity === 'museum') return 'museo';
    if (tags.historic) return 'historia';
    if (tags.tourism === 'viewpoint') return 'mirador';
    if (['park', 'garden', 'nature_reserve'].includes(tags.leisure)) return 'naturaleza';
    if (['gallery', 'artwork'].includes(tags.tourism) || tags.amenity === 'arts_centre') return 'arte';
    if (tags.tourism === 'attraction') return 'atracción';
    if (tags.shop) return 'tienda';
    return 'lugar cercano';
  }

  function minutesAway(distance) {
    const mode = document.querySelector('.status-rail .metric:nth-child(1) strong')?.textContent?.toLowerCase() || '';
    const speed = mode.includes('auto') ? 45 : mode.includes('bicicleta') || mode.includes('monopatín') ? 16 : 5;
    return Math.max(1, Math.round((distance / 1000) / speed * 60));
  }

  function normalizedFromStore(poi, clickPoint) {
    const lat = poi.lat ?? poi.point?.[0];
    const lng = poi.lng ?? poi.point?.[1];
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !poi.name) return null;
    const distanceFromClick = map.distance(clickPoint, [lat, lng]);
    return {
      ...poi,
      lat,
      lng,
      point: [lat, lng],
      category: poi.category || 'lugar cercano',
      sources: poi.sources || [{ id: poi.sourceId || 'osm', label: poi.source || 'OSM' }],
      distanceFromClick,
    };
  }

  function sourceLabel(poi) {
    if (window.WanderPoiStore?.sourceLabel) return window.WanderPoiStore.sourceLabel(poi);
    return (poi.sources || []).map((source) => source.label || source.id).filter(Boolean).join(' + ') || poi.source || 'OSM';
  }

  function allKnownPois() {
    const storePois = window.WanderPoiStore?.getVisible?.() || window.WanderPois || [];
    const internetPois = (window.wanderInternetPois || []).map((poi) => ({
      ...poi,
      category: poi.category || 'descubierto en internet',
      sources: [{ id: 'internet', label: poi.source || 'Internet' }],
    }));
    return [...storePois, ...internetPois];
  }

  function nearestKnownPoi(point) {
    const zoom = map.getZoom?.() || 15;
    const maxMeters = zoom >= 17 ? 45 : zoom >= 15 ? 80 : 140;
    const candidates = allKnownPois()
      .map((poi) => normalizedFromStore(poi, point))
      .filter(Boolean)
      .sort((a, b) => a.distanceFromClick - b.distanceFromClick);
    return candidates[0]?.distanceFromClick <= maxMeters ? candidates[0] : null;
  }

  function openPoi(poi) {
    if (window.WanderPoiStore?.openPoiPanel) {
      window.WanderPoiStore.openPoiPanel(poi);
      return;
    }

    const { panel, title, message, tab, routeButton } = panelElements();
    if (!panel || !title || !message || !routeButton) return;

    const origin = marker.getLatLng();
    const distance = map.distance(origin, [poi.lat, poi.lng]);
    const sources = sourceLabel(poi);
    const details = [poi.category, `${formatDistance(distance)} · ${minutesAway(distance)} min`, `Fuente: ${sources}`];
    if (poi.summary) details.push(poi.summary);
    if (poi.tags?.description) details.push(poi.tags.description);
    if (poi.tags?.opening_hours) details.push(`Horario: ${poi.tags.opening_hours}`);
    if (poi.tags?.cuisine) details.push(`Cocina: ${poi.tags.cuisine}`);

    title.textContent = `${poi.name} · ${sources}`;
    message.textContent = details.filter(Boolean).join('. ');
    panel.classList.remove('is-hidden');
    tab?.classList.add('has-unread');

    window.wanderGuideDestination = {
      name: poi.name,
      lat: poi.lat,
      lng: poi.lng,
      source: sources,
      sources: poi.sources,
    };
    routeButton.hidden = false;
    routeButton.style.display = '';
    routeButton.textContent = 'Llévame';
    document.dispatchEvent(new CustomEvent('wander:guide-destination', { detail: window.wanderGuideDestination }));
  }

  async function fetchNearbyOsmPoi(point) {
    const radius = 45;
    const query = `[out:json][timeout:12];(node(around:${radius},${point.lat},${point.lng})[name][tourism];node(around:${radius},${point.lat},${point.lng})[name][historic];node(around:${radius},${point.lat},${point.lng})[name][amenity];node(around:${radius},${point.lat},${point.lng})[name][leisure];node(around:${radius},${point.lat},${point.lng})[name][shop];way(around:${radius},${point.lat},${point.lng})[name][tourism];way(around:${radius},${point.lat},${point.lng})[name][historic];way(around:${radius},${point.lat},${point.lng})[name][amenity];way(around:${radius},${point.lat},${point.lng})[name][leisure];way(around:${radius},${point.lat},${point.lng})[name][shop];);out center tags 20;`;
    const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: query }) });
    if (!response.ok) throw new Error('Overpass');
    const data = await response.json();
    const pois = (data.elements || []).map((item) => {
      const lat = item.lat ?? item.center?.lat;
      const lng = item.lon ?? item.center?.lon;
      const tags = item.tags || {};
      const name = tags.name || tags.brand || tags.operator;
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        id: `${item.type}-${item.id}`,
        name,
        lat,
        lng,
        point: [lat, lng],
        tags,
        category: categoryFromTags(tags),
        sources: [{ id: 'osm', label: 'OSM' }],
        distanceFromClick: map.distance(point, [lat, lng]),
      };
    }).filter(Boolean).sort((a, b) => a.distanceFromClick - b.distanceFromClick);
    return pois[0] || null;
  }

  map.on('click', async (event) => {
    const target = event.originalEvent?.target;
    if (target?.closest?.('.leaflet-control, .map-tools, .companion-panel, .control-panel, .developer-side-panel, .settings-panel, .guide-panel')) return;
    const point = event.latlng;
    if (!point || busy) return;

    const known = nearestKnownPoi(point);
    if (known) {
      openPoi(known);
      return;
    }

    busy = true;
    try {
      const fetched = await fetchNearbyOsmPoi(point);
      if (fetched) openPoi(fetched);
    } catch {
      // El click puede haber sido sobre una zona sin POI consultable.
    } finally {
      busy = false;
    }
  });
})();
