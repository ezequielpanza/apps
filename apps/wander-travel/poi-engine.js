(() => {
  const APP_VERSION = 'v0.33.0';
  const SETTINGS_KEY = 'wander-travel-settings';
  const badge = document.querySelector('.app-version');
  if (badge) badge.textContent = APP_VERSION;

  if (typeof map === 'undefined' || typeof marker === 'undefined' || typeof L === 'undefined') return;

  const developerPanel = document.querySelector('#developer-panel .developer-panel');
  const interestInput = document.querySelector('#interest-input');
  const applyInterests = document.querySelector('#apply-interests');
  const speedMetric = document.querySelector('.status-rail .metric:nth-child(2) strong');
  if (!developerPanel) return;

  const SOURCE_DEFS = {
    osm: { id: 'osm', label: 'OSM', color: '#6c5aa8' },
    internet: { id: 'internet', label: 'Internet', color: '#b06f32' },
    wiki: { id: 'wiki', label: 'Wiki', color: '#b06f32' },
    noForeignLand: { id: 'noForeignLand', label: 'NoForeignLand', color: '#2d8f64' },
    iOverlander: { id: 'iOverlander', label: 'iOverlander', color: '#7d5bd6' },
    tripadvisor: { id: 'tripadvisor', label: 'Tripadvisor', color: '#00a680' },
  };

  const panelSection = document.createElement('section');
  panelSection.className = 'poi-debug-section';
  panelSection.innerHTML = `
    <div class="poi-debug-header">
      <div><p class="developer-note">Área de interés</p><h3>POIs alcanzables</h3></div>
      <button id="refresh-pois-button" class="secondary-action" type="button">Actualizar</button>
    </div>
    <div class="poi-view-toggle" role="group" aria-label="Vista de POIs en desarrollador">
      <button id="poi-view-all" class="is-active" type="button" aria-pressed="true">Todos</button>
      <button id="poi-view-filtered" type="button" aria-pressed="false">Solo etiquetas</button>
    </div>
    <div class="poi-debug-stats">
      <div><span>Método</span><strong id="poi-mode">-</strong></div>
      <div><span>Alcance</span><strong id="poi-radius">-</strong></div>
      <div><span>Total</span><strong id="poi-total">0</strong></div>
      <div><span>Filtrados</span><strong id="poi-filtered">0</strong></div>
    </div>
    <p id="poi-debug-status" class="poi-debug-status">Esperando ubicación...</p>
    <div id="poi-debug-list" class="poi-debug-list" aria-label="POIs dentro del área de interés"></div>
  `;
  developerPanel.appendChild(panelSection);

  const style = document.createElement('style');
  style.textContent = `
    .poi-debug-section{margin-top:20px;padding-top:18px;border-top:1px solid rgba(24,32,27,.12)}
    .poi-debug-header{display:flex;align-items:center;justify-content:space-between;gap:12px}.poi-debug-header h3{margin:2px 0 0;font-size:1rem}
    .poi-view-toggle{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:12px 0;padding:4px;border-radius:12px;background:#efedf5}.poi-view-toggle button{padding:9px 10px;border:0;border-radius:9px;background:transparent;color:#6f687c;font-size:.74rem;font-weight:800;cursor:pointer}.poi-view-toggle button.is-active{background:#fff;color:#4d3e7a;box-shadow:0 3px 10px rgba(24,32,27,.1)}
    .poi-debug-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}.poi-debug-stats div{padding:10px;border-radius:12px;background:#f5f3fa}.poi-debug-stats span{display:block;font-size:.66rem;color:#766e88;text-transform:uppercase;letter-spacing:.05em}.poi-debug-stats strong{display:block;margin-top:3px;font-size:.88rem;color:#342d52}
    .poi-debug-status{margin:8px 0;padding:9px 10px;border-radius:10px;background:rgba(20,125,120,.08);color:#356b68;font-size:.76rem;font-weight:700}
    .poi-debug-list{display:grid;gap:7px;max-height:38vh;overflow:auto;padding-right:3px}.poi-debug-item{display:grid;grid-template-columns:1fr auto;gap:8px;padding:9px 10px;border:1px solid rgba(24,32,27,.1);border-radius:11px;background:white;cursor:pointer}.poi-debug-item strong{display:block;font-size:.8rem}.poi-debug-item span{display:block;margin-top:2px;font-size:.68rem;color:#777}.poi-debug-item em{align-self:center;font-size:.66rem;font-style:normal;font-weight:800;color:#6c5aa8}.poi-debug-item.user-match{border-color:rgba(20,125,120,.35);background:rgba(20,125,120,.04)}
  `;
  document.head.appendChild(style);

  const ui = {
    mode: document.querySelector('#poi-mode'),
    radius: document.querySelector('#poi-radius'),
    total: document.querySelector('#poi-total'),
    filtered: document.querySelector('#poi-filtered'),
    status: document.querySelector('#poi-debug-status'),
    list: document.querySelector('#poi-debug-list'),
    refresh: document.querySelector('#refresh-pois-button'),
    viewAll: document.querySelector('#poi-view-all'),
    viewFiltered: document.querySelector('#poi-view-filtered'),
  };

  const poiLayer = L.layerGroup().addTo(map);
  const interestArea = L.circle(marker.getLatLng(), { radius: 1250, weight: 1, fillOpacity: 0.04, opacity: 0.35 });
  const poisBySource = new Map();
  let allPois = [];
  let loading = false;
  let lastFetchPosition = null;
  let lastModeId = null;
  let developerView = 'all';

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); }
    catch { return {}; }
  }

  function poiSources() {
    return { osm: true, internet: true, noForeignLand: false, iOverlander: false, tripadvisor: false, ...(loadSettings().poiSources || {}) };
  }

  function sourceEnabled(id) {
    const sources = poiSources();
    if (id === 'wiki' || id === 'internet') return Boolean(sources.internet);
    return sources[id] !== false;
  }

  function parseSpeed() {
    const value = Number.parseFloat((speedMetric?.textContent || '').replace(',', '.'));
    return Number.isFinite(value) ? value : 5;
  }

  function getMode() {
    const speed = parseSpeed();
    if (speed <= 7) return { id: 'walk', label: 'Caminando', speed, radius: 1250, threshold: 250 };
    if (speed <= 25) return { id: 'bike', label: 'Bicicleta', speed, radius: 4000, threshold: 800 };
    return { id: 'car', label: 'Auto', speed, radius: 10000, threshold: 2500 };
  }

  function getInterests() {
    const raw = interestInput?.dataset.tags || interestInput?.value || '';
    return raw.toLowerCase().split(',').map((item) => item.trim()).filter(Boolean);
  }

  function categoryFromTags(tags = {}) {
    if (tags.amenity === 'cafe') return 'cafe';
    if (['restaurant','bar','pub','fast_food'].includes(tags.amenity)) return 'comida';
    if (tags.tourism === 'museum' || tags.amenity === 'museum') return 'museo';
    if (tags.historic) return 'historia';
    if (tags.tourism === 'viewpoint') return 'mirador';
    if (['park','garden','nature_reserve'].includes(tags.leisure)) return 'naturaleza';
    if (['gallery','artwork'].includes(tags.tourism) || tags.amenity === 'arts_centre') return 'arte';
    if (tags.tourism === 'attraction') return 'atraccion';
    if (tags.shop) return 'tienda';
    return 'otro';
  }

  function sourceLabel(poi) {
    return (poi.sources || []).map((source) => SOURCE_DEFS[source.id]?.label || source.label || source.id).filter(Boolean).join(' + ') || 'Fuente desconocida';
  }

  function formatDistance(meters) {
    return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
  }

  function minutesAway(distance, speedKmh) {
    return Math.max(1, Math.round((distance / 1000) / Math.max(speedKmh, 1) * 60));
  }

  function normalizePoi(input, sourceId = 'osm') {
    const lat = input.lat ?? input.point?.[0];
    const lng = input.lng ?? input.lon ?? input.point?.[1];
    const sourceDef = SOURCE_DEFS[sourceId] || { id: sourceId, label: sourceId };
    const sources = Array.isArray(input.sources) && input.sources.length ? input.sources : [{ id: sourceDef.id, label: sourceDef.label }];
    const distance = Number.isFinite(input.distance) ? input.distance : map.distance(marker.getLatLng(), [lat, lng]);
    return {
      id: input.id || `${sourceId}-${String(input.name || 'poi').toLowerCase()}-${lat}-${lng}`,
      name: input.name,
      lat,
      lng,
      point: [lat, lng],
      category: input.category || categoryFromTags(input.tags || {}) || 'otro',
      tags: input.tags || {},
      summary: input.summary || input.detail || '',
      distance,
      minutes: input.minutes || minutesAway(distance, getMode().speed),
      sources,
      source_ids: sources.map((source) => source.id),
    };
  }

  function mergePois(pois) {
    const byKey = new Map();
    pois.map((poi) => normalizePoi(poi, poi.sourceId || poi.source_id || poi.source || 'osm')).forEach((poi) => {
      if (!poi.name || !Number.isFinite(poi.lat) || !Number.isFinite(poi.lng)) return;
      const key = `${poi.name.toLowerCase()}|${poi.lat.toFixed(4)}|${poi.lng.toFixed(4)}`;
      const current = byKey.get(key);
      if (!current) {
        byKey.set(key, poi);
        return;
      }
      const known = new Set(current.sources.map((source) => source.id));
      poi.sources.forEach((source) => { if (!known.has(source.id)) current.sources.push(source); });
      current.source_ids = current.sources.map((source) => source.id);
      current.summary = current.summary || poi.summary;
      current.tags = { ...poi.tags, ...current.tags };
    });
    return [...byKey.values()].sort((a, b) => a.distance - b.distance);
  }

  function rebuildAllPois() {
    allPois = mergePois([...poisBySource.values()].flat());
  }

  function setSourcePois(sourceId, pois = []) {
    poisBySource.set(sourceId, pois.map((poi) => ({ ...poi, sourceId })));
    rebuildAllPois();
    render();
  }

  function visibleBySource(poi) {
    return (poi.sources || []).some((source) => sourceEnabled(source.id));
  }

  function matchesInterests(poi, interests) {
    if (!interests.length) return false;
    const text = `${poi.name} ${poi.category} ${poi.summary || ''} ${poi.tags?.description || ''}`.toLowerCase();
    const synonyms = {
      cafe: ['cafe','cafes','cafeteria'], comida: ['comida','gastronomia','restaurant','restaurante','bar'],
      historia: ['historia','historico','patrimonio','arquitectura'], museo: ['museo','arte','cultura'],
      mirador: ['vista','mirador','paisaje'], naturaleza: ['naturaleza','parque','jardin','playa'],
      arte: ['arte','galeria','mural'], atraccion: ['explorar','atraccion','turismo'], tienda: ['compras','tienda']
    };
    return interests.some((interest) => text.includes(interest) || Object.entries(synonyms).some(([category, words]) => poi.category === category && words.some((word) => interest.includes(word) || word.includes(interest))));
  }

  function openPoiPanel(poi) {
    const panel = document.querySelector('.companion-panel');
    const title = document.querySelector('#wander-title');
    const message = document.querySelector('#wander-message');
    const routeButton = document.querySelector('[data-message="route"]');
    if (!panel || !title || !message || !routeButton) return;
    const source = sourceLabel(poi);
    title.textContent = `${poi.name} · ${source}`;
    const details = [poi.category, `${formatDistance(poi.distance)} · ${poi.minutes} min`, `Fuente: ${source}`];
    if (poi.summary) details.push(poi.summary);
    if (poi.tags?.description) details.push(poi.tags.description);
    if (poi.tags?.opening_hours) details.push(`Horario: ${poi.tags.opening_hours}`);
    if (poi.tags?.cuisine) details.push(`Cocina: ${poi.tags.cuisine}`);
    message.textContent = details.filter(Boolean).join('. ');
    panel.classList.remove('is-hidden');
    window.wanderGuideDestination = { name: poi.name, lat: poi.lat, lng: poi.lng, source, sources: poi.sources };
    routeButton.hidden = false;
    routeButton.style.display = '';
    routeButton.textContent = 'Llévame';
    document.dispatchEvent(new CustomEvent('wander:guide-destination', { detail: window.wanderGuideDestination }));
  }

  function colorForPoi(poi, matched) {
    if (matched) return '#147d78';
    const first = poi.sources?.[0]?.id || 'osm';
    return SOURCE_DEFS[first]?.color || '#6c5aa8';
  }

  function createMarker(poi, matched) {
    const color = colorForPoi(poi, matched);
    const source = sourceLabel(poi);
    const icon = L.divIcon({ className: '', html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,.25)"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
    const layer = L.marker([poi.lat, poi.lng], { icon, interactive: true });
    layer.wanderPoi = { ...poi, source };
    layer.bindPopup(`<strong>${poi.name} · ${source}</strong><br>${poi.category}<br>${formatDistance(poi.distance)} · ${poi.minutes} min`);
    layer.on('click', () => openPoiPanel(poi));
    return layer;
  }

  function currentVisiblePois() {
    return allPois.filter(visibleBySource);
  }

  function render() {
    const mode = getMode();
    const interests = getInterests();
    const visible = currentVisiblePois();
    const filtered = visible.filter((poi) => matchesInterests(poi, interests));
    const developerPois = developerView === 'filtered' ? filtered : visible;

    poiLayer.clearLayers();
    visible.forEach((poi) => createMarker(poi, matchesInterests(poi, interests)).addTo(poiLayer));

    ui.mode.textContent = `${mode.label} · ${mode.speed.toFixed(0)} km/h`;
    ui.radius.textContent = formatDistance(mode.radius);
    ui.total.textContent = String(visible.length);
    ui.filtered.textContent = String(filtered.length);
    ui.list.innerHTML = developerPois.length ? developerPois.map((poi, index) => {
      const matched = matchesInterests(poi, interests);
      const source = sourceLabel(poi);
      return `<article class="poi-debug-item${matched ? ' user-match' : ''}" data-poi-index="${index}"><div><strong>${poi.name} · ${source}</strong><span>${poi.category} · ${formatDistance(poi.distance)} · ${poi.minutes} min · Fuente: ${source}</span></div><em>${matched ? 'Etiqueta' : 'Sin filtro'}</em></article>`;
    }).join('') : `<p class="developer-note">No hay POIs para las fuentes activas.</p>`;

    ui.list.querySelectorAll('[data-poi-index]').forEach((item) => {
      item.addEventListener('click', () => openPoiPanel(developerPois[Number(item.dataset.poiIndex)]));
    });

    const devOpen = document.body.classList.contains('dev-panel-open');
    interestArea.setLatLng(marker.getLatLng()).setRadius(mode.radius);
    if (devOpen) {
      if (!map.hasLayer(interestArea)) interestArea.addTo(map);
    } else if (map.hasLayer(interestArea)) {
      map.removeLayer(interestArea);
    }

    window.WanderPois = visible;
    document.dispatchEvent(new CustomEvent('wander:poi-updated', { detail: visible }));
  }

  async function fetchOsmPois(force = false) {
    if (loading) return;
    const mode = getMode();
    const position = marker.getLatLng();
    if (!sourceEnabled('osm')) {
      setSourcePois('osm', []);
      ui.status.textContent = 'OpenStreetMap desactivado en Fuentes de POIs.';
      return;
    }
    if (!force && lastFetchPosition && lastModeId === mode.id && map.distance(lastFetchPosition, position) < mode.threshold) return;

    loading = true;
    ui.status.textContent = 'Buscando POIs en fuentes activas...';
    ui.refresh.disabled = true;
    const query = `[out:json][timeout:25];(node(around:${mode.radius},${position.lat},${position.lng})[tourism];node(around:${mode.radius},${position.lat},${position.lng})[historic];node(around:${mode.radius},${position.lat},${position.lng})[amenity~"cafe|restaurant|bar|pub|fast_food|museum|library|arts_centre|theatre|cinema"];node(around:${mode.radius},${position.lat},${position.lng})[leisure~"park|garden|nature_reserve"];node(around:${mode.radius},${position.lat},${position.lng})[shop];way(around:${mode.radius},${position.lat},${position.lng})[tourism];way(around:${mode.radius},${position.lat},${position.lng})[historic];way(around:${mode.radius},${position.lat},${position.lng})[leisure~"park|garden|nature_reserve"];);out center tags 300;`;
    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: query }) });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      const data = await response.json();
      const pois = (data.elements || []).map((item) => {
        const lat = item.lat ?? item.center?.lat;
        const lng = item.lon ?? item.center?.lon;
        const tags = item.tags || {};
        const name = tags.name || tags.brand || tags.operator;
        if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const distance = map.distance(position, [lat, lng]);
        const sources = [{ id: 'osm', label: 'OSM' }];
        if (tags.wikidata || tags.wikipedia) sources.push({ id: 'wiki', label: 'Wiki' });
        return { id: `${item.type}-${item.id}`, name, lat, lng, tags, category: categoryFromTags(tags), distance, minutes: minutesAway(distance, mode.speed), sources };
      }).filter(Boolean);
      setSourcePois('osm', pois);
      lastFetchPosition = L.latLng(position.lat, position.lng);
      lastModeId = mode.id;
      ui.status.textContent = `${currentVisiblePois().length} POIs visibles dentro de ${formatDistance(mode.radius)}.`;
    } catch {
      ui.status.textContent = 'No se pudieron actualizar los POIs. Reintentar.';
    } finally {
      loading = false;
      ui.refresh.disabled = false;
    }
  }

  window.WanderPoiStore = {
    getAll: () => allPois.slice(),
    getVisible: () => currentVisiblePois(),
    setSourcePois,
    addSourcePois: setSourcePois,
    normalizePoi,
    mergePois,
    sourceLabel,
    openPoiPanel,
    render,
  };

  ui.viewAll.addEventListener('click', () => { developerView = 'all'; ui.viewAll.classList.add('is-active'); ui.viewFiltered.classList.remove('is-active'); render(); });
  ui.viewFiltered.addEventListener('click', () => { developerView = 'filtered'; ui.viewFiltered.classList.add('is-active'); ui.viewAll.classList.remove('is-active'); render(); });
  ui.refresh.addEventListener('click', () => fetchOsmPois(true));
  applyInterests?.addEventListener('click', () => setTimeout(render, 0));
  interestInput?.addEventListener('change', render);
  document.addEventListener('wander:interests-changed', render);
  document.addEventListener('wander:poi-sources-setting', () => { render(); fetchOsmPois(true); });
  document.addEventListener('wander:internet-pois-updated', (event) => setSourcePois('internet', event.detail || []));

  const panelObserver = new MutationObserver(render);
  panelObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  map.on('moveend', () => fetchOsmPois(false));
  setInterval(() => fetchOsmPois(false), 5000);
  fetchOsmPois(true);
})();
