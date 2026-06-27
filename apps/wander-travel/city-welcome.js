(() => {
  if (typeof marker === 'undefined') return;

  const STORAGE_KEY = 'wander-travel-settings';
  const MEMORY_KEY = 'wander-travel-city-welcome-memory';
  const STATE_KEY = 'wander-travel-city-welcome-state';
  let busy = false;

  function settings() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function memory() {
    try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveMemory(next) {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(next));
  }

  function state() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveState(next) {
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    document.dispatchEvent(new CustomEvent('wander:city-welcome-state', { detail: next }));
  }

  function interests() {
    return (document.querySelector('#interest-input')?.value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function dayMoment() {
    const hour = new Date().getHours();
    if (hour < 6) return 'madrugada';
    if (hour < 11) return 'mañana';
    if (hour < 14) return 'mediodía';
    if (hour < 18) return 'tarde';
    if (hour < 21) return 'atardecer';
    return 'noche';
  }

  function show(text) {
    const panel = document.querySelector('.companion-panel');
    const title = document.querySelector('#wander-title');
    const message = document.querySelector('#wander-message');
    const tab = document.querySelector('#show-companion');
    if (!panel || !title || !message) return;
    title.textContent = 'Guía de turismo';
    message.textContent = text;
    panel.classList.remove('is-hidden');
    tab?.classList.add('has-unread');
  }

  async function welcome(city, force = false) {
    const config = settings();
    if (config.tourGuideEnabled === false || config.guideWelcomeEnabled === false || busy || !city) return;

    const key = city.toLowerCase();
    const seen = memory();
    if (!force && seen[key]) {
      saveState({ city, status: 'already_shown', shownAt: seen[key], poiAllowedAt: Date.now() + 2500 });
      return;
    }

    busy = true;
    saveState({ city, status: 'pending', startedAt: Date.now(), poiAllowedAt: Date.now() + 9000 });
    try {
      const point = marker.getLatLng();
      const routeOptions = window.WanderHumanRouteContext?.buildRouteOptions?.({ city }) || [];
      const length = config.guideWelcomeLength || 'normal';
      const lengthText = length === 'breve' ? 'breve, 45 a 65 palabras' : length === 'detallada' ? 'detallada, hasta 150 palabras' : 'normal, 80 a 110 palabras';
      const humor = config.guideHumorLevel || 'medio';
      const humorText = humor === 'bajo' ? 'humor muy sutil' : humor === 'alto' ? 'humor presente pero natural' : 'humor suave';
      const useTime = config.guideUseTimeContext !== false;
      const useWeather = config.guideUseWeatherContext !== false;

      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: `Empezá exactamente con: Bienvenido a ${city}. Después presentá la ciudad como guía de turismo por auriculares. Todavía no enumeres POIs puntuales ni detalles de lugares específicos: primero da una bienvenida general, contexto de la ciudad y una orientación inicial. Al final podés decir que en unos segundos vas a proponer alternativas concretas. Usá orientación humana, no referencias al mapa ni a la pantalla. No digas arriba, abajo, arriba a la derecha, abajo a la izquierda ni puntos cardinales. Si no sabés hacia dónde mira la persona, usá cerca de tu posición actual, a tantos minutos o a tantas cuadras. Largo ${lengthText}. Sumá ${humorText}. ${useTime ? 'Incluí una referencia temporal natural del día, sin decir la hora exacta.' : 'No menciones el momento del día.'} ${useWeather ? 'Podés mencionar clima o temperatura solo si aporta al recorrido.' : 'No menciones clima ni temperatura.'} Texto limpio para voz, sin Markdown, sin listas ni enlaces.`,
          context: {
            mode: 'city_welcome',
            city,
            location: { lat: point.lat, lng: point.lng },
            interests: interests(),
            route_options: routeOptions,
            weather_context: useWeather ? window.wanderWeatherContext || null : null,
            temporal_context: useTime ? { day_moment: dayMoment() } : null,
            guide_preferences: {
              welcomeLength: length,
              humorLevel: humor,
              useTimeContext: useTime,
              useWeatherContext: useWeather,
            },
            route_language_instructions: {
              style: 'Guía por auriculares. El usuario puede tener el celular en el bolsillo. Usar derecha, izquierda, de frente, detrás, cuadras, metros o minutos. No usar referencias de mapa o pantalla.',
            },
          },
        }),
      });
      const data = await response.json().catch(() => null);
      const text = data?.message?.trim();
      if (response.ok && data?.ok && text) {
        show(text);
        seen[key] = Date.now();
        saveMemory(seen);
        saveState({ city, status: 'shown', shownAt: Date.now(), poiAllowedAt: Date.now() + 12000 });
      } else {
        saveState({ city, status: 'failed', failedAt: Date.now(), poiAllowedAt: Date.now() + 4000 });
      }
    } catch {
      saveState({ city, status: 'failed', failedAt: Date.now(), poiAllowedAt: Date.now() + 4000 });
    } finally {
      busy = false;
    }
  }

  document.addEventListener('wander:developer-city-changed', (event) => {
    const city = event.detail?.city?.shortName || event.detail?.city?.name;
    window.setTimeout(() => welcome(city, false), 1200);
  });

  window.setTimeout(() => {
    const title = document.querySelector('.top-bar h1')?.textContent?.replace(/^Explorando\s+/i, '').trim();
    if (title) welcome(title, false);
  }, 1600);
})();
