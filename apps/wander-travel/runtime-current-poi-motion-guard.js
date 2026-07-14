(() => {
  const context = window.WanderContext;
  if (!context) return;

  const MOVING_SPEED_KMH = 0.8;
  let enforcing = false;

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function isMoving() {
    const speed = finite(context.value?.('motion.speedKmh'));
    return context.value?.('motion.status') === 'moving' || (speed !== null && speed > MOVING_SPEED_KMH);
  }

  function enforce() {
    if (enforcing || !isMoving()) return false;
    const current = context.value?.('currentPOI.current');
    const value = context.value?.('currentPOI.value');
    if (!current && !value && context.value?.('currentPOI.status') === 'moving') return false;

    enforcing = true;
    try {
      context.remove?.('currentPOI.current');
      context.remove?.('currentPOI.value');
      context.remove?.('currentPOI.distanceM');
      context.set?.('currentPOI.status', 'moving', {
        source: 'current-poi-motion-guard',
        kind: 'derived',
        ttlMs: 60000,
        confidence: 1,
      });
      return true;
    } finally {
      enforcing = false;
    }
  }

  function schedule() {
    queueMicrotask(enforce);
  }

  context.subscribe?.((key) => {
    if (
      key === 'motion.status' ||
      key === 'motion.speedKmh' ||
      key === 'currentPOI.current' ||
      key === 'currentPOI.value' ||
      key === 'container.current' ||
      key === 'location.effective' ||
      key.startsWith('location.effective.')
    ) schedule();
  });

  window.WanderCurrentPOIMotionGuard = Object.freeze({
    enforce,
    isMoving,
    thresholdKmh: MOVING_SPEED_KMH,
  });

  enforce();
})();