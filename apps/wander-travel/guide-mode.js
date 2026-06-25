(() => {
  const SETTINGS_KEY = 'wander-travel-settings';
  const MEMORY_KEY = 'wander-travel-guide-memory';
  const CHECK_MS = 5000;
  const MIN_SECONDS_BETWEEN_MESSAGES = 75;

  if (typeof marker === 'undefined' || typeof map === 'undefined') return;

  let lastCheckedPosition = marker.getLatLng();
  let lastMessageAt = 0;
  let busy = false;

  function getSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function guideEnabled() {
    return getSettings().tourGuideEnabled !== false;
  }

  function getMemory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}');
      return {
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      };
    } catch {
      return { topics: [], messages: [] };
    }
  }

  function saveMemory(memory) {
    localStorage.setItem(MEMORY_KEY, JSON.stringify({
      topics: memory.topics.slice(-120),
      messages: memory.messages.slice(-40),
    }));
  }

  function movementThreshold() {
    const speed = Number.parseFloat(document.querySelector('.status-rail .metric:nth-child(2) strong')?.textContent || '5');
    if (speed <= 7) return 180;
    if (speed <= 25) return 600;
    return 1500;
  }

  function interests() {
    return (document.querySelector('#interest-input')?.value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function nearbyPois() {
    return [...document.querySelectorAll('#poi-debug-list .poi-debug-item')]
      .slice(0, 8)
      .map((item) => {
        const name = item.querySelector('strong')?.textContent?.trim();
        const detail = item.querySelector('span')?.textContent?.trim();
        return name ? { name, detail } : null;
      })
      .filter(Boolean);
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
      return {
        display_name: data.display_name || null,
        address: data.address || {},
        category: data.category || null,
        type: data.type || null,
      };
    } catch {
      return null;
    }
  }

  function topicKey(place, pois, point) {
    const area = place?.address?.city || place?.address?.town || place?.address?.village || place?.address?.island || place?.display_name || '';
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
      const [place, pois] = await Promise.all([
        reverseGeocode(point),
        Promise.resolve(nearbyPois()),
      ]);

      const memory = getMemory();
      const key = topicKey(place, pois, point);
      if (!force && memory.topics.includes(key)) return;

      const selectedInterests = interests();
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Actuá como guía de turismo. Los intereses enviados son gustos confirmados del usuario y debés hablar como alguien que ya los conoce. Si recomendás algo relacionado, decí por ejemplo: Como te gustan los museos, te propongo este lugar; o Como te interesa la historia, te cuento esto. No uses frases condicionales como si te interesan los museos cuando museos ya figura entre sus intereses. Escribí texto limpio y natural, pensado para ser leído en voz alta, sin Markdown, asteriscos, listas, títulos ni enlaces. No repitas temas ya contados. Si no hay suficiente información verificable o no vale la pena interrumpir, respondé exactamente SILENCIO.',
          context: {
            mode: 'tour_guide',
            location: { lat: point.lat, lng: point.lng },
            place,
            nearby_pois: pois,
            interests: selectedInterests,
            interests_are_confirmed_preferences: true,
            movement: {
              mode: document.querySelector('.status-rail .metric:nth-child(1) strong')?.textContent || null,
              speed: document.querySelector('.status-rail .metric:nth-child(2) strong')?.textContent || null,
            },
            already_told_topics: memory.topics.slice(-30),
            recent_messages: memory.messages.slice(-10),
          },
        }),
      });

      const data = await response.json().catch(() => null);
      const text = data?.message?.trim();
      if (!response.ok || !data?.ok || !text || text.toUpperCase() === 'SILENCIO') return;

      showGuideMessage(text);
      lastMessageAt = Date.now();
      memory.topics.push(key);
      memory.messages.push(text);
      saveMemory(memory);
    } finally {
      busy = false;
    }
  }

  document.addEventListener('wander:tour-guide-setting', (event) => {
    if (event.detail?.enabled) {
      lastCheckedPosition = marker.getLatLng();
      window.setTimeout(() => evaluateGuideMoment(true), 1200);
    }
  });

  window.setInterval(() => evaluateGuideMoment(false), CHECK_MS);
  window.setTimeout(() => {
    if (guideEnabled()) evaluateGuideMoment(true);
  }, 3500);
})();
