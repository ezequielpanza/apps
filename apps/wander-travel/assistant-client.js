(() => {
  const askButton = document.querySelector('#ask-wander-button');
  const panel = document.querySelector('.companion-panel');
  const title = document.querySelector('#wander-title');
  const message = document.querySelector('#wander-message');
  const showCompanion = document.querySelector('#show-companion');

  if (!askButton || !panel || !title || !message) return;

  function show(titleText, messageText) {
    title.textContent = titleText;
    message.textContent = messageText;
    panel.classList.remove('is-hidden');
    showCompanion?.classList.remove('has-unread');
  }

  function currentContext() {
    const point = typeof marker !== 'undefined' ? marker.getLatLng() : null;
    const interests = document.querySelector('#interest-input')?.value
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) || [];

    return {
      location: point ? { lat: point.lat, lng: point.lng } : null,
      mode: document.querySelector('.status-rail .metric:nth-child(1) strong')?.textContent || null,
      speed: document.querySelector('.status-rail .metric:nth-child(2) strong')?.textContent || null,
      interests,
      local_time: new Date().toISOString(),
      page_title: document.title,
    };
  }

  askButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const question = window.prompt('Qué querés preguntarle a Wander?');
    if (!question?.trim()) return;

    askButton.disabled = true;
    show('Pensando...', 'Wander está leyendo el contexto actual del viaje.');

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: question.trim(),
          context: currentContext(),
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'No se pudo consultar a Wander.');
      }

      show('Wander', data.message);
    } catch (error) {
      show('Wander no está disponible', error?.message || 'La conexión con el asistente falló.');
    } finally {
      askButton.disabled = false;
    }
  }, true);
})();
