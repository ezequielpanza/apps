(() => {
  function mountDashboard() {
    window.WanderContextDashboard?.restore?.();
  }

  window.addEventListener('wander:app-ready', mountDashboard, { once: true });
  if (window.WanderAppReady) mountDashboard();
})();
