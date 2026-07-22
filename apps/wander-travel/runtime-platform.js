(() => {
  const PRODUCTION_ORIGIN = 'https://wander-travel.pages.dev';
  let notificationState = Object.freeze({ status: 'unknown', granted: false, enabled: false, canRequest: false });
  let notificationSoundState = Object.freeze({ mode: 'default', label: 'Sonido predeterminado', uri: null, channelId: null });
  let pendingNotificationOpen = null;
  let notificationOpenListener = null;
  const openedNotificationKeys = new Set();

  function isNative() {
    return window.Capacitor?.isNativePlatform?.() === true;
  }

  function apiUrl(path) {
    const origin = isNative() ? PRODUCTION_ORIGIN : window.location.origin;
    return new URL(path, origin).toString();
  }

  function notificationPlugin() {
    return window.Capacitor?.Plugins?.WanderNotifications || null;
  }

  function publishNotificationState(value = {}) {
    notificationState = Object.freeze({
      status: String(value.status || 'unknown'),
      granted: value.granted === true,
      enabled: value.enabled === true,
      canRequest: value.canRequest === true,
    });
    window.WanderContext?.set?.('notifications.permission', notificationState, {
      source: 'android-notifications', kind: 'observed', ttlMs: 30000, confidence: 1,
    });
    window.dispatchEvent(new CustomEvent('wander:notification-permission', { detail: notificationState }));
    return notificationState;
  }

  function publishNotificationSound(value = {}) {
    notificationSoundState = Object.freeze({
      mode: String(value.mode || 'default'),
      label: String(value.label || 'Sonido predeterminado'),
      uri: value.uri || null,
      channelId: value.channelId || null,
      cancelled: value.cancelled === true,
    });
    window.WanderContext?.set?.('notifications.sound', notificationSoundState, {
      source: 'android-notifications', kind: 'confirmed', ttlMs: Infinity, confidence: 1,
    });
    window.dispatchEvent(new CustomEvent('wander:notification-sound', { detail: notificationSoundState }));
    return notificationSoundState;
  }

  function normalizeNotificationOpen(value = {}) {
    const id = String(value.id || value.interactionId || value.interventionId || '').trim();
    if (!id) return null;
    return Object.freeze({
      id,
      interactionId: String(value.interactionId || id),
      interventionId: String(value.interventionId || id),
      target: String(value.target || 'companion'),
      title: String(value.title || 'Wander'),
      message: String(value.message || ''),
      openedAt: Number(value.openedAt) || Date.now(),
    });
  }

  function publishNotificationOpen(value = {}) {
    const payload = normalizeNotificationOpen(value);
    if (!payload) return null;
    const key = `${payload.id}:${payload.openedAt}`;
    if (openedNotificationKeys.has(key)) return payload;
    openedNotificationKeys.add(key);
    if (openedNotificationKeys.size > 30) openedNotificationKeys.delete(openedNotificationKeys.values().next().value);
    pendingNotificationOpen = payload;
    window.WanderContext?.set?.('notifications.lastOpened', payload, {
      source: 'android-notifications', kind: 'observed', ttlMs: 30 * 60 * 1000, confidence: 1,
    });
    window.dispatchEvent(new CustomEvent('wander:notification-opened', { detail: payload }));
    window.WanderNotificationRouter?.open?.(payload);
    return payload;
  }

  async function refreshNotificationPermission() {
    if (!isNative() || typeof notificationPlugin()?.checkPermission !== 'function') {
      return publishNotificationState({ status: isNative() ? 'unavailable' : 'web', granted: false, enabled: false, canRequest: false });
    }
    try {
      return publishNotificationState(await notificationPlugin().checkPermission());
    } catch {
      return publishNotificationState({ status: 'unavailable', granted: false, enabled: false, canRequest: false });
    }
  }

  async function requestNotificationPermission() {
    if (!isNative() || typeof notificationPlugin()?.requestPermission !== 'function') return refreshNotificationPermission();
    try {
      return publishNotificationState(await notificationPlugin().requestPermission());
    } catch {
      return refreshNotificationPermission();
    }
  }

  async function openNotificationSettings() {
    if (typeof notificationPlugin()?.openSettings !== 'function') return false;
    try {
      await notificationPlugin().openSettings();
      return true;
    } catch {
      return false;
    }
  }

  async function refreshNotificationSound() {
    if (!isNative() || typeof notificationPlugin()?.getSound !== 'function') return publishNotificationSound();
    try {
      return publishNotificationSound(await notificationPlugin().getSound());
    } catch {
      return publishNotificationSound();
    }
  }

  async function pickNotificationSound() {
    if (!isNative() || typeof notificationPlugin()?.pickSound !== 'function') return refreshNotificationSound();
    try {
      return publishNotificationSound(await notificationPlugin().pickSound());
    } catch {
      return refreshNotificationSound();
    }
  }

  function canNotifyInBackground() {
    return isNative() && notificationState.granted === true && notificationState.enabled === true
      && typeof notificationPlugin()?.notifyCompanion === 'function';
  }

  async function deliverNotification({ id, title, message, interactionId, interventionId, target } = {}) {
    if (!canNotifyInBackground()) return { delivered: false, ...notificationState };
    try {
      const result = await notificationPlugin().notifyCompanion({
        id,
        title,
        message,
        interactionId: interactionId || id,
        interventionId: interventionId || id,
        target: target || 'companion',
      });
      publishNotificationState(result);
      if (result?.soundLabel || result?.soundMode) {
        publishNotificationSound({
          ...notificationSoundState,
          mode: result.soundMode || notificationSoundState.mode,
          label: result.soundLabel || notificationSoundState.label,
        });
      }
      const delivery = { ...result, delivered: result?.delivered === true };
      window.WanderContext?.set?.('notifications.lastDelivery', {
        ...delivery,
        id: id || null,
        target: target || 'companion',
        at: new Date().toISOString(),
      }, { source: 'android-notifications', kind: 'observed', ttlMs: 10 * 60 * 1000, confidence: 1 });
      return delivery;
    } catch {
      await refreshNotificationPermission();
      return { delivered: false, error: 'native_delivery_failed', ...notificationState };
    }
  }

  function notifyCompanion(intervention) {
    if (!canNotifyInBackground()) return false;
    deliverNotification({
      id: intervention.id,
      interactionId: intervention.interactionId || intervention.id,
      interventionId: intervention.id,
      target: intervention.notificationTarget || 'companion',
      title: intervention.title,
      message: intervention.message,
    }).then((result) => {
      if (!result.delivered) window.dispatchEvent(new CustomEvent('wander:notification-delivery-failed', { detail: result }));
    });
    return true;
  }

  async function consumePendingNotificationOpen() {
    if (!isNative() || typeof notificationPlugin()?.consumePendingOpen !== 'function') return pendingNotificationOpen;
    try {
      const result = await notificationPlugin().consumePendingOpen();
      if (result?.notification) publishNotificationOpen(result.notification);
    } catch {}
    return pendingNotificationOpen;
  }

  function installNotificationOpenListener() {
    const nativePlugin = notificationPlugin();
    if (!isNative() || typeof nativePlugin?.addListener !== 'function' || notificationOpenListener) return;
    Promise.resolve(nativePlugin.addListener('notificationOpened', (payload) => publishNotificationOpen(payload)))
      .then((handle) => { notificationOpenListener = handle; })
      .catch(() => {});
  }

  function loadRoomCompanion() {
    if (window.WanderRoomCompanion || document.querySelector('script[data-wander-room-companion]')) return;
    const script = document.createElement('script');
    script.src = './runtime-room-companion.js?v=20260718-01';
    script.dataset.wanderRoomCompanion = 'true';
    script.async = false;
    document.head.appendChild(script);
  }

  window.WanderPlatform = {
    isNative,
    apiUrl,
    canNotifyInBackground,
    notifyCompanion,
    deliverNotification,
    refreshNotificationPermission,
    requestNotificationPermission,
    openNotificationSettings,
    refreshNotificationSound,
    pickNotificationSound,
    publishNotificationOpen,
    consumePendingNotificationOpen,
    getPendingNotificationOpen: () => pendingNotificationOpen ? { ...pendingNotificationOpen } : null,
    clearPendingNotificationOpen: () => { pendingNotificationOpen = null; },
    getNotificationPermission: () => ({ ...notificationState }),
    getNotificationSound: () => ({ ...notificationSoundState }),
    productionOrigin: PRODUCTION_ORIGIN,
  };

  installNotificationOpenListener();
  if (window.WanderAppReady) {
    loadRoomCompanion();
    consumePendingNotificationOpen();
  } else {
    window.addEventListener('wander:app-ready', () => {
      loadRoomCompanion();
      consumePendingNotificationOpen();
    }, { once: true });
  }
  refreshNotificationPermission();
  refreshNotificationSound();
})();
