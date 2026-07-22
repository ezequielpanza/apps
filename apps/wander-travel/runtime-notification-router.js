(() => {
  if (window.WanderNotificationRouter) return;

  let lastOpenedKey = null;
  let pending = null;

  function focusHistory(payload) {
    window.WanderScreen?.open?.('companion');
    const id = payload.interactionId || payload.interventionId || payload.id;
    if (window.WanderInteractionPanel?.focus?.(id)) return true;
    setTimeout(() => window.WanderInteractionPanel?.focus?.(id), 250);
    return true;
  }

  function openRoomPrompt(payload, attempt = 0) {
    window.WanderScreen?.open?.('map');
    const room = window.WanderRoomCompanion;
    if (room?.openNotification?.(payload.id)) return true;
    if (attempt >= 12) return focusHistory(payload);
    setTimeout(() => openRoomPrompt(payload, attempt + 1), 250);
    return true;
  }

  function open(payload = {}) {
    const id = String(payload.id || payload.interactionId || payload.interventionId || '').trim();
    if (!id) return false;
    const key = `${id}:${Number(payload.openedAt) || 0}`;
    if (lastOpenedKey === key) return true;
    lastOpenedKey = key;
    pending = { ...payload, id };

    const target = String(payload.target || 'companion');
    if (target === 'room-prompt' || id.startsWith('room-pause:')) {
      openRoomPrompt(pending);
    } else {
      focusHistory(pending);
    }

    window.WanderContext?.set?.('notifications.lastRouted', {
      ...pending,
      routedAt: new Date().toISOString(),
    }, { source: 'notification-router', kind: 'derived', ttlMs: 30 * 60 * 1000, confidence: 1 });
    window.WanderPlatform?.clearPendingNotificationOpen?.();
    return true;
  }

  window.addEventListener('wander:notification-opened', (event) => open(event.detail || {}));
  window.addEventListener('wander:app-ready', () => {
    const queued = window.WanderPlatform?.getPendingNotificationOpen?.();
    if (queued) open(queued);
  });

  window.WanderNotificationRouter = Object.freeze({
    open,
    getPending: () => pending ? { ...pending } : null,
  });

  const queued = window.WanderPlatform?.getPendingNotificationOpen?.();
  if (queued) queueMicrotask(() => open(queued));
})();
