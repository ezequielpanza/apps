(() => {
  if (window.WanderPersonalPOISituation) return;

  const context = window.WanderContext;
  const personalPOIs = window.WanderPersonalPOIs;
  const situationEngine = window.WanderSituationEngine;
  if (!context || !personalPOIs?.ready || !situationEngine?.evaluate) return;

  let lastPersonalId = null;
  let queued = false;
  let applying = false;

  function personalCurrent() {
    return context.value?.('personalPOI.current') || null;
  }

  function isStationary() {
    return context.value?.('motion.status') === 'stationary';
  }

  function normalizedPOI(poi) {
    return {
      ...poi,
      label: poi.name || poi.label || 'Punto personal',
      primaryType: poi.type || poi.primaryType || 'personal',
      source: 'personal-poi',
      confidence: 1,
    };
  }

  function isSamePersonalPOI(value, id) {
    if (!value || !id) return false;
    return value.id === id || (value.source === 'personal-poi' && value.id == null);
  }

  function clearPersonalCurrent(id) {
    const current = context.value?.('currentPOI.current');
    const value = context.value?.('currentPOI.value');
    if (isSamePersonalPOI(current, id)) context.remove?.('currentPOI.current');
    if (isSamePersonalPOI(value, id)) context.remove?.('currentPOI.value');
    if (isSamePersonalPOI(current, id) || isSamePersonalPOI(value, id)) {
      context.remove?.('currentPOI.distanceM');
      context.set?.('currentPOI.status', 'pending', {
        source: 'personal-poi-situation',
        kind: 'derived',
        confidence: 1,
      });
    }
  }

  function apply(reason = 'update') {
    if (applying) return false;
    applying = true;
    try {
      const poi = personalCurrent();
      if (poi && isStationary()) {
        const current = normalizedPOI(poi);
        lastPersonalId = current.id;
        const options = { source: 'personal-poi', kind: 'confirmed', confidence: 1 };
        context.set?.('currentPOI.current', current, options);
        context.set?.('currentPOI.value', current, options);
        if (Number.isFinite(Number(current.distanceM))) {
          context.set?.('currentPOI.distanceM', Number(current.distanceM), options);
        }
        context.set?.('currentPOI.status', 'ready', options);
      } else if (lastPersonalId) {
        clearPersonalCurrent(lastPersonalId);
        if (!poi) lastPersonalId = null;
      }

      situationEngine.evaluate?.('personal-poi:' + reason);
      return true;
    } finally {
      applying = false;
    }
  }

  function schedule(reason) {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      apply(reason);
    });
  }

  context.subscribe?.((key) => {
    if (
      key === 'personalPOI.current' ||
      key === 'motion.status' ||
      key === 'currentPOI.current' ||
      key === 'currentPOI.value'
    ) schedule(key);
  });

  ['wander:personal-poi-created', 'wander:personal-poi-updated', 'wander:personal-poi-removed'].forEach((eventName) => {
    window.addEventListener(eventName, () => schedule(eventName));
  });

  window.WanderPersonalPOISituation = Object.freeze({
    apply,
    getCurrent: personalCurrent,
  });

  schedule('init');
})();
