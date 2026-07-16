(() => {
  const header = document.querySelector('#wander-top-query-bar');
  const dashboard = document.querySelector('#context-dashboard');
  const search = document.querySelector('.wander-search-pill');
  const brand = document.querySelector('#main-menu-button');
  if (!header || !dashboard || !search || !brand) return;

  const FIELD_SPANS = Object.freeze({
    appVersion: 1,
    version: 1,
    summary: 2,
    coordinates: 2,
    speed: 1,
    heading: 1,
    time: 1,
    period: 1,
    dayPeriod: 1,
    mobility: 1,
    activity: 1,
    accuracy: 1,
    simulation: 1,
    nearby: 1,
    place: 2,
    currentPOI: 2,
    journey: 2,
    placeMemory: 3,
    lastSuggestion: 3,
  });

  header.classList.add('wander-top-status-bar');
  dashboard.classList.add('wander-dashboard-in-header');
  search.classList.add('wander-bottom-search');
  search.hidden = true;

  function visibleDashboardItems() {
    const configured = window.WanderContextDashboard?.getVisibleFields?.();
    if (Array.isArray(configured)) {
      return configured
        .map((fieldId) => dashboard.querySelector('[data-dashboard-field="' + fieldId + '"]'))
        .filter(Boolean);
    }
    return Array.from(dashboard.querySelectorAll('.status-item:not([hidden])'));
  }

  function rowsFor(items) {
    let rows = 0;
    let remaining = 0;
    for (const item of items) {
      const span = Math.min(3, Math.max(1, FIELD_SPANS[item.dataset.dashboardField] || 1));
      item.dataset.dashboardSpan = String(span);
      item.style.setProperty('--dashboard-span', String(span));

      if (remaining === 0) {
        rows += 1;
        remaining = 3;
      }
      if (span > remaining) {
        rows += 1;
        remaining = 3;
      }
      remaining -= span;
    }
    return Math.max(1, rows);
  }

  function updateDashboardRows() {
    const visibleItems = visibleDashboardItems();
    const visibleSet = new Set(visibleItems);

    dashboard.querySelectorAll('.status-item').forEach((item) => {
      const visible = visibleSet.has(item);
      item.hidden = !visible;
      if (!visible) {
        delete item.dataset.dashboardSpan;
        item.style.removeProperty('--dashboard-span');
      }
    });

    const rows = rowsFor(visibleItems);
    dashboard.dataset.dashboardRows = String(rows);
    header.dataset.dashboardRows = String(rows);
    dashboard.classList.toggle('wander-dashboard-expanded', rows > 1);
    header.classList.toggle('wander-top-status-bar-expanded', rows > 1);
    dashboard.style.setProperty('--dashboard-rows', String(rows));
    header.style.setProperty('--dashboard-rows', String(rows));
  }

  function ensureTopbarPlacement() {
    if (brand.parentElement !== header || header.firstElementChild !== brand) header.insertBefore(brand, header.firstElementChild);
    if (dashboard.parentElement !== header || dashboard.previousElementSibling !== brand) header.insertBefore(dashboard, search);

    brand.hidden = false;
    brand.removeAttribute('aria-hidden');
    brand.style.setProperty('display', 'grid', 'important');
    brand.style.setProperty('visibility', 'visible', 'important');
    brand.style.setProperty('opacity', '1', 'important');
    brand.style.setProperty('pointer-events', 'auto', 'important');

    dashboard.classList.add('wander-dashboard-in-header');
    ['left','right','top','bottom','width','max-width','height','min-height'].forEach((prop) => dashboard.style.removeProperty(prop));
    updateDashboardRows();
  }

  ensureTopbarPlacement();

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
    ensureTopbarPlacement();
    if (attachButton() && tries > 20) clearInterval(timer);
    if (tries > 160) clearInterval(timer);
  }, 250);

  const observer = new MutationObserver(() => requestAnimationFrame(updateDashboardRows));
  observer.observe(dashboard, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('pageshow', ensureTopbarPlacement);
  window.addEventListener('wander:dashboard-restored', ensureTopbarPlacement);
  window.addEventListener('wander:dashboard-layout-change', ensureTopbarPlacement);

  window.WanderTopDashboardSearch = { openSearch, closeSearch, ensureTopbarPlacement, updateDashboardRows };
})();