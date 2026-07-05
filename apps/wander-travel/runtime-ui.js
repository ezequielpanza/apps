(() => {
  const $ = (selector) => document.querySelector(selector);

  function setText(selector, value) {
    const item = $(selector);
    if (item) item.textContent = value;
  }

  function showWander(title, message) {
    const card = $('#wander-card');
    if (card) card.hidden = false;
    setText('#wander-title', title);
    setText('#wander-message', message);
  }

  function syncContextStatus() {
    const status = window.WanderContext?.value('context.status', 'Preparando contexto');
    setText('#metric-status', status || 'Preparando contexto');
  }

  function setLocationPending() {
    syncContextStatus();
    setText('#metric-speed', '—');
    setText('#metric-heading', '—');
  }

  function inferMovement(moving, kmh) {
    if (!moving) {
      return {
        status: 'stationary',
        mode: 'unknown',
        contextStatus: 'En pausa',
        activity: 'paused',
      };
    }
    if (kmh < 8) {
      return {
        status: 'moving',
        mode: 'walking',
        contextStatus: 'Caminando',
        activity: 'walking',
      };
    }
    if (kmh < 25) {
      return {
        status: 'moving',
        mode: 'cycling',
        contextStatus: 'Andando en bicicleta',
        activity: 'cycling',
      };
    }
    return {
      status: 'moving',
      mode: 'driving',
      contextStatus: 'Conduciendo',
      activity: 'driving',
    };
  }

  function setMotion(moving, speedMps, heading, options = {}) {
    const hasPosition = window.WanderBase?.hasPosition?.() === true;
    if (!hasPosition && options.allowWithoutPosition !== true) {
      setLocationPending();
      return;
    }

    const kmh = Number(speedMps || 0) * 3.6;
    const inferred = inferMovement(Boolean(moving), kmh);
    const source = options.source || 'ui';

    window.WanderContext?.setMotion({
      status: options.motionStatus || inferred.status,
      mode: options.motionMode || inferred.mode,
      speedKmh: kmh,
      heading: Number.isFinite(heading) ? heading : null,
      source,
    });

    if (options.updateContext !== false) {
      window.WanderContext?.setContext({
        status: options.contextStatus || inferred.contextStatus,
        activity: options.contextActivity || inferred.activity,
        source,
        confidence: typeof options.confidence === 'number' ? options.confidence : 0.7,
      });
    }

    syncContextStatus();
    setText('#metric-speed', kmh.toFixed(1) + ' km/h');
    setText('#metric-heading', moving && Number.isFinite(heading) ? Math.round(heading) + '°' : '—');
  }

  function updateClock() {
    const value = new Date().toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    setText('#context-time', value);
    window.WanderContext?.updateTime();
  }

  const messages = {
    details: ['Wander', 'Soy tu compañero de viaje. El estado principal resume qué está pasando ahora en la sesión y puede combinar movimiento, actividad, lugar e intención.'],
    route: ['Ruta', 'La ruta viva vuelve después de consolidar ubicación y contexto. Primero necesito saber dónde estás y qué está pasando alrededor.'],
    food: ['Comer', 'La recomendación gastronómica usará el contexto: hora, ubicación, clima, actividad e intereses. Todavía no está conectada a lugares reales.'],
    ask: ['Preguntar', 'La IA contextual será la próxima capa. Va a leer WanderContext en vez de datos sueltos de la pantalla.'],
  };

  $('#close-wander')?.addEventListener('click', () => {
    const card = $('#wander-card');
    if (card) card.hidden = true;
  });

  document.querySelectorAll('[data-message]').forEach((button) => {
    button.addEventListener('click', () => {
      const payload = messages[button.dataset.message] || ['Wander', 'Función preparada para la siguiente etapa.'];
      showWander(payload[0], payload[1]);
    });
  });

  window.WanderContext?.subscribe((key) => {
    if (key === 'context.status') syncContextStatus();
  });

  setLocationPending();
  updateClock();
  setInterval(updateClock, 30000);

  window.WanderUI = {
    setText,
    showWander,
    syncContextStatus,
    setLocationPending,
    setMotion,
  };
})();
