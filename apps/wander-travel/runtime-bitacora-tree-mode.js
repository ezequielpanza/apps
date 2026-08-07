(() => {
  if (window.WanderBitacoraTreeMode) return;

  let observer = null;
  let scheduled = false;

  function activeTab() {
    return document.querySelector('[data-app-screen="travel-log"] .travel-log-tab.is-active')?.dataset?.logTab || 'today';
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
      content.before(host);
    }
    return { screen, content, host };
  }

  function mount() {
    scheduled = false;
    const shell = ensureHost();
    if (!shell) return false;

    const tab = activeTab();
    const treeMode = tab === 'today' || tab === 'history';
    shell.host.hidden = !treeMode;
    shell.content.hidden = treeMode;

    if (!treeMode) return true;

    const trackList = document.querySelector('#track-list');
    if (!trackList) return false;
    if (trackList.parentElement !== shell.host) shell.host.appendChild(trackList);

    trackList.dataset.bitacoraTree = 'true';
    shell.host.dataset.treeScope = tab === 'today' ? 'today' : 'history';
    window.WanderTrackTreeUI?.render?.();

    // The tree renderer orders days newest first. In the Today tab only expose
    // the newest day node; History keeps the complete hierarchy.
    setTimeout(() => {
      const dayNodes = [...trackList.querySelectorAll('.track-folder-tree > details')];
      dayNodes.forEach((node, index) => { node.hidden = tab === 'today' && index > 0; });
    }, 0);
    return true;
  }

  function scheduleMount() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => requestAnimationFrame(mount));
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

  observer = new MutationObserver(() => {
    const screen = document.querySelector('[data-app-screen="travel-log"]');
    if (screen && !screen.hidden) scheduleMount();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.WanderBitacoraTreeMode = Object.freeze({ mount, scheduleMount });
  setTimeout(scheduleMount, 800);
})();