(() => {
  const $ = (selector) => document.querySelector(selector);
  const MESSAGE_TIMEOUT_KEY = 'wander.settings.messageTimeoutMs';
  const DEFAULT_MESSAGE_TIMEOUT_MS = 5000;
  let messageTimer = null;
  let toastTimer = null;
  let toast = null;

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

  function ensureToast() {
    if (toast?.isConnected) return toast;
    toast = document.createElement('div');
    toast.id = 'wander-toast';
    toast.className = 'wander-toast';
    toast.hidden = true;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = '<strong></strong><span></span>';
    document.body.appendChild(toast);
    return toast;
  }

  function hideToast() {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    if (toast) toast.hidden = true;
  }

  function showToast(title, message = '', options = {}) {
    const item = ensureToast();
    if (toastTimer) clearTimeout(toastTimer);
    item.querySelector('strong').textContent = title || 'Wander';
    const copy = item.querySelector('span');
    copy.textContent = message || '';
    copy.hidden = !message;
    item.hidden = false;
    const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(500, Number(options.timeoutMs)) : 2400;
    toastTimer = setTimeout(hideToast, timeoutMs);
  }

  function showWander(title, message, options = {}) {
    const card = $('#wander-card');
    clearMessageTimer();
    if (document.body.classList.contains('poi-editor-open')) return showToast(title, message, options);
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

  window.addEventListener('wander:screen-will-change', hideWander);
  window.addEventListener('wander:personal-poi-editor-open', hideWander);

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
    showToast,
    hideToast,
    syncRuntimeMetrics,
    setLocationPending,
    getMessageTimeoutMs,
    setMessageTimeoutMs,
    defaultMessageTimeoutMs: DEFAULT_MESSAGE_TIMEOUT_MS,
  };
})();