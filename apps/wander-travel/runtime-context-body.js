(() => {
  const body = window.WanderBody;
  const context = window.WanderContext;
  if (!body || !context) return;

  function syncReal(snapshot) {
    const real = snapshot.location?.real || {};
    if (real.status === 'available') context.setRealLocation(real);
    else context.setRealLocationStatus(real.status || 'pending', { source: real.source || 'body' });
  }

  function syncOverride(snapshot) {
    const override = snapshot.location?.override || {};
    if (override.enabled === true && override.status === 'available') context.setLocationOverride(override);
    else context.clearLocationOverride();
  }

  function syncAll(snapshot = body.getSnapshot()) {
    syncReal(snapshot);
    syncOverride(snapshot);
  }

  body.subscribe((channel, snapshot) => {
    if (channel === 'location.real') syncReal(snapshot);
    if (channel === 'location.override') syncOverride(snapshot);
  });

  window.WanderContextBody = { syncAll };
  syncAll();
})();