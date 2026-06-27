(() => {
  if (typeof map === 'undefined' || typeof marker === 'undefined' || typeof L === 'undefined') return;

  const STORAGE_KEY = 'wander-travel-settings';
  const CITY_KEY = 'wander-travel-developer-city';
  const DEFAULT_CITY_ID = 'nassau';
  const cities = [
    { id: 'nassau', name: 'Nassau, Bahamas', shortName: 'Nassau', lat: 25.0781, lng: -77.3383, zoom: 14 },
    { id: 'great-inagua', name: 'Matthew Town, Great Inagua', shortName: 'Great Inagua', lat: 20.9496, lng: -73.6789, zoom: 13 },
    { id: 'miami', name: 'Miami, Florida', shortName: 'Miami', lat: 25.7617, lng: -80.1918, zoom: 13 },
    { id: 'new-york', name: 'New York, Manhattan', shortName: 'New York', lat: 40.7580, lng: -73.9855, zoom: 13 },
  ];

  const panel = document.querySelector('#developer-panel .developer-panel');
  if (!panel || document.querySelector('#developer-city-select')) return;

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveSettings(next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function selectedCityId() {
    const stored = loadSettings().developerDefaultCity || localStorage.getItem(CITY_KEY);
    return cities.some((city) => city.id === stored) ? stored : DEFAULT_CITY_ID;
  }

  function cityById(id) {
    return cities.find((city) => city.id === id) || cities.find((city) => city.id === DEFAULT_CITY_ID);
  }

  function setPositionAtCity(city, reason = 'Ciudad de prueba') {
    const point = L.latLng(city.lat, city.lng);
    if (typeof setPosition === 'function') setPosition(point, reason);
    else {
      marker.setLatLng(point);
      map.panTo(point);
      const readout = document.querySelector('#location-readout');
      if (readout) {
        const strong = readout.querySelector('strong');
        const small = readout.querySelector('small');
        if (strong) strong.textContent = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
        if (small) small.textContent = reason;
      }
    }
    map.setView(point, city.zoom || 13, { animate: false });

    const header = document.querySelector('.top-bar h1');
    if (header) header.textContent = `Explorando ${city.shortName}`;

    document.dispatchEvent(new CustomEvent('wander:developer-city-changed', {
      detail: { city, location: { lat: city.lat, lng: city.lng } },
    }));
  }

  const card = document.createElement('section');
  card.className = 'developer-city-card';
  card.innerHTML = `
    <label for="developer-city-select">Ciudad de prueba</label>
    <select id="developer-city-select">
      ${cities.map((city) => `<option value="${city.id}">${city.name}</option>`).join('')}
    </select>
    <p>Define dónde aparece Wander por defecto para probar guía, POIs, clima y rutas.</p>
  `;

  const style = document.createElement('style');
  style.textContent = `
    .developer-city-card{margin:12px 0 16px;padding:14px;border:1px solid rgba(24,32,27,.12);border-radius:16px;background:#fff;box-shadow:0 8px 22px rgba(24,32,27,.06)}
    .developer-city-card label{display:block;margin:0 0 7px;font-size:.78rem;font-weight:900;color:#6c5aa8;text-transform:uppercase;letter-spacing:.08em}
    .developer-city-card select{width:100%;border:1px solid #d7dee6;border-radius:12px;padding:10px;background:#fff;font-weight:800;color:#18212f}
    .developer-city-card p{margin:8px 0 0;color:#667085;font-size:.78rem;line-height:1.35}
  `;
  document.head.appendChild(style);

  const reference = panel.querySelector('.developer-note');
  if (reference?.nextSibling) panel.insertBefore(card, reference.nextSibling);
  else panel.appendChild(card);

  const select = card.querySelector('#developer-city-select');
  select.value = selectedCityId();

  select.addEventListener('change', () => {
    const city = cityById(select.value);
    const settings = loadSettings();
    settings.developerDefaultCity = city.id;
    saveSettings(settings);
    localStorage.setItem(CITY_KEY, city.id);
    setPositionAtCity(city, 'Ciudad de prueba');
  });

  window.setTimeout(() => {
    const city = cityById(select.value || DEFAULT_CITY_ID);
    setPositionAtCity(city, 'Ciudad de prueba por defecto');
  }, 500);
})();
