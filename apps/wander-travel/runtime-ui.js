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
  }

  function updateClock() {
    setText('#context-time', new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
  }

  const messages = {
    details: ['Wander', 'Soy tu compañero de viaje. Primero dejamos estable la base: mapa, menú, paneles, recorridos y simulador. Después reactivamos la guía contextual.'],
    route: ['Ruta', 'La ruta viva vuelve en una próxima etapa. Antes estamos asegurando que la base funcione sin parches.'],
    food: ['Comer', 'La recomendación gastronómica queda reservada para la capa de guía turística y contexto real.'],
    ask: ['Preguntar', 'La IA contextual existe como módulo, pero todavía no está reactivada en esta pantalla estable.'],
  };

  $('#wander-button')?.addEventListener('click', () => showWander('Bienvenido', 'Wander está listo para acompañar el viaje. Esta versión estabiliza la base antes de reactivar nuevas funciones.'));
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
