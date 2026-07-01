(() => {
  if (window.__wanderContextStatusLabel) return;
  window.__wanderContextStatusLabel = true;

  let lastStatus = 'Detenido';

  function metricByLabel(label) {
    return [...document.querySelectorAll('.status-rail .metric')].find((metric) => {
      const text = metric.querySelector('span')?.textContent?.trim().toLowerCase();
      return text === label.toLowerCase();
    });
  }

  function firstMetric() {
    return document.querySelector('.status-rail .metric');
  }

  function speedKmh(ctx) {
    return (Number(ctx?.speed_mps) || 0) * 3.6;
  }

  function statusFromContext(ctx = {}) {
    const kmh = speedKmh(ctx);
    const knots = Number(ctx.speed_knots) || 0;
    const moving = ctx.moving === true || kmh > 1.2;

    if (ctx.likely_boat || ctx.transport_mode === 'boat' || ctx.on_water_hint) {
      if (!moving || knots < 0.8) return 'Fondeado';
      return 'Navegando';
    }

    if (!moving || kmh < 1.2) return 'Detenido';
    if (kmh < 7) return 'Caminando';
    if (kmh < 18) return 'En bicicleta';
    if (kmh < 28) return 'En monopatín';
    return 'Conduciendo';
  }

  function applyStatus(status) {
    const metric = metricByLabel('Modo') || metricByLabel('Estado') || firstMetric();
    if (!metric) return;
    const label = metric.querySelector('span');
    const value = metric.querySelector('strong');
    if (label) label.textContent = 'Estado';
    if (value) value.textContent = status;
  }

  function update(ctx) {
    const status = statusFromContext(ctx || window.wanderMotionContext || {});
    lastStatus = status;
    applyStatus(status);
    window.WanderContextStatus = {
      status,
      updated_at: new Date().toISOString(),
      source: 'motion_context'
    };
    document.dispatchEvent(new CustomEvent('wander:context-status', { detail: window.WanderContextStatus }));
  }

  document.addEventListener('wander:motion-context', (event) => update(event.detail));

  applyStatus(lastStatus);
  window.setInterval(() => {
    applyStatus(lastStatus);
    if (window.wanderMotionContext) update(window.wanderMotionContext);
  }, 1000);
})();