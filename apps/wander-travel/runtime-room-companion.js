(() => {
  const context = window.WanderContext;
  const ui = window.WanderUI;
  const engine = window.WanderEngine;
  const interactionCore = window.WanderInteractionCore;
  const platform = window.WanderPlatform;
  if (!context || !ui || !engine || window.WanderRoomCompanion) return;

  const STORAGE_KEY = 'wander.roomCompanion.v1';
  const ROOM_STABILITY_MS = 2 * 60 * 1000;
  const PROMPT_COOLDOWN_MS = 4 * 60 * 60 * 1000;
  const REST_QUIET_MS = 45 * 60 * 1000;
  const DONT_INTERRUPT_MS = 6 * 60 * 60 * 1000;
  const PENDING_NOTIFICATION_TTL_MS = 30 * 60 * 1000;

  let timer = null;
  let stableRoomId = null;
  let stableSince = 0;
  let activeIntervention = null;

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

  function named(place) {
    return place?.name || place?.label || place?.displayName || null;
  }

  function categoryText(place) {
    const values = [];
    if (Array.isArray(place?.categories)) {
      place.categories.forEach((category) => values.push(category?.id, category?.label, category?.name));
    }
    values.push(place?.kind, place?.type, place?.category, place?.subtype);
    return values.filter(Boolean).join(' ').toLowerCase();
  }

  function isRoomLike(place) {
    if (!place) return false;
    const name = String(named(place) || '').toLowerCase();
    const categories = categoryText(place);
    const roomName = /(^|\s)(habitaci[oó]n|cuarto|room|suite|apartamento|apartment|caba[nñ]a|cabin|villa)(\s|$)/i.test(name);
    const roomCategory = /(hotel[_ -]?room|lodging[_ -]?room|guest[_ -]?room|accommodation[_ -]?unit|private[_ -]?room|suite)/i.test(categories);
    const broadLodgingOnly = /^(hotel|resort|alojamiento|lodging|hostel|apart hotel)$/i.test(name.trim());
    return (roomName || roomCategory) && !broadLodgingOnly;
  }

  function currentSnapshot() {
    const hierarchy = context.value('placeHierarchy.current');
    const current = hierarchy?.current || context.value('currentPOI.current') || null;
    return {
      room: isRoomLike(current) ? current : null,
      placeId: current?.id || null,
      placeName: named(current),
      motion: String(context.value('motion.status') || 'pending'),
      speedKmh: finite(context.value('motion.speedKmh')) || 0,
    };
  }

  function interventionFor(snapshot) {
    const name = snapshot.placeName || 'la habitación';
    const id = `room-pause:${snapshot.placeId}:${Date.now()}`;
    return {
      id,
      interactionId: id,
      kind: 'room_pause',
      interactionType: 'ask',
      priority: 'normal',
      title: 'Una pausa en la habitación',
      message: `Parece que hicieron una pausa en ${name}. ¿Descansan un rato o quieren que Wander piense qué hacer después?`,
      contentId: `room-pause:${snapshot.placeId}`,
      topic: 'room_pause',
      notificationTarget: 'room-prompt',
      placeId: snapshot.placeId,
      placeName: snapshot.placeName,
    };
  }

  function recordPresentation(intervention, channel, reason) {
    interactionCore?.present?.(intervention, { channel, reason });
    engine.observe?.({
      type: 'companion_intervention', interventionId: intervention.id, kind: intervention.kind,
      interactionType: intervention.interactionType, priority: intervention.priority,
      contentId: intervention.contentId, reason,
    });
    context.set('companion.lastIntervention', {
      id: intervention.id, kind: intervention.kind, interactionType: intervention.interactionType,
      priority: intervention.priority, placeId: intervention.placeId,
      presentedAt: new Date().toISOString(), channel,
    }, { source: 'room-companion', kind: 'derived', ttlMs: 30 * 60 * 1000, confidence: 1 });
  }

  function recordResponse(intervention, id, label, quietMs = 0) {
    interactionCore?.respond?.({ id, type: id, label });
    interactionCore?.complete?.(id);
    engine.observe?.({
      type: 'companion_feedback', interventionId: intervention?.id || null,
      feedbackType: id, contentId: intervention?.contentId || null, label,
    });
    const state = readState();
    state.lastResponse = { id, label, placeId: intervention?.placeId || null, at: Date.now() };
    if (quietMs > 0) {
      state.quietUntil = Date.now() + quietMs;
      state.quietPlaceId = intervention?.placeId || null;
      context.set('companion.quietUntil', new Date(state.quietUntil).toISOString(), {
        source: 'user', kind: 'confirmed', ttlMs: quietMs, confidence: 1,
      });
    }
    writeState(state);
  }

  function handleRest(intervention) {
    recordResponse(intervention, 'resting', 'Descansar', REST_QUIET_MS);
    activeIntervention = null;
    ui.showWander('Descansen tranquilos', 'No voy a interrumpir durante los próximos 45 minutos.', { timeoutMs: 6500 });
  }

  function handlePlan(intervention) {
    recordResponse(intervention, 'plan_now', 'Qué hacemos ahora');
    activeIntervention = null;
    ui.hideWander();
    setTimeout(() => {
      const shown = window.WanderProactiveCompanion?.requestNowPlan?.() || window.WanderProactiveCompanion?.requestAlternative?.();
      if (!shown) ui.showWander('Sigo buscando', 'Todavía no encontré una propuesta suficientemente buena. Voy a avisarte cuando aparezca una opción útil.', { timeoutMs: 7000 });
    }, 0);
  }

  function handleQuiet(intervention) {
    recordResponse(intervention, 'do_not_interrupt', 'No interrumpir', DONT_INTERRUPT_MS);
    activeIntervention = null;
    ui.showWander('Entendido', 'No voy a interrumpir mientras sigan en la habitación, salvo que detecte algo importante.', { timeoutMs: 7000 });
  }

  function showPrompt(snapshot, intervention = interventionFor(snapshot), reason = 'room:stable') {
    if (window.WanderCompanion?.getActive?.()) {
      schedule(30000);
      return false;
    }
    activeIntervention = intervention;
    const shown = ui.showWander(intervention.title, intervention.message, {
      persistent: true,
      choices: [
        { label: 'Descansar', onInvoke: () => handleRest(intervention) },
        { label: 'Qué hacemos ahora', emphasis: 'primary', onInvoke: () => handlePlan(intervention) },
        { label: 'No interrumpir', onInvoke: () => handleQuiet(intervention) },
      ],
      onDismiss: () => {
        if (activeIntervention?.id !== intervention.id) return;
        recordResponse(intervention, 'dismissed', 'Cerrar');
        activeIntervention = null;
      },
    });
    if (!shown) return false;
    if (interactionCore?.getCurrent?.()?.id !== intervention.id) {
      recordPresentation(intervention, 'in_app', reason);
    }
    return true;
  }

  function updatePromptState(snapshot, pendingNotification = null) {
    const state = readState();
    state.lastPromptAtByPlace ||= {};
    state.lastPromptAtByPlace[snapshot.placeId] = Date.now();
    state.pendingNotification = pendingNotification;
    writeState(state);
  }

  async function notifyPrompt(snapshot) {
    if (!platform?.canNotifyInBackground?.()) return false;
    const intervention = interventionFor(snapshot);
    const delivery = await platform.deliverNotification({
      id: intervention.id,
      interactionId: intervention.interactionId,
      interventionId: intervention.id,
      target: intervention.notificationTarget,
      title: intervention.title,
      message: `${intervention.message} Abrí Wander para elegir.`,
    });
    if (!delivery.delivered) return false;
    updatePromptState(snapshot, { intervention, placeId: snapshot.placeId, createdAt: Date.now() });
    recordPresentation(intervention, 'notification', 'room:background');
    return true;
  }

  function pendingFor(snapshot = null) {
    const state = readState();
    const pending = state.pendingNotification;
    if (!pending) return null;
    if (snapshot?.placeId && pending.placeId !== snapshot.placeId) return null;
    if (Date.now() - Number(pending.createdAt || 0) <= PENDING_NOTIFICATION_TTL_MS) return pending;
    state.pendingNotification = null;
    writeState(state);
    return null;
  }

  function clearPending() {
    const state = readState();
    state.pendingNotification = null;
    writeState(state);
  }

  function openNotification(id) {
    if (activeIntervention?.id === id) {
      window.WanderScreen?.open?.('map');
      return true;
    }
    const pending = pendingFor();
    const intervention = pending?.intervention;
    if (!intervention || (id && intervention.id !== id && intervention.interactionId !== id)) return false;
    window.WanderScreen?.open?.('map');
    const snapshot = currentSnapshot();
    const shown = showPrompt(snapshot, intervention, 'room:notification-opened');
    if (shown) clearPending();
    return shown;
  }

  function quietFor(snapshot) {
    const state = readState();
    return state.quietPlaceId === snapshot.placeId && Number(state.quietUntil || 0) > Date.now();
  }

  function recentlyPrompted(snapshot) {
    const at = Number(readState().lastPromptAtByPlace?.[snapshot.placeId] || 0);
    return at > 0 && Date.now() - at < PROMPT_COOLDOWN_MS;
  }

  function evaluate() {
    timer = null;
    const snapshot = currentSnapshot();
    if (!snapshot.room || !snapshot.placeId || snapshot.motion === 'pending' || snapshot.motion === 'moving' || snapshot.speedKmh > 1.5) {
      stableRoomId = null;
      stableSince = 0;
      return false;
    }

    if (stableRoomId !== snapshot.placeId) {
      stableRoomId = snapshot.placeId;
      stableSince = Date.now();
      schedule(ROOM_STABILITY_MS);
      return false;
    }

    const pending = pendingFor(snapshot);
    if (pending && document.visibilityState !== 'hidden') {
      const shown = showPrompt(snapshot, pending.intervention, 'room:notification-opened');
      if (shown) clearPending();
      return shown;
    }

    if (quietFor(snapshot) || recentlyPrompted(snapshot)) return false;
    const elapsed = Date.now() - stableSince;
    if (elapsed < ROOM_STABILITY_MS) {
      schedule(ROOM_STABILITY_MS - elapsed);
      return false;
    }

    if (document.visibilityState === 'hidden') {
      notifyPrompt(snapshot).then((delivered) => {
        if (!delivered) schedule(60000);
      });
      return true;
    }

    const shown = showPrompt(snapshot);
    if (shown) updatePromptState(snapshot);
    return shown;
  }

  function schedule(delay = 1200) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(evaluate, Math.max(100, delay));
  }

  context.subscribe((key) => {
    if (key === 'placeHierarchy.current' || key === 'currentPOI.current' || key === 'motion.status' || key === 'motion.speedKmh') schedule();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') schedule(300);
  });
  window.addEventListener('wander:app-ready', () => schedule(1000), { once: true });

  window.WanderRoomCompanion = Object.freeze({
    evaluate,
    schedule,
    openNotification,
    isRoomLike,
    isCurrentRoom: () => Boolean(currentSnapshot().room),
    getSnapshot: currentSnapshot,
    constants: { ROOM_STABILITY_MS, PROMPT_COOLDOWN_MS, REST_QUIET_MS, DONT_INTERRUPT_MS, PENDING_NOTIFICATION_TTL_MS },
  });

  schedule(1500);
})();
