(() => {
  const GLOBAL_COOLDOWN_MS = 120000;
  const FAST_MOVEMENT_KMH = 6;

  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function greeting(at) {
    const hour = new Date(at).getHours();
    if (hour >= 5 && hour < 12) return 'Buen día.';
    if (hour >= 12 && hour < 20) return 'Buenas tardes.';
    return 'Buenas noches.';
  }

  function placeIntro(evaluation, at) {
    const place = evaluation?.semanticPlace;
    if (!place?.id || !place?.name || !['city', 'country'].includes(place.level)) return null;
    const contentId = `place-intro:${place.id}`;
    return {
      id: `arrival:${place.id}`,
      kind: 'place_intro',
      title: `Te doy la bienvenida a ${place.name}`,
      message: `${greeting(at)} Parece que es tu primera visita a ${place.name}. ` +
        'Voy a acompañarte con contexto y sugerencias solamente cuando puedan mejorar el recorrido. ' +
        `Si ya conocías ${place.name}, podés decírmelo.`,
      contentId,
      topic: 'place_intro',
      placeId: place.id,
      placeLevel: place.level,
      placeName: place.name,
      allowsFamiliarityCorrection: true,
    };
  }

  function decide({
    evaluation,
    at = Date.now(),
    lastInterventionAt = null,
    contentAlreadyTold = false,
    documentVisible = true,
    mapAvailable = true,
  } = {}) {
    if (evaluation?.type !== 'introduce_place') return { disposition: 'ignore', reason: 'unsupported_action' };

    const intervention = placeIntro(evaluation, at);
    if (!intervention) return { disposition: 'ignore', reason: 'unsupported_place' };
    if (contentAlreadyTold) return { disposition: 'ignore', reason: 'content_already_told', intervention };
    if (!documentVisible) return { disposition: 'defer', reason: 'document_hidden', intervention };
    if (!mapAvailable) return { disposition: 'defer', reason: 'map_unavailable', intervention };

    const speedKmh = finite(evaluation?.situation?.speedKmh);
    const moving = evaluation?.situation?.motion?.status === 'moving';
    if (moving && speedKmh !== null && speedKmh > FAST_MOVEMENT_KMH) {
      return { disposition: 'defer', reason: 'traveler_moving_fast', intervention };
    }

    const previousAt = finite(lastInterventionAt);
    if (previousAt !== null && at - previousAt < GLOBAL_COOLDOWN_MS) {
      return {
        disposition: 'defer',
        reason: 'intervention_cooldown',
        retryAt: previousAt + GLOBAL_COOLDOWN_MS,
        intervention,
      };
    }

    return { disposition: 'present', reason: evaluation.reason || 'place_assumed_new', intervention };
  }

  window.WanderCompanionPolicy = {
    decide,
    greeting,
    constants: { GLOBAL_COOLDOWN_MS, FAST_MOVEMENT_KMH },
  };
})();
