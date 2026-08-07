(() => {
  if (window.WanderBitacoraTreeMode) return;

  let scheduled = false;
  let refreshTimer = null;

  function activeTab() {
    return document.querySelector('[data-app-screen="travel-log"] .travel-log-tab.is-active')?.dataset?.logTab || 'today';
  }

  function todayLabel() {
    return new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function ensureHost() {
    const screen = document.querySelector('[data-app-screen="travel-log"]');
    const content = screen?.querySelector('#travel-log-content');
    if (!screen || !content) return null;

    let host = screen.querySelector('#travel-log-tree-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'travel-log-tree-host';
      host.className = 'travel-log-section travel-log-tree-host';
      content.after(host);
    }
    return { screen, content, host };
  }

  function applyFlatVisibility(content, tab) {
    content.hidden = tab === 'history';
    if (tab !== 'today') return;
    content.querySelectorAll('.travel-log-day').forEach((block) => {
      const heading = block.querySelector('h3')?.textContent?.trim() || '';
      block.hidden = /Lo que pasó hoy/i.test(heading);
    });
    content.querySelectorAll('.travel-log-empty').forEach((block) => { block.hidden = true; });
  }

  async function mount() {
    scheduled = false;
    const shell = ensureHost();
    if (!shell) return false;

    const tab = activeTab();
    const treeMode = tab === 'today' || tab === 'history';
    shell.host.hidden = !treeMode;

    if (!treeMode) {
      shell.content.hidden = false;
      shell.content.querySelectorAll('[hidden]').forEach((node) => {
        if (node.classList.contains('travel-log-day') || node.classList.contains('travel-log-empty')) node.hidden = false;
      });
      return true;
    }

    applyFlatVisibility(shell.content, tab);

    const trackList = document.querySelector('#track-list');
    if (!trackList) return false;
    if (trackList.parentElement !== shell.host) shell.host.appendChild(trackList);
    trackList.dataset.bitacoraTree = 'true';
    shell.host.dataset.treeScope = tab;

    await window.WanderTrackTreeUI?.render?.();

    const dayNodes = [...trackList.querySelectorAll('.track-folder-tree > details')];
    if (tab === 'today') {
      const expected = todayLabel().toLocaleLowerCase('es-AR');
      dayNodes.forEach((node) => {
        const title = node.querySelector(':scope > summary .track-tree-title')?.textContent?.trim().toLocaleLowerCase('es-AR') || '';
        node.hidden = title !== expected;
      });
    } else {
      dayNodes.forEach((node) => { node.hidden = false; });
    }
    return true;
  }

  function scheduleMount() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => requestAnimationFrame(() => mount().catch(() => {})));
  }

  window.addEventListener('wander:screen-change', (event) => {
    if (event.detail?.to === 'travel-log') scheduleMount();
  });
  window.addEventListener('wander:sessions-changed', scheduleMount);
  window.addEventListener('wander:track-finalized', scheduleMount);
  window.addEventListener('wander:track-tree-changed', scheduleMount);
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-log-tab]')) setTimeout(scheduleMount, 0);
  });

  refreshTimer = setInterval(() => {
    const screen = document.querySelector('[data-app-screen="travel-log"]');
    if (screen && !screen.hidden) scheduleMount();
  }, 5000);

  window.WanderBitacoraTreeMode = Object.freeze({
    mount,
    scheduleMount,
    destroy() { if (refreshTimer) clearInterval(refreshTimer); refreshTimer = null; },
  });
  setTimeout(scheduleMount, 800);
})();