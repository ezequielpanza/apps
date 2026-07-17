(() => {
  const PRODUCTION_ORIGIN = 'https://wander-travel.pages.dev';

  function isNative() {
    return window.Capacitor?.isNativePlatform?.() === true;
  }

  function apiUrl(path) {
    const origin = isNative() ? PRODUCTION_ORIGIN : window.location.origin;
    return new URL(path, origin).toString();
  }

  function canNotifyInBackground() {
    return isNative() && typeof window.Capacitor?.Plugins?.WanderLocation?.notifyCompanion === 'function';
  }

  function notifyCompanion(intervention) {
    if (!canNotifyInBackground()) return false;
    window.Capacitor.Plugins.WanderLocation.notifyCompanion({
      id: intervention.id,
      title: intervention.title,
      message: intervention.message,
    }).catch(() => {});
    return true;
  }

  window.WanderPlatform = {
    isNative,
    apiUrl,
    canNotifyInBackground,
    notifyCompanion,
    productionOrigin: PRODUCTION_ORIGIN,
  };
})();
