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
    const status = moving ? (kmh < 8 ? 'Caminando' : kmh < 25 ? 'Bicicleta' : 'Conduciendo') : 'Detenido';
    setText('#metric-status', status);
    setText('#metric-speed', kmh.toFixed(1) + ' km/h');
    setText('#metric-heading', moving && Number.isFinite(heading) ? Math.round(heading) + '°' : '—');
  }
  function updateClock() {
    setText('#context-time', new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
  }
  $('#wander-button')?.addEventListener('click', () => showWander('Listo', 'Wander listo.'));
  $('#close-wander')?.addEventListener('click', () => { const card = $('#wander-card'); if (card) card.hidden = true; });
  document.querySelectorAll('[data-message]').forEach((button) => {
    button.addEventListener('click', () => showWander('Wander', 'Función preparada para la siguiente etapa.'));
  });
  setMotion(false, 0, null);
  updateClock();
  setInterval(updateClock, 30000);
  window.WanderUI = { setText, showWander, setMotion };
})();
