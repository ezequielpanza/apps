(() => {
  const APP_VERSION = 'v0.10.0';
  const versionBadge = document.querySelector('.app-version');
  if (versionBadge) versionBadge.textContent = APP_VERSION;
  document.title = `Wander Travel ${APP_VERSION}`;

  if (typeof map === 'undefined' || typeof marker === 'undefined' || typeof L === 'undefined') return;

  const developerPanel = document.querySelector('#developer-panel .developer-panel');
  const interestInput = document.querySelector('#interest-input');
  const applyInterests = document.querySelector('#apply-interests');
  const speedMetric = document.querySelector('.status-rail .metric:nth-child(2) strong');
  const modeMetric = document.querySelector('.status-rail .metric:nth-child(1) strong');

  if (!developerPanel) return;

  const panelSection = document.createElement('section');
  panelSection.className = 'poi-debug-section';
  panelSection.innerHTML = `
    <div class="poi-debug-header">
      <div>
        <p class="developer-note">Área de interés</p>
        <h3>POIs alcanzables</h3>
      </div>
      <button id="refresh-pois-button" class="secondary-action" type="button">Actualizar</button>
    </div>
    <div class="poi-debug-stats">
      <div><span>Método</span><strong id="poi-mode">-</strong></div>
      <div><span>Alcance</span><strong id="poi-radius">-</strong></div>
      <div><span>Total</span><strong id="poi-total">0</strong></div>
      <div><span>Usuario</span><strong id="poi-filtered">0</strong></div>
    </div>
    <p id="poi-debug-status" class="poi-debug-status">Esperando ubicación...</p>
    <div id="poi-debug-list" class="poi-debug-list" aria-label="POIs dentro del área de interés"></div>
  `;
  developerPanel.appendChild(panelSection);

  const style = document.createElement('style');
  style.textContent = `
    .poi-debug-section{margin-top:20px;padding-top:18px;border-top:1px solid rgba(24,32,27,.12)}
    .poi-debug-header{display:flex;align-items:center;justify-content:space-between;gap:12px}.poi-debug-header h3{margin:2px 0 0;font-size:1rem}
    .poi-debug-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}.poi-debug-stats div{padding:10px;border-radius:12px;background:#f5f3fa}.poi-debug-stats span{display:block;font-size:.66rem;color:#766e88;text-transform:uppercase;letter-spacing:.05em}.poi-debug-stats strong{display:block;margin-top:3px;font-size:.88rem;color:#342d52}
    .poi-debug-status{margin:8px 0;padding:9px 10px;border-radius:10px;background:rgba(20,125,120,.08);color:#356b68;font-size:.76rem;font-weight:700}
    .poi-debug-list{display:grid;gap:7px;max-height:38vh;overflow:auto;padding-right:3px}.poi-debug-item{display:grid;grid-template-columns:1fr auto;gap:8px;padding:9px 10px;border:1px solid rgba(24,32,27,.1);border-radius:11px;background:white}.poi-debug-item strong{display:block;font-size:.8rem}.poi-debug-item span{display:block;margin-top:2px;font-size:.68rem;color:#777}.poi-debug-item em{align-self:center;font-size:.66rem;font-style:normal;font-weight:800;color:#6c5aa8}.poi-debug-item.user-match{border-color:rgba(20,125,120,.35);background:rgba(20,125,120,.04)}
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
  };

  const userLayer = L.layerGroup().addTo(map);
  const developerLayer = L.layerGroup();
  const interestArea = L.circle(marker.getLatLng(), { radius: 1250, weight: 1, fillOpacity: 0.04, opacity: 0.35 });

  let lastFetchPosition = null;
  let lastModeId = null;
  let allPois = [];
  let loading = false;

  function parseSpeed() {
    const text = speedMetric?.textContent || '';
    const value = Number.parseFloat(text.replace(',', '.'));
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
    if (['park','garden'].includes(tags.leisure)) return 'naturaleza';
    if (['gallery','artwork'].includes(tags.tourism) || tags.amenity === 'arts_centre') return 'arte';
    if (tags.tourism === 'attraction') return 'atraccion';
    if (tags.shop) return 'tienda';
    return 'otro';
  }

  function matchesInterests(poi, interests) {
    if (!interests.length) return false;
    const text = `${poi.name} ${poi.category} ${poi.tags?.description || ''}`.toLowerCase();
    const synonyms = {
      cafe: ['cafe','cafes','cafeteria'], comida: ['comida','gastronomia','restaurant','bar'],
      historia: ['historia','historico','patrimonio','arquitectura'], museo: ['museo','arte','cultura'],
      mirador: ['vista','mirador','paisaje'], naturaleza: ['naturaleza','parque','jardin','playa'],
      arte: ['arte','galeria','mural'], atraccion: ['explorar','atraccion','turismo'], tienda: ['compras','tienda']
    };
    return interests.some((interest) => {
      if (text.includes(interest)) return true;
      return Object.entries(synonyms).some(([category, words]) => poi.category === category && words.some((word) => interest.includes(word) || word.includes(interest)));
    });
  }

  function formatDistance(meters) {
    return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
  }

  function minutesAway(distance, speedKmh) {
    return Math.max(1, Math.round((distance / 1000) / Math.max(speedKmh, 1) * 60));
  }

  function createMarker(poi, matched) {
    const color = matched ? '#147d78' : '#6c5aa8';
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,.25)"></div>`,
      iconSize: [18, 18], iconAnchor: [9, 9],
    });
    return L.marker(poi.point, { icon }).bindPopup(`<strong>${poi.name}</strong><br>${poi.category}<br>${formatDistance(poi.distance)} · ${poi.minutes} min`);
  }

  function render() {
    const mode = getMode();
    const interests = getInterests();
    const filtered = allPois.filter((poi) => matchesInterests(poi, interests));

    userLayer.clearLayers();
    developerLayer.clearLayers();

    filtered.forEach((poi) => createMarker(poi, true).addTo(userLayer));
    allPois.forEach((poi) => createMarker(poi, matchesInterests(poi, interests)).addTo(developerLayer));

    ui.mode.textContent = `${mode.label} · ${mode.speed.toFixed(0)} km/h`;
    ui.radius.textContent = formatDistance(mode.radius);
    ui.total.textContent = String(allPois.length);
    ui.filtered.textContent = String(filtered.length);

    ui.list.innerHTML = allPois.length ? allPois.map((poi) => {
      const matched = matchesInterests(poi, interests);
      return `<article class="poi-debug-item${matched ? ' user-match' : ''}"><div><strong>${poi.name}</strong><span>${poi.category} · ${formatDistance(poi.distance)} · ${poi.minutes} min</span></div><em>${matched ? 'Usuario' : 'Solo dev'}</em></article>`;
    }).join('') : '<p class="developer-note">No se encontraron POIs dentro del área.</p>';

    const devOpen = document.body.classList.contains('dev-panel-open');
    if (devOpen) {
      if (!map.hasLayer(developerLayer)) developerLayer.addTo(map);
      if (map.hasLayer(userLayer)) map.removeLayer(userLayer);
      interestArea.setLatLng(marker.getLatLng()).setRadius(mode.radius);
      if (!map.hasLayer(interestArea)) interestArea.addTo(map);
    } else {
      if (!map.hasLayer(userLayer)) userLayer.addTo(map);
      if (map.hasLayer(developerLayer)) map.removeLayer(developerLayer);
      if (map.hasLayer(interestArea)) map.removeLayer(interestArea);
    }
  }

  async function fetchPois(force = false) {
    if (loading) return;
    const mode = getMode();
    const position = marker.getLatLng();

    if (!force && lastFetchPosition && lastModeId === mode.id && map.distance(lastFetchPosition, position) < mode.threshold) return;

    loading = true;
    ui.status.textContent = 'Buscando todos los POIs alcanzables...';
    ui.refresh.disabled = true;

    const query = `[out:json][timeout:25];(node(around:${mode.radius},${position.lat},${position.lng})[tourism];node(around:${mode.radius},${position.lat},${position.lng})[historic];node(around:${mode.radius},${position.lat},${position.lng})[amenity~"cafe|restaurant|bar|pub|fast_food|museum|library|arts_centre|theatre|cinema"];node(around:${mode.radius},${position.lat},${position.lng})[leisure~"park|garden|nature_reserve"];node(around:${mode.radius},${position.lat},${position.lng})[shop];way(around:${mode.radius},${position.lat},${position.lng})[tourism];way(around:${mode.radius},${position.lat},${position.lng})[historic];way(around:${mode.radius},${position.lat},${position.lng})[leisure~"park|garden|nature_reserve"];);out center tags 300;`;

    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      const data = await response.json();
      const seen = new Set();
      allPois = data.elements.map((item) => {
        const lat = item.lat ?? item.center?.lat;
        const lng = item.lon ?? item.center?.lon;
        if (!lat || !lng) return null;
        const tags = item.tags || {};
        const name = tags.name || tags.brand || tags.operator;
        if (!name) return null;
        const key = `${name.toLowerCase()}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
        if (seen.has(key)) return null;
        seen.add(key);
        const distance = map.distance(position, [lat, lng]);
        return { id: `${item.type}-${item.id}`, name, tags, category: categoryFromTags(tags), point: [lat, lng], distance, minutes: minutesAway(distance, mode.speed) };
      }).filter(Boolean).sort((a, b) => a.distance - b.distance);

      lastFetchPosition = L.latLng(position.lat, position.lng);
      lastModeId = mode.id;
      ui.status.textContent = `${allPois.length} POIs encontrados dentro de ${formatDistance(mode.radius)}.`;
      render();
    } catch (error) {
      ui.status.textContent = 'No se pudieron actualizar los POIs. Reintentar.';
    } finally {
      loading = false;
      ui.refresh.disabled = false;
    }
  }

  ui.refresh.addEventListener('click', () => fetchPois(true));
  applyInterests?.addEventListener('click', () => setTimeout(render, 0));
  interestInput?.addEventListener('change', render);

  const panelObserver = new MutationObserver(render);
  panelObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  map.on('moveend', () => fetchPois(false));
  setInterval(() => fetchPois(false), 5000);

  fetchPois(true);
})();
