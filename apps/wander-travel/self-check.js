(() => {
  window.WanderSelfCheck = {
    run() {
      return {
        map: typeof map !== 'undefined',
        marker: typeof marker !== 'undefined',
        locate: Boolean(document.querySelector('#locate-button')),
        track: Boolean(document.querySelector('#track-route-button')),
        settings: Boolean(document.querySelector('#wander-settings-gear')),
        context: Boolean(window.WanderContextEngine),
        dragFix: Boolean(window.__wanderRotatedMapDragFix)
      };
    }
  };
})();