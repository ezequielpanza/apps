(() => {
  const PRODUCTION_ORIGIN = 'https://wander-travel.pages.dev';
  let notificationState = Object.freeze({ status: 'unknown', granted: false, enabled: false, canRequest: false });

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

  function canNotifyInBackground() {
    return isNative() && notificationState.granted === true && notificationState.enabled === true
      && typeof notificationPlugin()?.notifyCompanion === 'function';
  }

  async function deliverNotification({ id, title, message } = {}) {
    if (!canNotifyInBackground()) return { delivered: false, ...notificationState };
    try {
      const result = await notificationPlugin().notifyCompanion({ id, title, message });
      publishNotificationState(result);
      const delivery = { ...result, delivered: result?.delivered === true };
      window.WanderContext?.set?.('notifications.lastDelivery', {
        ...delivery,
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
      title: intervention.title,
      message: intervention.message,
    }).then((result) => {
      if (!result.delivered) window.dispatchEvent(new CustomEvent('wander:notification-delivery-failed', { detail: result }));
    });
    return true;
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
    getNotificationPermission: () => ({ ...notificationState }),
    productionOrigin: PRODUCTION_ORIGIN,
  };

  refreshNotificationPermission();
})();
