(() => {
  if (window.WanderBitacoraTreeMode) return;

  // UnifiedTravelLog is the single Bitácora renderer. The visible hierarchy is
  // Día → Episodio → Elementos. Tracks, conversations, decisions, arrivals and
  // notes are chronological elements of the episode instead of a third nested
  // activity layer.
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
  window.addEventListener('wander:track-cloud-sync', () => setTimeout(mount, 0));

  const observer = new MutationObserver(() => {
    const screen = document.querySelector('[data-app-screen="travel-log"]');
    if (screen && !screen.hidden) mount();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.WanderBitacoraTreeMode = Object.freeze({ mount });
  setTimeout(mount, 500);
})();