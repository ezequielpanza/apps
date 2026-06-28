(() => {
  const SETTINGS_KEY = 'wander-travel-settings';
  const MEMORY_KEY = 'wander-travel-guide-memory';
  const CHECK_MS = 5000;
  const MIN_SECONDS_BETWEEN_MESSAGES = 75;

  if (typeof marker === 'undefined' || typeof map === 'undefined') return;

  const internetLayer = L.layerGroup().addTo(map);
  let lastCheckedPosition = marker.getLatLng();
  let lastMessageAt = 0;
  let busy = false;

  function getSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; } }
  function guideEnabled() { return getSettings().tourGuideEnabled !== false; }
  function historicalNearbyEnabled() { return getSettings().guideHistoricalNearbyEnabled !== false; }
  function internetDiscoveryEnabled() { return getSettings().guideInternetDiscoveryEnabled !== false; }
  function guidePreferences() {
    const settings = getSettings();
    return {
      welcomeEnabled: settings.guideWelcomeEnabled !== false,
      humorLevel: settings.guideHumorLevel || 'medio',
      welcomeLength: settings.guideWelcomeLength || 'normal',
      useWeatherContext: settings.guideUseWeatherContext !== false,
      useTimeContext: settings.guideUseTimeContext !== false,
    };
  }
  function getMemory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}');
      return { topics: Array.isArray(parsed.topics) ? parsed.topics : [], messages: Array.isArray(parsed.messages) ? parsed.messages : [] };
    } catch { return { topics: [], messages: [] }; }
  }
  function saveMemory(memory) { localStorage.setItem(MEMORY_KEY, JSON.stringify({ topics: memory.topics.slice(-120), messages: memory.messages.slice(-40) })); }
  function movementThreshold() {
    const motion = window.wanderMotionContext || {};
    const speedKnots = Number(motion.speed_knots || 0);
    if (motion.likely_boat || speedKnots >= 3.5) return 900;
    const speed = Number.parseFloat(document.querySelector('.status-rail .metric:nth-child(2) strong')?.textContent || '5');
    if (speed <= 7) return 180;
    if (speed <= 25) return 600;
    return 1500;
  }
  function interests() { return (document.querySelector('#interest-input')?.value || '').split(',').map((item) => item.trim()).filter(Boolean); }
  function nearbyPois() {
    return [...document.querySelectorAll('#poi-debug-list .poi-debug-item')].slice(0, 8).map((item) => {
      const name = item.querySelector('strong')?.textContent?.trim();
      const detail = item.querySelector('span')?.textContent?.trim();
      return name ? { name, detail, source: 'map' } : null;
    }).filter(Boolean);
  }
  async function reverseGeocode(point) {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('lat', point.lat);
      url.searchParams.set('lon', point.lng);
      url.searchParams.set('zoom', '16');
      url.searchParams.set('addressdetails', '1');
      const response = await fetch(url, { headers: { 'accept-language': 'es' } });
      if (!response.ok) return null;
      const data = await response.json();
      return { display_name: data.display_name || null, address: data.address || {}, category: data.category || null, type: data.type || null };
    } catch { return null; }
  }
  async function fetchWikipediaNearby(point) {
    if (!internetDiscoveryEnabled()) return [];
    async function search(language) {
      const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
      url.searchParams.set('action', 'query');
      url.searchParams.set('generator', 'geosearch');
      url.searchParams.set('ggsprimary', 'all');
      url.searchParams.set('ggsnamespace', '0');
      url.searchParams.set('ggsradius', '10000');
      url.searchParams.set('ggslimit', '12');
      url.searchParams.set('ggscoord', `${point.lat}|${point.lng}`);
      url.searchParams.set('prop', 'coordinates|extracts|info');
      url.searchParams.set('exintro', '1');
      url.searchParams.set('explaintext', '1');
      url.searchParams.set('inprop', 'url');
      url.searchParams.set('format', 'json');
      url.searchParams.set('origin', '*');
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = await response.json();
      return Object.values(data?.query?.pages || {}).map((page) => {
        const coordinate = page.coordinates?.[0];
        if (!coordinate) return null;
        return { id: `wikipedia-${language}-${page.pageid}`, name: page.title, summary: String(page.extract || '').slice(0, 500), lat: coordinate.lat, lng: coordinate.lon, url: page.fullurl || null, source: `Wikipedia ${language.toUpperCase()}`, distance: map.distance(point, [coordinate.lat, coordinate.lon]) };
      }).filter(Boolean);
    }
    try {
      let results = await search('es');
      if (results.length < 4) {
        const english = await search('en');
        const known = new Set(results.map((item) => item.name.toLowerCase()));
        results = results.concat(english.filter((item) => !known.has(item.name.toLowerCase())));
      }
      return results.sort((a, b) => a.distance - b.distance).slice(0, 12);
    } catch { return []; }
  }
  function renderInternetPois(pois) {
    internetLayer.clearLayers();
    window.wanderInternetPois = pois;
    pois.forEach((poi) => {
      const icon = L.divIcon({ className: '', html: '<div style="width:18px;height:18px;border-radius:50%;background:#b06f32;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,.25)"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
      const distance = poi.distance < 1000 ? `${Math.round(poi.distance)} m` : `${(poi.distance / 1000).toFixed(1)} km`;
      L.marker([poi.lat, poi.lng], { icon }).bindPopup(`<strong>${poi.name}</strong><br>Descubierto en internet<br>${distance}`).addTo(internetLayer);
    });
    document.dispatchEvent(new CustomEvent('wander:internet-pois-updated', { detail: pois }));
  }
  function cityName(place) { return place?.address?.city || place?.address?.town || place?.address?.village || place?.address?.island || place?.address?.municipality || null; }
  function dayMoment() { const hour = new Date().getHours(); if (hour < 6) return 'madrugada'; if (hour < 11) return 'mañana'; if (hour < 14) return 'mediodía'; if (hour < 18) return 'tarde'; if (hour < 21) return 'atardecer'; return 'noche'; }
  function waterSignals(place) {
    const text = `${place?.display_name || ''} ${place?.category || ''} ${place?.type || ''} ${Object.values(place?.address || {}).join(' ')}`.toLowerCase();
    return /water|sea|ocean|bay|harbour|harbor|marina|reef|cay|sound|channel|atlantic|caribbean|bahía|puerto|mar|océano|agua|arrecife|canal/.test(text);
  }
  function nauticalContext(place) {
    const motion = window.wanderMotionContext || {};
    const speedKnots = Number(motion.speed_knots || 0);
    const onWater = Boolean(motion.on_water_hint || waterSignals(place));
    const likelyBoat = Boolean(motion.likely_boat || (onWater && speedKnots >= 2.5) || speedKnots >= 4.5);
    return {
      possible: true,
      likely_boat: likelyBoat,
      on_water_signal: onWater,
      speed_knots: Number.isFinite(speedKnots) ? Number(speedKnots.toFixed(1)) : null,
      heading_degrees: Number.isFinite(Number(motion.heading_degrees)) ? Math.round(Number(motion.heading_degrees)) : null,
      instruction: likelyBoat ? 'El usuario probablemente está navegando en barco. No asumir que puede caminar a un POI. Hablar en contexto náutico: rumbo, costa, puerto, arrecife, fondeo, distancia por agua, seguridad y si conviene solo mirar o guardar para después. Evitar frases como “si empezás a caminar” salvo que esté claramente en tierra.' : 'Puede estar caminando, en vehículo o navegando. Si hay señales de agua, no asumir caminata; mencionar que Wander puede estar en modo barco.'
    };
  }
  function topicKey(place, pois, point) {
    const area = cityName(place) || place?.display_name || '';
    const poiPart = pois.slice(0, 3).map((poi) => poi.name.toLowerCase()).join('|');
    return `${area.toLowerCase()}|${poiPart}|${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;
  }
  function showGuideMessage(text) {
    const panel = document.querySelector('.companion-panel');
    const title = document.querySelector('#wander-title');
    const message = document.querySelector('#wander-message');
    const tab = document.querySelector('#show-companion');
    if (!panel || !title || !message) return;
    title.textContent = 'Guía de turismo';
    message.textContent = text;
    panel.classList.remove('is-hidden');
    tab?.classList.add('has-unread');
    const feed = document.querySelector('#active-feed');
    const count = document.querySelector('#active-count');
    if (feed) {
      const card = document.createElement('div');
      card.className = 'message-card';
      card.textContent = text;
      feed.prepend(card);
      while (feed.children.length > 12) feed.lastElementChild?.remove();
      if (count) count.textContent = String(feed.children.length);
    }
  }
  async function askWander(messageText, context) {
    const response = await fetch('/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: messageText, context }) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) return null;
    return data.message?.trim() || null;
  }
  async function evaluateGuideMoment(force = false) {
    if (!guideEnabled() || busy) return;
    const now = Date.now();
    if (!force && now - lastMessageAt < MIN_SECONDS_BETWEEN_MESSAGES * 1000) return;
    const point = marker.getLatLng();
    const moved = map.distance(lastCheckedPosition, point);
    if (!force && moved < movementThreshold()) return;
    busy = true;
    lastCheckedPosition = L.latLng(point.lat, point.lng);
    try {
      const [place, internetPois] = await Promise.all([reverseGeocode(point), fetchWikipediaNearby(point)]);
      renderInternetPois(internetPois);
      const mapPois = nearbyPois();
      const allPois = [...mapPois, ...internetPois.map((poi) => ({ name: poi.name, detail: poi.summary, source: poi.source, distance: poi.distance }))];
      const memory = getMemory();
      const selectedInterests = interests();
      const preferences = guidePreferences();
      const city = cityName(place) || document.querySelector('.top-bar h1')?.textContent?.replace(/^Explorando\s+/i, '').trim() || 'este lugar';
      const welcomeKey = `welcome:${city.toLowerCase()}`;
      const nautical = nauticalContext(place);
      const baseContext = {
        mode: 'tour_guide',
        location: { lat: point.lat, lng: point.lng },
        place,
        city,
        nearby_pois: mapPois,
        internet_discovered_pois: internetPois,
        interests: selectedInterests,
        interests_are_confirmed_preferences: true,
        guide_preferences: preferences,
        temporal_context: preferences.useTimeContext ? { day_moment: dayMoment(), instruction: 'Usar referencias como mañana, mediodía, tarde, atardecer o noche, sin decir la hora exacta.' } : null,
        weather_context: preferences.useWeatherContext ? (window.wanderWeatherContext || null) : null,
        movement: { mode: nautical.likely_boat ? 'Navegando en barco' : (document.querySelector('.status-rail .metric:nth-child(1) strong')?.textContent || null), speed: nautical.speed_knots ? `${nautical.speed_knots} nudos` : (document.querySelector('.status-rail .metric:nth-child(2) strong')?.textContent || null), raw: window.wanderMotionContext || null },
        nautical_context: nautical,
        already_told_topics: memory.topics.slice(-30),
        recent_messages: memory.messages.slice(-10),
      };
      if (force && preferences.welcomeEnabled && city && !memory.topics.includes(welcomeKey)) {
        const welcomeLengthText = preferences.welcomeLength === 'breve' ? 'muy breve, unos 45 a 65 palabras' : preferences.welcomeLength === 'detallada' ? 'algo más completa, hasta 150 palabras' : 'normal, entre 80 y 110 palabras';
        const humorText = preferences.humorLevel === 'bajo' ? 'humor muy sutil o ninguno' : preferences.humorLevel === 'alto' ? 'un toque de humor más presente pero sin hacer stand-up' : 'un toque de humor suave';
        const welcome = await askWander(`Dale la bienvenida al usuario a ${city}. Presentá la zona con una lectura útil. Si el contexto indica barco o agua, hablá como compañero náutico y no como guía de caminata. Proponé 2 o 3 posibilidades según sus intereses y el medio de transporte real. Usá ${welcomeLengthText}. Sumá ${humorText}. ${preferences.useTimeContext ? 'Incluí una referencia temporal natural del momento del día, pero no digas la hora exacta.' : 'No menciones el momento del día.'} ${preferences.useWeatherContext ? 'Podés mencionar clima, viento o tormenta solo si aporta a decidir.' : 'No menciones clima ni temperatura.'} Texto limpio para voz, sin Markdown, sin listas ni enlaces.`, baseContext);
        if (welcome && welcome.toUpperCase() !== 'SILENCIO') { showGuideMessage(welcome); lastMessageAt = Date.now(); memory.topics.push(welcomeKey); memory.messages.push(welcome); saveMemory(memory); return; }
      }
      const key = topicKey(place, allPois, point);
      if (!force && memory.topics.includes(key)) return;
      const enabledTopics = [];
      if (historicalNearbyEnabled()) enabledTopics.push('datos históricos y curiosidades cercanas');
      if (internetDiscoveryEnabled()) enabledTopics.push('información y lugares descubiertos en internet que no figuran en el mapa');
      if (!enabledTopics.length) return;
      const humorText = preferences.humorLevel === 'bajo' ? 'humor mínimo' : preferences.humorLevel === 'alto' ? 'humor presente pero breve' : 'humor suave';
      const guideText = await askWander(`Actuá como guía de turismo y compañero de viaje. Podés hablar sobre: ${enabledTopics.join(' y ')}. Los intereses enviados son gustos confirmados del usuario. Priorizá lo interesante y no repitas temas. Adaptá el mensaje al medio de transporte: si el contexto náutico indica barco o agua, no propongas caminar; usá referencias de navegación, costa, rumbo, distancia por agua y seguridad. Usá ${humorText}. ${preferences.useTimeContext ? 'Podés usar una referencia temporal natural del día, pero no digas la hora exacta.' : 'No menciones el momento del día.'} ${preferences.useWeatherContext ? 'Podés usar clima, viento o tormenta si realmente aporta al recorrido.' : 'No menciones clima ni temperatura.'} Escribí texto limpio y natural, preparado para voz, sin Markdown, listas ni enlaces. Si no hay suficiente información verificable o no vale la pena interrumpir, respondé exactamente SILENCIO.`, baseContext);
      if (!guideText || guideText.toUpperCase() === 'SILENCIO') return;
      showGuideMessage(guideText);
      lastMessageAt = Date.now();
      memory.topics.push(key);
      memory.messages.push(guideText);
      saveMemory(memory);
    } finally { busy = false; }
  }
  document.addEventListener('wander:tour-guide-setting', (event) => {
    if (!event.detail?.internetDiscoveryEnabled) { internetLayer.clearLayers(); window.wanderInternetPois = []; }
    if (event.detail?.enabled) { lastCheckedPosition = marker.getLatLng(); window.setTimeout(() => evaluateGuideMoment(true), 1200); }
  });
  document.addEventListener('wander:developer-city-changed', () => { lastCheckedPosition = marker.getLatLng(); window.setTimeout(() => evaluateGuideMoment(true), 1200); });
  document.addEventListener('wander:motion-context', () => { if (guideEnabled()) window.setTimeout(() => evaluateGuideMoment(false), 800); });
  window.setInterval(() => evaluateGuideMoment(false), CHECK_MS);
  window.setTimeout(() => { if (guideEnabled()) evaluateGuideMoment(true); }, 3500);
})();