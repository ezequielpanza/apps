(() => {
  const context = window.WanderContext;
  if (!context) return;

  const WEB_VERSION = window.WanderWebVersion || window.WanderVersion || null;
  const MAX_ATTEMPTS = 24;
  const RETRY_DELAY_MS = 250;
  let attempt = 0;
  let retryTimer = null;
  let resolvedVersion = null;
  let reading = false;

  function setContext(key, value, source = 'runtime-native-app-version') {
    context.set(key, value, {
      source,
      kind: 'observed',
      ttlMs: Infinity,
      confidence: 1,
    });
  }

  function updateDrawer(apkVersion = resolvedVersion) {
    const element = document.querySelector('#drawer-version');
    if (!element) return;
    const labels = [];
    if (WEB_VERSION) labels.push('Web ' + WEB_VERSION);
    if (apkVersion) labels.push('APK ' + apkVersion);
    element.textContent = labels.join(' · ');
  }

  function scheduleRetry() {
    if (resolvedVersion || attempt >= MAX_ATTEMPTS || retryTimer) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      readAppInfo();
    }, RETRY_DELAY_MS);
  }

  function markPending() {
    setContext('app.apkVersionStatus', 'pending');
    if (!resolvedVersion) setContext('app.apkVersion', 'Detectando…');
  }

  function markUnavailable(error = null) {
    setContext('app.apkVersionStatus', 'unavailable');
    setContext('app.apkVersion', 'No disponible');
    if (error?.code) setContext('app.apkVersionError', String(error.code));
    updateDrawer(null);
  }

  async function readAppInfo(options = {}) {
    const force = options.force === true;
    if (reading || (resolvedVersion && !force)) return;
    reading = true;
    attempt += 1;

    try {
      const capacitor = window.Capacitor;
      if (!capacitor) {
        markPending();
        if (attempt < MAX_ATTEMPTS) scheduleRetry();
        else {
          setContext('app.platform', 'web', 'web-runtime');
          setContext('app.apkVersion', 'No aplica', 'web-runtime');
          setContext('app.apkVersionStatus', 'not-applicable', 'web-runtime');
          updateDrawer(null);
        }
        return;
      }

      const native = capacitor.isNativePlatform?.() === true;
      if (!native) {
        setContext('app.platform', 'web', 'web-runtime');
        setContext('app.apkVersion', 'No aplica', 'web-runtime');
        setContext('app.apkVersionStatus', 'not-applicable', 'web-runtime');
        updateDrawer(null);
        return;
      }

      setContext('app.platform', 'android');
      markPending();

      const plugin = capacitor.Plugins?.WanderLocation;
      if (typeof plugin?.getAppInfo !== 'function') {
        if (attempt < MAX_ATTEMPTS) scheduleRetry();
        else markUnavailable({ code: 'PLUGIN_METHOD_UNAVAILABLE' });
        return;
      }

      const info = await plugin.getAppInfo();
      const versionName = String(info?.versionName || '').trim();
      const versionCode = Number(info?.versionCode);
      const packageName = String(info?.packageName || '').trim();

      if (!versionName) {
        if (attempt < MAX_ATTEMPTS) scheduleRetry();
        else markUnavailable({ code: 'EMPTY_VERSION_NAME' });
        return;
      }

      resolvedVersion = versionName;
      setContext('app.apkVersion', versionName);
      setContext('app.apkVersionStatus', 'available');
      if (Number.isFinite(versionCode)) setContext('app.apkVersionCode', versionCode);
      if (packageName) setContext('app.packageName', packageName);
      updateDrawer(versionName);
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) scheduleRetry();
      else markUnavailable(error);
    } finally {
      reading = false;
    }
  }

  function refresh() {
    attempt = 0;
    readAppInfo({ force: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
  window.addEventListener('pageshow', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('wander:native-ready', refresh);

  updateDrawer();
  readAppInfo();

  window.WanderNativeAppVersion = Object.freeze({
    refresh,
    getVersion: () => resolvedVersion,
  });
})();
