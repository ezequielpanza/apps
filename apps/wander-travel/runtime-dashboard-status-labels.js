(() => {
  if (window.WanderDashboardStatusLabels) return;

  function render() {
    window.WanderContextDashboard?.render?.();
  }

  window.WanderDashboardStatusLabels = Object.freeze({ render });
})();