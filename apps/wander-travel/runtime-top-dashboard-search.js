(() => {
  const header = document.querySelector('#wander-top-query-bar');
  const dashboard = document.querySelector('#context-dashboard');
  const search = document.querySelector('.wander-search-pill');
  if (!header || !dashboard || !search) return;

  header.classList.add('wander-top-status-bar');
  dashboard.classList.add('wander-dashboard-in-header');
  search.classList.add('wander-bottom-search');
  search.hidden = true;

  function ensureDashboardPlacement() {
    if (dashboard.parentElement !== header) header.insertBefore(dashboard, search);
    dashboard.classList.add('wander-dashboard-in-header');
    dashboard.style.removeProperty('left');
    dashboard.style.removeProperty('right');
    dashboard.style.removeProperty('top');
    dashboard.style.removeProperty('bottom');
    dashboard.style.removeProperty('width');
    dashboard.style.removeProperty('max-width');
  }

  ensureDashboardPlacement();

  let close = search.querySelector('.wander-bottom-search-close');
  if (!close) {
    close = document.createElement('button');
    close.type = 'button';
    close.className = 'wander-bottom-search-close';
    close.setAttribute('aria-label', 'Cerrar búsqueda');
    close.textContent = '×';
    search.insertBefore(close, search.firstChild);
  }

  function openSearch() {
    search.hidden = false;
    requestAnimationFrame(() => document.querySelector('#wander-query-input')?.focus());
  }

  function closeSearch() {
    search.hidden = true;
    document.querySelector('#wander-query-input')?.blur();
  }

  close.addEventListener('click', closeSearch);
  document.querySelector('#wander-search-button')?.addEventListener('click', () => setTimeout(closeSearch, 0));
  document.querySelector('#wander-query-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') setTimeout(closeSearch, 0);
    if (event.key === 'Escape') closeSearch();
  });

  function attachButton() {
    const actions = document.querySelector('.wander-standard-map-actions');
    if (!actions) return false;
    let button = actions.querySelector('.wander-map-search-action');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'wander-map-action wander-map-search-action';
      button.setAttribute('aria-label', 'Preguntar a Wander');
      button.title = 'Preguntar a Wander';
      button.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="wander-icons.svg#search"></use></svg>';
      button.addEventListener('click', openSearch);
      actions.appendChild(button);
    }
    return true;
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    ensureDashboardPlacement();
    if (attachButton() && tries > 20) clearInterval(timer);
    if (tries > 160) clearInterval(timer);
  }, 250);

  const observer = new MutationObserver(() => requestAnimationFrame(ensureDashboardPlacement));
  observer.observe(document.querySelector('.wander-app'), { childList: true, subtree: true });
  window.addEventListener('pageshow', ensureDashboardPlacement);
  window.addEventListener('wander:dashboard-restored', ensureDashboardPlacement);

  window.WanderTopDashboardSearch = { openSearch, closeSearch, ensureDashboardPlacement };
})();