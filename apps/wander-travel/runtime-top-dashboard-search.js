(() => {
  const header = document.querySelector('#wander-top-query-bar');
  const dashboard = document.querySelector('#context-dashboard');
  const search = document.querySelector('.wander-search-pill');
  if (!header || !dashboard || !search) return;

  header.classList.add('wander-top-status-bar');
  header.insertBefore(dashboard, search);
  search.classList.add('wander-bottom-search');
  search.hidden = true;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'wander-bottom-search-close';
  close.setAttribute('aria-label', 'Cerrar búsqueda');
  close.textContent = '×';
  search.insertBefore(close, search.firstChild);

  function openSearch() {
    search.hidden = false;
    setTimeout(() => document.querySelector('#wander-query-input')?.focus(), 0);
  }

  function closeSearch() {
    search.hidden = true;
  }

  close.addEventListener('click', closeSearch);

  function attachButton() {
    const actions = document.querySelector('.wander-standard-map-actions');
    if (!actions || actions.querySelector('.wander-map-search-action')) return false;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wander-map-action wander-map-search-action';
    button.setAttribute('aria-label', 'Preguntar a Wander');
    button.title = 'Preguntar a Wander';
    button.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="wander-icons.svg#search"></use></svg>';
    button.addEventListener('click', openSearch);
    actions.appendChild(button);
    return true;
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (attachButton() || tries > 120) clearInterval(timer);
  }, 100);

  window.WanderTopDashboardSearch = { openSearch, closeSearch };
})();