(() => {
  const context = window.WanderContext;
  if (!context || window.WanderLocationQualityUI) return;

  const SOURCE_LABELS = Object.freeze({
    gps: 'GPS',
    geolocation: 'GPS',
    network: 'Red',
    fused: 'Combinada',
    passive: 'Pasiva',
    simulator: 'Simulador',
  });

  function qualitySnapshot() {
    const accuracy = Number(context.value('location.effective.accuracy'));
    const provider = String(context.value('location.effective.provider') || context.value('location.effective.source') || '').trim().toLowerCase();
    const permissionPrecision = String(context.value('location.effective.permissionPrecision') || '').trim().toLowerCase();
    return {
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      provider,
      permissionPrecision,
    };
  }

  function accuracyLabel(snapshot) {
    if (snapshot.accuracy === null) return '—';
    const rounded = snapshot.accuracy < 10 ? snapshot.accuracy.toFixed(1) : String(Math.round(snapshot.accuracy));
    if (snapshot.permissionPrecision === 'approximate') return `≈${rounded} m · aproximada`;
    if (snapshot.provider === 'network') return `${rounded} m · red`;
    return `${rounded} m`;
  }

  function renderNow() {
    const snapshot = qualitySnapshot();
    const accuracy = document.querySelector('#metric-accuracy');
    if (accuracy) {
      accuracy.textContent = accuracyLabel(snapshot);
      accuracy.title = snapshot.permissionPrecision === 'approximate'
        ? 'Android está entregando ubicación aproximada.'
        : snapshot.provider
          ? `Proveedor: ${SOURCE_LABELS[snapshot.provider] || snapshot.provider}`
          : '';
    }
    const source = document.querySelector('#metric-location-source');
    if (source && snapshot.provider) source.textContent = SOURCE_LABELS[snapshot.provider] || snapshot.provider;
  }

  function render() {
    queueMicrotask(renderNow);
  }

  context.subscribe((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) render();
  });
  window.addEventListener('wander:screen-change', render);
  document.addEventListener('DOMContentLoaded', render, { once: true });
  setTimeout(render, 0);

  window.WanderLocationQualityUI = Object.freeze({ render, snapshot: qualitySnapshot });
})();
