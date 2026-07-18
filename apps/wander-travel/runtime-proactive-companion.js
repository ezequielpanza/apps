(() => {
  const context = window.WanderContext;
  const companion = window.WanderCompanion;
  if (!context || !companion?.handleEvaluation || window.WanderProactiveCompanion) return;

  const INITIAL_DELAY_MS = 8000;
  const PLACE_STABILITY_MS = 12000;
  const SUGGESTION_COOLDOWN_MS = 10 * 60 * 1000;
  const PLACE_REINTRO_MS = 6 * 60 * 60 * 1000;
  const STORAGE_KEY = 'wander.proactiveCompanion.v1';

  let timer = null;
  let stablePlaceId = null;
  let stableSince = 0;
  let lastSnapshot = null;

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
    catch { return {}; }
  }

  function writeState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function named(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.name || value.label || value.displayName || null;
  }

  function currentSnapshot() {
    const hierarchy = context.value('placeHierarchy.current');
    const current = hierarchy?.current || context.value('currentPOI.current') || null;
    const container = hierarchy?.container || context.value('container.current') || null;
    const zone = hierarchy?.zone || context.value('place.zone') || null;
    const city = hierarchy?.city || context.value('place.city') || null;
    const nearby = Array.isArray(context.value('nearby.items')) ? context.value('nearby.items') : [];
    const motion = String(context.value('motion.status') || 'pending');
    const speedKmh = finite(context.value('motion.speedKmh')) || 0;
    const dayPeriod = String(context.value('time.dayPeriod') || '').toLowerCase();

    return {
      current,
      container,
      zone,
      city,
      nearby,
      motion,
      speedKmh,
      dayPeriod,
      placeId: current?.id || container?.id || zone?.id || city?.id || null,
      placeName: named(current) || named(container) || named(zone) || named(city) || null,
    };
  }

  function categoryKeys(item) {
    return (Array.isArray(item?.categories) ? item.categories : [])
      .flatMap((category) => [category?.id, category?.label])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);
  }

  function categoryText(item) {
    return categoryKeys(item).join(' ');
  }

  function learnedPreferenceScore(item) {
    const interests = window.WanderEngine?.getState?.()?.profile?.interests || {};
    return categoryKeys(item).reduce((score, key) => score + (Number(interests[key]) || 0) * 7, 0);
  }

  function scoreNearby(item, snapshot) {
    const distance = Math.max(0, finite(item?.distanceM) ?? 9999);
    const categories = categoryText(item);
    let score = Math.max(0, 80 - distance / 8) + learnedPreferenceScore(item);

    if (/restaurant|food|cafe|bar|bakery/.test(categories)) {
      if (/morning|mañana/.test(snapshot.dayPeriod)) score += /cafe|bakery|breakfast/.test(categories) ? 18 : 4;
      if (/noon|afternoon|mediodía|tarde|evening|noche/.test(snapshot.dayPeriod)) score += 14;
    }
    if (/attraction|museum|viewpoint|beach|park|historic|tourism/.test(categories)) score += 12;
    if (/toilet|parking|atm|pharmacy/.test(categories)) score -= 10;
    if (item?.note || item?.description) score += 8;
    if (String(item?.id || '') === String(snapshot.current?.id || '')) score -= 60;
    return score;
  }

  function bestNearby(snapshot, excludedIds = []) {
    const excluded = new Set((Array.isArray(excludedIds) ? excludedIds : []).map(String));
    return snapshot.nearby
      .filter((item) => !excluded.has(String(item?.id || '')))
      .map((item) => ({ item, score: scoreNearby(item, snapshot) }))
      .filter((entry) => entry.score > 20 && entry.item?.id && entry.item?.name)
      .sort((left, right) => right.score - left.score || (left.item.distanceM || 9999) - (right.item.distanceM || 9999))[0]?.item || null;
  }

  function placeMessage(snapshot) {
    const currentName = named(snapshot.current);
    const containerName = named(snapshot.container);
    const zoneName = named(snapshot.zone);
    const cityName = named(snapshot.city);

    if (currentName && containerName && currentName !== containerName) {
      return `Estás en ${currentName}, dentro de ${containerName}. Voy a observar qué hay cerca y proponerte opciones útiles según la hora y cómo te estés moviendo.`;
    }
    if (currentName) return `Estás en ${currentName}. Voy a acompañarte con sugerencias cercanas y contexto útil, sin interrumpirte de más.`;
    if (containerName) return `Estás dentro de ${containerName}. Puedo ayudarte a descubrir qué tenés cerca y qué conviene hacer ahora.`;
    if (zoneName || cityName) return `Estás en ${zoneName || cityName}. Voy a usar este contexto para anticipar opciones y sugerirte lugares relevantes.`;
    return null;
  }

  function accepted(result) {
    return ['present', 'notify'].includes(result?.disposition) || result?.reason === 'content_already_told';
  }

  function emitPlaceContext(snapshot, now) {
    const state = readState();
    const previousAt = finite(state.placeIntroductions?.[snapshot.placeId]);
    if (previousAt !== null && now - previousAt < PLACE_REINTRO_MS) return false;
    const message = placeMessage(snapshot);
    if (!message) return false;

    const result = companion.handleEvaluation({
      type: 'contextual_suggestion',
      reason: 'stable_place_context',
      semanticPlace: {
        id: snapshot.placeId,
        name: snapshot.placeName,
        level: snapshot.current?.kind || snapshot.container?.kind || snapshot.zone?.kind || snapshot.city?.kind || 'place',
      },
      suggestion: {
        id: `place-context:${snapshot.placeId}`,
        kind: 'place_context',
        interactionType: 'inform',
        priority: 'low',
        title: 'Ya tengo tu contexto',
        message,
        contentId: `place-context:${snapshot.placeId}`,
        topic: 'place_context',
        placeId: snapshot.placeId,
        placeName: snapshot.placeName,
      },
      situation: { motion: { status: snapshot.motion }, speedKmh: snapshot.speedKmh },
    }, 'proactive:place-context');

    if (accepted(result)) {
      state.placeIntroductions ||= {};
      state.placeIntroductions[snapshot.placeId] = now;
      state.lastSuggestionAt = now;
      writeState(state);
    }
    return result?.disposition !== 'ignore' || result?.reason === 'content_already_told';
  }

  function emitNearbySuggestion(snapshot, now, options = {}) {
    const state = readState();
    const lastAt = finite(state.lastSuggestionAt);
    if (!options.ignoreCooldown && lastAt !== null && now - lastAt < SUGGESTION_COOLDOWN_MS) return false;
    if (snapshot.motion === 'moving' && snapshot.speedKmh > 6) return false;

    const excludedIds = [...(options.excludedIds || [])];
    if (!options.userRequested && state.lastNearbyId) excludedIds.push(state.lastNearbyId);
    const poi = bestNearby(snapshot, excludedIds);
    if (!poi) return false;
    const distanceM = Math.max(0, Math.round(finite(poi.distanceM) || 0));
    const note = String(poi.note || poi.description || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    const where = distanceM > 0 ? `a ${distanceM} metros` : 'muy cerca';
    const message = `${poi.name} está ${where}.${note ? ` ${note}` : ''} Puede ser una buena próxima parada desde donde estás.`;
    const planNow = options.planNow === true;

    const result = companion.handleEvaluation({
      type: 'contextual_suggestion',
      reason: planNow ? 'room_next_step' : options.userRequested ? 'user_requested_alternative' : 'nearby_contextual_option',
      semanticPlace: { id: snapshot.placeId, name: snapshot.placeName, level: 'place' },
      suggestion: {
        id: `nearby-suggestion:${poi.id}:${options.userRequested ? now : 'auto'}`,
        kind: 'contextual_suggestion',
        interactionType: 'suggest',
        priority: options.userRequested ? 'normal' : 'low',
        title: planNow ? 'Qué hacer ahora' : options.userRequested ? 'Otra opción cerca' : 'Una opción cerca',
        message,
        contentId: `nearby-suggestion:${poi.id}`,
        topic: planNow ? 'room_next_step' : 'nearby_suggestion',
        placeId: snapshot.placeId || poi.id,
        placeName: snapshot.placeName || poi.name,
        poi,
        action: Number.isFinite(Number(poi?.location?.lat)) && Number.isFinite(Number(poi?.location?.lng)) ? {
          id: 'take-me',
          label: 'Llévame',
          destination: {
            id: poi.id,
            name: poi.name,
            lat: Number(poi.location.lat),
            lng: Number(poi.location.lng),
          },
        } : null,
      },
      situation: { motion: { status: snapshot.motion }, speedKmh: snapshot.speedKmh },
    }, planNow ? 'proactive:room-plan' : options.userRequested ? 'proactive:alternative' : 'proactive:nearby');

    if (accepted(result)) {
      state.lastSuggestionAt = now;
      state.lastNearbyId = poi.id;
      writeState(state);
    }
    return result?.disposition !== 'ignore' || result?.reason === 'content_already_told';
  }

  function requestAlternative(excludeId) {
    const snapshot = currentSnapshot();
    lastSnapshot = snapshot;
    const shown = emitNearbySuggestion(snapshot, Date.now(), {
      userRequested: true,
      ignoreCooldown: true,
      excludedIds: [excludeId].filter(Boolean),
    });
    if (!shown) {
      window.WanderUI?.showWander?.('No encontré otra mejor ahora', 'Voy a seguir observando y te aviso cuando aparezca una opción distinta.', { timeoutMs: 6500 });
    }
    return shown;
  }

  function requestNowPlan() {
    const snapshot = currentSnapshot();
    lastSnapshot = snapshot;
    return emitNearbySuggestion(snapshot, Date.now(), {
      userRequested: true,
      ignoreCooldown: true,
      planNow: true,
    });
  }

  function evaluate() {
    timer = null;
    const snapshot = currentSnapshot();
    lastSnapshot = snapshot;
    if (!snapshot.placeId || !snapshot.placeName || snapshot.motion === 'pending') return;
    if (window.WanderRoomCompanion?.isCurrentRoom?.()) {
      schedule(PLACE_STABILITY_MS);
      return;
    }

    const now = Date.now();
    if (stablePlaceId !== snapshot.placeId) {
      stablePlaceId = snapshot.placeId;
      stableSince = now;
      schedule(PLACE_STABILITY_MS);
      return;
    }
    if (now - stableSince < PLACE_STABILITY_MS) {
      schedule(PLACE_STABILITY_MS - (now - stableSince));
      return;
    }

    if (emitPlaceContext(snapshot, now)) {
      schedule(SUGGESTION_COOLDOWN_MS);
      return;
    }
    if (emitNearbySuggestion(snapshot, now)) schedule(SUGGESTION_COOLDOWN_MS);
  }

  function schedule(delay = 1200) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(evaluate, Math.max(100, delay));
  }

  context.subscribe((key) => {
    if (
      key === 'placeHierarchy.current' || key === 'currentPOI.current' || key === 'container.current' ||
      key === 'nearby.items' || key === 'motion.status' || key === 'motion.speedKmh' || key === 'time.dayPeriod'
    ) schedule();
  });

  window.addEventListener('wander:screen-change', () => schedule(500));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') schedule(500);
  });

  window.WanderProactiveCompanion = Object.freeze({
    evaluate,
    schedule,
    requestAlternative,
    requestNowPlan,
    getSnapshot: () => lastSnapshot,
    rankNearby: (snapshot = currentSnapshot(), excludedIds = []) => snapshot.nearby
      .filter((item) => !excludedIds.map(String).includes(String(item?.id || '')))
      .map((item) => ({ item, score: scoreNearby(item, snapshot) }))
      .sort((left, right) => right.score - left.score),
    constants: { INITIAL_DELAY_MS, PLACE_STABILITY_MS, SUGGESTION_COOLDOWN_MS, PLACE_REINTRO_MS },
  });

  schedule(INITIAL_DELAY_MS);
})();
