(() => {
  const $ = (selector) => document.querySelector(selector);
  const MESSAGE_TIMEOUT_KEY = 'wander.settings.messageTimeoutMs';
  const DEFAULT_MESSAGE_TIMEOUT_MS = 5000;
  let messageTimer = null;

  function getMessageTimeoutMs() {
    try {
      const stored = Number(localStorage.getItem(MESSAGE_TIMEOUT_KEY));
      return Number.isFinite(stored) ? Math.max(0, Math.min(60000, stored)) : DEFAULT_MESSAGE_TIMEOUT_MS;
    } catch {
      return DEFAULT_MESSAGE_TIMEOUT_MS;
    }
  }

  function setMessageTimeoutMs(value) {
    const timeoutMs = Math.max(0, Math.min(60000, Number(value) || 0));
    try { localStorage.setItem(MESSAGE_TIMEOUT_KEY, String(timeoutMs)); } catch {}
    window.WanderContext?.set?.('settings.messageTimeoutMs', timeoutMs, { source: 'settings', kind: 'confirmed', confidence: 1 });
    return timeoutMs;
  }

  function setText(selector, value) {
    const item = $(selector);
    if (item) item.textContent = value;
  }

  function clearMessageTimer() {
    if (!messageTimer) return;
    clearTimeout(messageTimer);
    messageTimer = null;
  }

  function hideWander() {
    clearMessageTimer();
    const card = $('#wander-card');
    if (card) card.hidden = true;
  }

  function showWander(title, message, options = {}) {
    const card = $('#wander-card');
    clearMessageTimer();
    if (card) card.hidden = false;
    setText('#wander-title', title);
    setText('#wander-message', message);

    if (options.persistent === true) return;
    const timeoutMs = Number.isFinite(Number(options.timeoutMs))
      ? Math.max(0, Number(options.timeoutMs))
      : getMessageTimeoutMs();
    if (timeoutMs > 0) messageTimer = setTimeout(hideWander, timeoutMs);
  }

  function syncRuntimeMetrics() {
    const context = window.WanderContext;
    const status = context?.value('context.status', 'Preparando contexto');
    const speed = Number(context?.value('motion.speedKmh'));
    const heading = Number(context?.value('motion.heading'));
    const moving = context?.value('motion.status') === 'moving';

    setText('#metric-status', status || 'Preparando contexto');
    setText('#metric-speed', Number.isFinite(speed) ? speed.toFixed(1) + ' km/h' : '—');
    setText('#metric-heading', moving && Number.isFinite(heading) ? Math.round(heading) + '°' : '—');
  }

  function setLocationPending() {
    syncRuntimeMetrics();
  }

  function updateClock() {
    const value = window.WanderContext?.value('time.now') || new Date().toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    setText('#context-time', value);
  }

  const messages = {
    details: ['Wander', 'Soy tu compañero de viaje. El estado principal resume qué está pasando ahora en la sesión y puede combinar movimiento, actividad, lugar e intención.'],
    route: ['Ruta', 'La ruta viva vuelve después de consolidar ubicación y contexto. Primero necesito saber dónde estás y qué está pasando alrededor.'],
    food: ['Comer', 'La recomendación gastronómica usará el contexto: hora, ubicación, clima, actividad e intereses. Todavía no está conectada a lugares reales.'],
    ask: ['Preguntar', 'La IA contextual será la próxima capa. Va a leer WanderContext en vez de datos sueltos de la pantalla.'],
  };

  $('#close-wander')?.addEventListener('click', hideWander);

  document.querySelectorAll('[data-message]').forEach((button) => {
    button.addEventListener('click', () => {
      const payload = messages[button.dataset.message] || ['Wander', 'Función preparada para la siguiente etapa.'];
      showWander(payload[0], payload[1]);
    });
  });

  window.WanderContext?.subscribe((key) => {
    if (key === 'context.status' || key.startsWith('motion.')) syncRuntimeMetrics();
    if (key === 'time.now') updateClock();
  });

  window.WanderContext?.set?.('settings.messageTimeoutMs', getMessageTimeoutMs(), { source: 'settings', kind: 'confirmed', confidence: 1 });
  syncRuntimeMetrics();
  updateClock();

  window.WanderUI = {
    setText,
    showWander,
    hideWander,
    syncRuntimeMetrics,
    setLocationPending,
    getMessageTimeoutMs,
    setMessageTimeoutMs,
    defaultMessageTimeoutMs: DEFAULT_MESSAGE_TIMEOUT_MS,
  };
})();