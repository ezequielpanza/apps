(() => {
  const $ = (selector) => document.querySelector(selector);

  function iconSearch() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="M16 16l5 5"></path></svg>';
  }

  function createTopBar() {
    if ($('#wander-top-query-bar')) return;
    const stage = $('.map-stage');
    if (!stage) return;

    const bar = document.createElement('header');
    bar.id = 'wander-top-query-bar';
    bar.className = 'wander-top-query-bar';
    bar.setAttribute('aria-label', 'Consulta Wander');

    const menuButton = $('#main-menu-button');
    if (menuButton) {
      menuButton.classList.add('top-bar-icon', 'modern-menu-button');
      menuButton.innerHTML = '<span></span><span></span><span></span>';
      bar.appendChild(menuButton);
    }

    const query = document.createElement('button');
    query.id = 'wander-query-button';
    query.className = 'wander-query-button';
    query.type = 'button';
    query.textContent = 'Preguntar a Wander';
    query.setAttribute('aria-label', 'Preguntar a Wander');
    bar.appendChild(query);

    const search = document.createElement('button');
    search.id = 'wander-search-button';
    search.className = 'top-bar-icon wander-search-button';
    search.type = 'button';
    search.setAttribute('aria-label', 'Explorar con Wander');
    search.innerHTML = iconSearch();
    bar.appendChild(search);

    stage.appendChild(bar);
  }

  function showQueryMessage() {
    window.WanderContext?.set('user.intent', 'Preguntar a Wander', { source: 'topbar', ttlMs: 600000, confidence: 0.8 });
    window.WanderUI?.showWander('Preguntar a Wander', 'Todavía no abrí el chat de IA en esta pantalla. Ya puedo usar WanderContext como base para la próxima etapa.');
  }

  function showExploreMessage() {
    window.WanderContext?.set('user.intent', 'Explorar cerca', { source: 'topbar', ttlMs: 600000, confidence: 0.8 });
    window.WanderUI?.showWander('Explorar con Wander', 'El próximo paso será conectar ubicación real y contexto de ciudad para sugerir qué descubrir cerca.');
  }

  function bind() {
    createTopBar();
    $('#wander-query-button')?.addEventListener('click', showQueryMessage);
    $('#wander-search-button')?.addEventListener('click', showExploreMessage);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
