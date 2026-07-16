(() => {
  if (window.WanderDashboardStatusLabels) return;

  const context = window.WanderContext;
  if (!context) return;

  const ACTIVITY_LABELS = Object.freeze({
    moving: 'En movimiento',
    paused: 'En pausa',
    stationary: 'En pausa',
    pending: 'Preparando contexto',
  });

  const MOTION_LABELS = Object.freeze({
    moving: 'En movimiento',
    stationary: 'Detenido',
    pending: 'Preparando contexto',
  });

  function translated(value, labels, fallback) {
    const key = String(value ?? '').trim().toLowerCase();
    return labels[key] || (key ? String(value) : fallback);
  }

  function render() {
    const activity = document.querySelector('#metric-activity');
    if (activity) activity.textContent = translated(context.value?.('context.activity'), ACTIVITY_LABELS, 'Preparando contexto');

    const motion = document.querySelector('#metric-motion-status');
    if (motion) motion.textContent = translated(context.value?.('motion.status'), MOTION_LABELS, 'Preparando contexto');
  }

  context.subscribe?.((key) => {
    if (key === 'context.activity' || key === 'motion.status' || key === 'context.status') render();
  });

  const observer = new MutationObserver(render);
  const dashboard = document.querySelector('#context-dashboard');
  if (dashboard) observer.observe(dashboard, { childList: true, subtree: true });

  render();
  window.WanderDashboardStatusLabels = Object.freeze({ render });
})();