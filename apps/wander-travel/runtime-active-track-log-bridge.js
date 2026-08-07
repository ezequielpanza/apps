(() => {
  if (window.WanderActiveTrackLogBridge) return;

  // The unified Bitácora owns every visual representation of active and closed tracks.
  // This bridge now only requests a refresh when live recording changes; it must never
  // inject a second "Track actual" tree beside the canonical episode hierarchy.
  function refresh() {
    window.WanderUnifiedTravelLog?.render?.();
  }

  window.addEventListener('wander:sessions-changed', refresh);
  window.addEventListener('wander:raw-location-sample', refresh);
  window.addEventListener('wander:track-finalized', refresh);
  window.addEventListener('wander:screen-change', (event) => {
    if (event.detail?.to === 'travel-log') setTimeout(refresh, 120);
  });

  window.WanderActiveTrackLogBridge = Object.freeze({
    mount: refresh,
    refresh,
  });
})();
