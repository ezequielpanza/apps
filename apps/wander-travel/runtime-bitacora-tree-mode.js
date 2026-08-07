(() => {
  if (window.WanderBitacoraTreeMode) return;

  // UnifiedTravelLog is now the single renderer for Bitácora. Older versions
  // moved the Recorridos #track-list into Bitácora and hid #travel-log-content;
  // that competed with the unified Day → Episode → Activity → Track renderer
  // and could leave the screen completely blank.
  function mount() {
    const screen = document.querySelector('[data-app-screen="travel-log"]');
    const content = screen?.querySelector('#travel-log-content');
    if (!screen || !content) return false;
    content.hidden = false;
    screen.querySelector('#travel-log-tree-host')?.remove();
    window.WanderUnifiedTravelLog?.render?.();
    return true;
  }

  window.addEventListener('wander:screen-change', (event) => {
    if (event.detail?.to === 'travel-log') setTimeout(mount, 0);
  });
  window.addEventListener('wander:sessions-changed', () => setTimeout(mount, 0));
  window.addEventListener('wander:track-finalized', () => setTimeout(mount, 0));

  const observer = new MutationObserver(() => {
    const screen = document.querySelector('[data-app-screen="travel-log"]');
    if (screen && !screen.hidden) mount();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.WanderBitacoraTreeMode = Object.freeze({ mount });
  setTimeout(mount, 500);
})();
