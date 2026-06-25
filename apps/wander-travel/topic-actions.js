(() => {
  const panel = document.querySelector('.companion-panel');
  const title = document.querySelector('#wander-title');
  const message = document.querySelector('#wander-message');
  const actions = document.querySelector('.companion-panel .quick-actions');
  const routeButton = document.querySelector('[data-message="route"]');

  if (!panel || !title || !message || !actions || !routeButton) return;

  const dynamicClass = 'wander-topic-action';
  const stopWords = new Set([
    'Wander', 'Guía de turismo', 'Además', 'Ahora', 'Como', 'Este', 'Esta', 'Estos', 'Estas',
    'Bahamas', 'Bahameño', 'Bahameña', 'Siglo', 'Historia', 'Museos', 'Naturaleza',
  ]);

  function normalize(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function currentContext() {
    const point = typeof marker !== 'undefined' ? marker.getLatLng() : null;
    return {
      location: point ? { lat: point.lat, lng: point.lng } : null,
      mode: document.querySelector('.status-rail .metric:nth-child(1) strong')?.textContent || null,
      speed: document.querySelector('.status-rail .metric:nth-child(2) strong')?.textContent || null,
      interests: (document.querySelector('#interest-input')?.value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      previous_guide_message: message.textContent || '',
      weather: window.wanderWeatherContext || null,
    };
  }

  function coordinatesForName(name) {
    const normalized = name.toLowerCase();

    for (const poi of window.wanderInternetPois || []) {
      if (String(poi.name || '').toLowerCase() === normalized) {
        return { name: poi.name, lat: poi.lat, lng: poi.lng };
      }
    }

    if (typeof map === 'undefined') return null;
    for (const layer of Object.values(map._layers || {})) {
      if (typeof layer?.getLatLng !== 'function' || typeof layer?.getPopup !== 'function') continue;
      const content = layer.getPopup()?.getContent?.();
      if (typeof content !== 'string') continue;
      const plain = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!plain.includes(normalized)) continue;
      const point = layer.getLatLng();
      return { name, lat: point.lat, lng: point.lng };
    }
    return null;
  }

  function knownEntityNames(text) {
    const names = [];
    const lower = text.toLowerCase();

    for (const poi of window.wanderInternetPois || []) {
      const name = normalize(poi.name);
      if (name && lower.includes(name.toLowerCase())) names.push(name);
    }

    for (const item of document.querySelectorAll('#poi-debug-list .poi-debug-item strong')) {
      const name = normalize(item.textContent);
      if (name && lower.includes(name.toLowerCase())) names.push(name);
    }

    return names;
  }

  function extractNamedTopics(text) {
    const topics = [...knownEntityNames(text)];
    const patterns = [
      /(?:faro|museo|parque|isla|pueblo|ciudad|iglesia|fortaleza|playa|reserva|salina|empresa)\s+(?:de\s+|del\s+|la\s+|el\s+)?([A-ZÁÉÍÓÚÑ][\p{L}\d'’-]*(?:\s+(?:de|del|la|las|los|y|of|the|[A-ZÁÉÍÓÚÑ][\p{L}\d'’-]*)){0,5})/gu,
      /\b([A-ZÁÉÍÓÚÑ][\p{L}\d'’-]*(?:\s+(?:de|del|la|las|los|y|of|the|[A-ZÁÉÍÓÚÑ][\p{L}\d'’-]*)){1,4})\b/gu,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const raw = normalize(match[0]);
        const candidate = raw.replace(/[.,;:!?]+$/g, '');
        if (candidate.length < 4 || candidate.length > 45 || stopWords.has(candidate)) continue;
        topics.push(candidate);
      }
    }

    const unique = [];
    const seen = new Set();
    for (const topic of topics) {
      const key = topic.toLowerCase();
      if (seen.has(key)) continue;
      if ([...seen].some((existing) => existing.includes(key) && existing !== key)) continue;
      seen.add(key);
      unique.push(topic);
      if (unique.length >= 4) break;
    }
    return unique;
  }

  function clearDynamicButtons() {
    actions.querySelectorAll(`.${dynamicClass}`).forEach((button) => button.remove());
  }

  async function askAboutTopic(topic, button) {
    const original = message.textContent;
    button.disabled = true;
    title.textContent = topic;
    message.textContent = `Buscando más información sobre ${topic}...`;

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: `Contame más sobre ${topic} en relación con el lugar donde estoy. Priorizá información histórica, curiosidades, qué se puede ver y si parece visitable. No inventes datos. Respondé en texto limpio y breve, preparado para voz.`,
          context: currentContext(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'No se pudo ampliar la información.');

      title.textContent = topic;
      message.textContent = data.message;
      const destination = coordinatesForName(topic);
      window.wanderGuideDestination = destination;
      document.dispatchEvent(new CustomEvent('wander:guide-destination', { detail: destination }));
    } catch (error) {
      title.textContent = 'Guía de turismo';
      message.textContent = error?.message || original;
    } finally {
      button.disabled = false;
    }
  }

  function renderTopicButtons() {
    clearDynamicButtons();
    const text = normalize(message.textContent);
    if (!text || title.textContent === 'Pensando...') return;

    const topics = extractNamedTopics(text);
    for (const topic of topics) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = dynamicClass;
      button.textContent = topic;
      button.title = `Saber más sobre ${topic}`;
      button.addEventListener('click', () => askAboutTopic(topic, button));
      actions.insertBefore(button, routeButton);
    }
  }

  const observer = new MutationObserver(() => window.setTimeout(renderTopicButtons, 0));
  observer.observe(message, { childList: true, characterData: true, subtree: true });
  document.addEventListener('wander:internet-pois-updated', () => renderTopicButtons());
  window.setTimeout(renderTopicButtons, 1800);
})();
