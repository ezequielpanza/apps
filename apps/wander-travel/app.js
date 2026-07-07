(() => {
  const MAP_RUNTIME_VERSION = '20260707-02';

  document.write('<script src="runtime-map-core.js?v=' + MAP_RUNTIME_VERSION + '"><\/script>');
  document.write('<script src="runtime-map-position.js?v=' + MAP_RUNTIME_VERSION + '"><\/script>');
  document.write('<script src="runtime-map-controls.js?v=' + MAP_RUNTIME_VERSION + '"><\/script>');
  document.write('<script src="runtime-map.js?v=' + MAP_RUNTIME_VERSION + '"><\/script>');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
})();
