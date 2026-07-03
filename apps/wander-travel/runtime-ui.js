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

  function setMotion(moving, speedMps, heading) {
    const kmh = Number(speedMps || 0) * 3.6;
    const status = moving ? (kmh < 8 ? 'Caminando' : kmh < 25 ? 'Bicicleta' : 'En movimiento') : 'Detenido';
    setText('#metric-status', status);
    setText('#metric-speed', kmh.toFixed(1) + ' km/h');
    setText('#metric-heading', moving && Number.isFinite(heading) ? Math.round(heading) + '°' : '—');
    window.WanderContext?.setMotion({ status, speedKmh: kmh, heading: Number.isFinite(heading) ? heading : null, source: 'ui' });
  }

  function updateClock() {
    const value = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    setText('#context-time', value);
    window.WanderContext?.updateTime();
  }

  const messages = {
    details: ['Wander', 'Soy tu compañero de viaje. Ahora ya tengo un motor central de contexto para saber qué datos están vigentes, pendientes o desactualizados.'],
    route: ['Ruta', 'La ruta viva vuelve después de consolidar ubicación y contexto. Primero necesito saber dónde estás y qué está pasando alrededor.'],
    food: ['Comer', 'La recomendación gastronómica usará el contexto: hora, ubicación, clima, ritmo e intereses. Todavía no está conectada a lugares reales.'],
    ask: ['Preguntar', 'La IA contextual será la próxima capa. Va a leer WanderContext en vez de datos sueltos de la pantalla.'],
  };

  $('#wander-button')?.addEventListener('click', () => showWander('Bienvenido', 'WanderContext ya está activo. Abrí 🧠 Contexto para ver qué sabe Wander y qué datos todavía están pendientes.'));
  $('#close-wander')?.addEventListener('click', () => { const card = $('#wander-card'); if (card) card.hidden = true; });

  document.querySelectorAll('[data-message]').forEach((button) => {
    button.addEventListener('click', () => {
      const payload = messages[button.dataset.message] || ['Wander', 'Función preparada para la siguiente etapa.'];
      showWander(payload[0], payload[1]);
    });
  });

  setMotion(false, 0, null);
  updateClock();
  setInterval(updateClock, 30000);
  window.WanderUI = { setText, showWander, setMotion };
})();
