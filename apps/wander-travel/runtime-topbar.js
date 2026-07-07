(() => {
  const $ = (selector) => document.querySelector(selector);

  function currentQuestion() {
    return ($('#wander-query-input')?.value || '').trim();
  }

  function rememberUserMessage(message, intent) {
    window.WanderContext?.set('user.intent', intent, {
      source: 'topbar',
      ttlMs: 600000,
      confidence: 0.95,
    });
    window.WanderContext?.set('user.lastQuestion', message, {
      source: 'topbar',
      ttlMs: 600000,
      confidence: 1,
    });
  }

  function askWander() {
    const input = $('#wander-query-input');
    const question = currentQuestion();

    if (!question) {
      input?.focus();
      window.WanderContext?.set('user.intent', 'Preguntar a Wander', {
        source: 'topbar',
        ttlMs: 600000,
        confidence: 0.75,
      });
      window.WanderUI?.showWander(
        'Preguntar a Wander',
        'Escribí una pregunta o contame qué querés hacer. Wander va a usar el contexto del viaje como referencia.'
      );
      return;
    }

    const learned = window.WanderEngine?.handleUserMessage?.(question);
    if (learned?.handled) {
      rememberUserMessage(question, 'Corregir memoria de Wander');
      window.WanderUI?.showWander('Entendido', learned.message);
      if (input) input.value = '';
      return;
    }

    rememberUserMessage(question, 'Preguntar a Wander');
    window.WanderUI?.showWander(
      'Pregunta recibida',
      question + ' — La entrada ya funciona. El próximo paso es conectar esta pregunta con la IA contextual de Wander.'
    );

    if (input) input.value = '';
  }

  $('#wander-search-button')?.addEventListener('click', askWander);
  $('#wander-query-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      askWander();
    }
    if (event.key === 'Escape') event.target.blur();
  });

  window.WanderTopbar = { ask: askWander };
})();
