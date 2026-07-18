(() => {
  const context = window.WanderContext;
  if (!context) return;

  const isNative = window.Capacitor?.isNativePlatform?.() === true;
  const plugin = window.Capacitor?.Plugins?.WanderLocation;
  const WEB_VERSION = window.WanderWebVersion || window.WanderVersion || null;

  function setContext(key, value, source = 'runtime-native-app-version') {
    context.set(key, value, {
      source,
      kind: 'observed',
      ttlMs: Infinity,
      confidence: 1,
    });
  }

  function updateDrawer(apkVersion = null) {
    const element = document.querySelector('#drawer-version');
    if (!element) return;
    const labels = [];
    if (WEB_VERSION) labels.push('Web ' + WEB_VERSION);
    if (apkVersion) labels.push('APK ' + apkVersion);
    element.textContent = labels.join(' · ');
  }

  if (!isNative) {
    setContext('app.apkVersion', 'No aplica', 'web-runtime');
    setContext('app.platform', 'web', 'web-runtime');
    updateDrawer();
    return;
  }

  setContext('app.platform', 'android');
  updateDrawer();

  if (typeof plugin?.getAppInfo !== 'function') {
    setContext('app.apkVersion', 'No disponible');
    return;
  }

  Promise.resolve(plugin.getAppInfo())
    .then((info) => {
      const versionName = String(info?.versionName || '').trim();
      const versionCode = Number(info?.versionCode);
      const packageName = String(info?.packageName || '').trim();
      setContext('app.apkVersion', versionName || 'No disponible');
      if (Number.isFinite(versionCode)) setContext('app.apkVersionCode', versionCode);
      if (packageName) setContext('app.packageName', packageName);
      updateDrawer(versionName || null);
    })
    .catch(() => {
      setContext('app.apkVersion', 'No disponible');
    });
})();
