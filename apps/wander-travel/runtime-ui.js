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

  function categoryText(item) {
    return (item?.categories || [])
      .map((category) => `${category.id || ''} ${category.label || ''}`.toLowerCase())
      .join(' ');
  }

  function distanceLabel(distanceM) {
    const distance = Math.max(0, Number(distanceM) || 0);
    if (distance < 1000) return `${Math.max(10, Math.round(distance / 10) * 10)} m`;
    return `${(distance / 1000).toFixed(distance < 3000 ? 1 : 0)} km`;
  }

  function showNearbyFood() {
    const current = window.WanderContext?.value('nearby.current');
    const food = (current?.items || [])
      .filter((item) => /restaurant|cafe|fast_food|bar|pub|food_court|ice_cream/.test(categoryText(item)))
      .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))[0];

    if (!food) {
      window.WanderProviders?.nearby?.refresh?.(true);
      showWander('Comer', 'Todavía no tengo un lugar gastronómico confiable cerca. Estoy actualizando la búsqueda alrededor tuyo.');
      return;
    }

    const sourceCount = food.sources?.length || 1;
    const sourceText = sourceCount > 1 ? ` Coincide en ${sourceCount} fuentes.` : '';
    showWander(food.name, `Está a unos ${distanceLabel(food.distanceM)} de tu ubicación.${sourceText}`);
  }

  const messages = {
    details: ['Wander', 'Soy tu compañero de viaje. El estado principal resume qué está pasando ahora en la sesión y puede combinar movimiento, actividad, lugar e intención.'],
    route: ['Ruta', 'La ruta viva vuelve después de consolidar ubicación y contexto. Primero necesito saber dónde estás y qué está pasando alrededor.'],
    ask: ['Preguntar', 'La IA contextual será la próxima capa. Va a leer WanderContext en vez de datos sueltos de la pantalla.'],
  };

  $('#close-wander')?.addEventListener('click', () => {
    const card = $('#wander-card');
    if (card) card.hidden = true;
  });

  document.querySelectorAll('[data-message]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.message === 'food') {
        showNearbyFood();
        return;
      }
      const payload = messages[button.dataset.message] || ['Wander', 'Función preparada para la siguiente etapa.'];
      showWander(payload[0], payload[1]);
    });
  });

  window.WanderContext?.subscribe((key) => {
    if (key === 'context.status' || key.startsWith('motion.')) syncRuntimeMetrics();
    if (key === 'time.now') updateClock();
  });

  syncRuntimeMetrics();
  updateClock();

  window.WanderUI = {
    setText,
    showWander,
    showNearbyFood,
    syncRuntimeMetrics,
    setLocationPending,
  };
})();
