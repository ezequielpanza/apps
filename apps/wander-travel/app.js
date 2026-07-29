(() => {
  const LOCATION_SOURCE_LABELS = Object.freeze({
    gps: 'GPS',
    geolocation: 'GPS',
    network: 'Red',
    fused: 'Combinada',
    passive: 'Pasiva',
    simulator: 'Simulador',
  });

  function locationQualitySnapshot() {
    const context = window.WanderContext;
    const accuracy = Number(context?.value?.('location.effective.accuracy'));
    const provider = String(context?.value?.('location.effective.provider') || context?.value?.('location.effective.source') || '').trim().toLowerCase();
    const permissionPrecision = String(context?.value?.('location.effective.permissionPrecision') || '').trim().toLowerCase();
    return {
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      provider,
      permissionPrecision,
    };
  }

  function accuracyLabel(snapshot) {
    if (snapshot.accuracy === null) return '—';
    const rounded = snapshot.accuracy < 10 ? snapshot.accuracy.toFixed(1) : String(Math.round(snapshot.accuracy));
    if (snapshot.permissionPrecision === 'approximate') return '≈' + rounded + ' m · aproximada';
    if (snapshot.provider === 'network') return rounded + ' m · red';
    return rounded + ' m';
  }

  function renderLocationQualityNow() {
    const snapshot = locationQualitySnapshot();
    const accuracy = document.querySelector('#metric-accuracy');
    if (accuracy) {
      accuracy.textContent = accuracyLabel(snapshot);
      accuracy.title = snapshot.permissionPrecision === 'approximate'
        ? 'Android está entregando ubicación aproximada.'
        : snapshot.provider
          ? 'Proveedor: ' + (LOCATION_SOURCE_LABELS[snapshot.provider] || snapshot.provider)
          : '';
    }
    const source = document.querySelector('#metric-location-source');
    if (source && snapshot.provider) source.textContent = LOCATION_SOURCE_LABELS[snapshot.provider] || snapshot.provider;
  }

  function renderLocationQuality() {
    queueMicrotask(renderLocationQualityNow);
  }

  function ensureStyles(href, marker) {
    if (document.querySelector(`link[data-${marker}]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset[marker.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = 'true';
    document.head.appendChild(link);
  }

  function loadScript(src, marker) {
    const existing = document.querySelector(`script[data-${marker}]`);
    if (existing) return existing.dataset.loaded === 'true'
      ? Promise.resolve()
      : new Promise((resolve) => existing.addEventListener('load', resolve, { once: true }));
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset[marker.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = 'true';
      script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); }, { once: true });
      script.addEventListener('error', reject, { once: true });
      document.head.appendChild(script);
    });
  }

  async function loadCloudBackup() {
    ensureStyles('./wander-cloud-backup.css?v=20260727-01', 'wander-cloud-backup');
    await loadScript('./runtime-cloud-backup.js?v=20260727-01', 'wander-cloud-backup');
    return window.WanderCloudBackup || null;
  }

  async function loadTravelMemory() {
    ensureStyles('./wander-travel-log.css?v=20260728-01', 'wander-travel-log');
    ensureStyles('./wander-travel-timeline.css?v=20260728-01', 'wander-travel-timeline');
    await loadScript('./runtime-travel-log.js?v=20260719-01', 'wander-travel-log');
    await loadScript('./runtime-travel-log-screen.js?v=20260728-01', 'wander-travel-log-screen');
    await loadScript('./runtime-morning-briefing.js?v=20260719-01', 'wander-morning-briefing');
  }

  async function loadDirectionIndicator() {
    ensureStyles('./wander-direction-indicator.css?v=20260722-01', 'wander-direction-indicator');
    await loadScript('./runtime-direction-indicator.js?v=20260728-01', 'wander-direction-indicator');
    await loadScript('./runtime-direction-indicator-settings.js?v=20260722-01', 'wander-direction-indicator-settings');
  }

  async function loadMapCrosshair() {
    ensureStyles('./wander-map-crosshair.css?v=20260728-01', 'wander-map-crosshair');
    await loadScript('./runtime-map-crosshair.js?v=20260728-01', 'wander-map-crosshair');
  }

  async function loadNotificationRouting() {
    await loadScript('./runtime-notification-router.js?v=20260722-01', 'wander-notification-router');
  }

  async function loadMapCacheSettings() {
    await loadScript('./runtime-map-cache-settings.js?v=20260728-01', 'wander-map-cache-settings');
  }

  function reportLoadResult(label, result) {
    if (result.status === 'rejected') console.warn(`${label} could not be loaded`, result.reason);
  }

  function initializeStableDirectionMarker() {
    if (window.WanderStableDirectionMarker) return window.WanderStableDirectionMarker;
    const context = window.WanderContext;
    const map = window.WanderMapCore?.map;
    const L = window.L;
    if (!context || !map || !L || !window.WanderDirectionIndicator) return null;

    const COMPASS_FRESH_MS = 12000;
    const GPS_FRESH_MS = 15000;
    const SOURCE_HOLD_MS = 20000;
    const GPS_SWITCH_MS = 4000;
    const COMPASS_SWITCH_MS = 2500;
    let compass = null;
    let gps = null;
    let marker = null;
    let stableSource = 'none';
    let candidateSource = null;
    let candidateAt = 0;
    let smoothedHeading = null;

    const style = document.createElement('style');
    style.dataset.wanderStableDirection = 'true';
    style.textContent = '.wander-direction-marker{opacity:0!important;pointer-events:none!important}.wander-stable-direction-marker{transition:opacity .18s ease}.wander-stable-direction-marker .wander-direction-arrow{will-change:transform}';
    document.head.appendChild(style);

    function finite(value) {
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }

    function normalized(value) {
      const number = finite(value);
      return number === null ? null : ((number % 360) + 360) % 360;
    }

    function recordCompass(heading, at = Date.now(), confidence = 'medium') {
      const value = normalized(heading);
      if (value === null) return;
      compass = { heading: value, at: Number(at) || Date.now(), confidence };
    }

    function recordGps(location = context.getEffectiveLocation?.(), at = Date.now()) {
      const heading = normalized(location?.heading);
      if (heading === null) return;
      gps = { heading, at: Date.parse(location?.updatedAt || '') || at, confidence: 'medium' };
    }

    function sourceFresh(source, now, hold = false) {
      const sample = source === 'compass' ? compass : gps;
      if (!sample) return false;
      const maximumAge = hold ? SOURCE_HOLD_MS : source === 'compass' ? COMPASS_FRESH_MS : GPS_FRESH_MS;
      return now - sample.at <= maximumAge;
    }

    function desiredSource(now) {
      const config = window.WanderDirectionIndicator?.getConfig?.() || {};
      if (config.enabled === false) return 'none';
      const motion = String(context.value('motion.status') || 'pending').toLowerCase();
      const speed = finite(context.value('motion.speedKmh')) ?? finite(context.value('direction.speedKmh')) ?? 0;
      const moving = motion === 'moving';
      if (moving && sourceFresh('gps', now)) return 'gps';
      if (config.magneticEnabled !== false && sourceFresh('compass', now)) return 'compass';
      if (moving && sourceFresh('gps', now, true)) return 'gps';
      if (config.magneticEnabled !== false && motion !== 'moving' && sourceFresh('compass', now, true)) return 'compass';
      if (speed >= 3 && sourceFresh('gps', now, true)) return 'gps';
      return 'none';
    }

    function stabilizeSource(desired, now) {
      if (desired === stableSource) {
        candidateSource = null;
        candidateAt = 0;
        return stableSource;
      }
      if (desired === 'none' && stableSource !== 'none' && sourceFresh(stableSource, now, true)) return stableSource;
      if (stableSource === 'none' && desired !== 'none') {
        stableSource = desired;
        candidateSource = null;
        return stableSource;
      }
      if (candidateSource !== desired) {
        candidateSource = desired;
        candidateAt = now;
        return stableSource;
      }
      const required = desired === 'gps' ? GPS_SWITCH_MS : desired === 'compass' ? COMPASS_SWITCH_MS : 1500;
      if (now - candidateAt >= required) {
        stableSource = desired;
        candidateSource = null;
        candidateAt = 0;
        smoothedHeading = null;
      }
      return stableSource;
    }

    function currentPoint() {
      const location = context.getEffectiveLocation?.();
      const lat = finite(location?.lat);
      const lng = finite(location?.lng);
      return lat === null || lng === null ? null : L.latLng(lat, lng);
    }

    function smooth(heading, source) {
      const value = normalized(heading);
      if (value === null) return null;
      if (smoothedHeading === null) {
        smoothedHeading = value;
        return value;
      }
      const delta = ((value - smoothedHeading + 540) % 360) - 180;
      smoothedHeading = normalized(smoothedHeading + delta * (source === 'compass' ? .2 : .45));
      return smoothedHeading;
    }

    function icon() {
      return L.divIcon({
        className: 'wander-stable-direction-marker',
        html: '<div class="wander-direction-arrow" aria-hidden="true"><svg viewBox="0 0 36 36"><path d="M18 2 30 28 18 22 6 28Z"></path></svg></div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
    }

    function removeMarker() {
      if (!marker) return;
      map.removeLayer(marker);
      marker = null;
    }

    function render(now = Date.now()) {
      const source = stabilizeSource(desiredSource(now), now);
      const sample = source === 'compass' ? compass : source === 'gps' ? gps : null;
      const point = currentPoint();
      if (!sample || !point || !sourceFresh(source, now, true)) {
        removeMarker();
        return;
      }
      const heading = smooth(sample.heading, source);
      if (heading === null) return removeMarker();
      if (!marker) marker = L.marker(point, { icon: icon(), interactive: false, keyboard: false, zIndexOffset: 960 }).addTo(map);
      else marker.setLatLng(point);
      const element = marker.getElement?.();
      const arrow = element?.querySelector?.('.wander-direction-arrow');
      if (arrow) arrow.style.transform = `rotate(${heading}deg)`;
      if (element) {
        element.dataset.directionSource = source;
        element.dataset.directionStable = 'true';
      }
    }

    const initialCompass = context.value('direction.compass.heading');
    if (finite(initialCompass) !== null) recordCompass(initialCompass);
    recordGps();

    context.subscribe((key, entry) => {
      if (key === 'direction.compass.heading') recordCompass(entry?.value ?? context.value(key));
      if (key === 'location.effective' || key.startsWith('location.effective.')) recordGps();
      if (key === 'motion.status' || key === 'motion.speedKmh' || key.startsWith('direction.')) render();
    });
    window.addEventListener('wander:direction-change', (event) => {
      const detail = event.detail || {};
      if (detail.source === 'compass') recordCompass(detail.heading, Date.now(), detail.confidence);
      if (detail.source === 'gps') gps = { heading: normalized(detail.heading), at: Date.now(), confidence: detail.confidence };
      render();
    });
    const timer = setInterval(() => render(), 500);

    window.WanderStableDirectionMarker = Object.freeze({
      render,
      getState: () => ({ source: stableSource, candidateSource, compass: compass ? { ...compass } : null, gps: gps ? { ...gps } : null }),
      destroy() { clearInterval(timer); removeMarker(); style.remove(); },
    });
    render();
    return window.WanderStableDirectionMarker;
  }

  function initializeRecentTracks() {
    if (window.WanderRecentTracks) return window.WanderRecentTracks;
    const map = window.WanderMapCore?.map;
    const L = window.L;
    const engine = window.WanderSessionEngine;
    if (!map || !L || !engine) return null;

    const STORAGE_KEY = 'wander.tracks.recent.window.v1';
    const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
    const OPTIONS = Object.freeze([
      { value: 0, label: 'No mostrar' },
      { value: 60 * 60 * 1000, label: 'Última hora' },
      { value: 3 * 60 * 60 * 1000, label: 'Últimas 3 horas' },
      { value: 6 * 60 * 60 * 1000, label: 'Últimas 6 horas' },
      { value: 12 * 60 * 60 * 1000, label: 'Últimas 12 horas' },
      { value: 24 * 60 * 60 * 1000, label: 'Últimas 24 horas' },
      { value: 3 * 24 * 60 * 60 * 1000, label: 'Últimos 3 días' },
      { value: 7 * 24 * 60 * 60 * 1000, label: 'Últimos 7 días' },
      { value: -1, label: 'Todos los recorridos' },
    ]);
    let windowMs = loadWindow();

    function loadWindow() {
      try {
        const stored = Number(localStorage.getItem(STORAGE_KEY));
        return OPTIONS.some((option) => option.value === stored) ? stored : DEFAULT_WINDOW_MS;
      } catch { return DEFAULT_WINDOW_MS; }
    }

    function persist() {
      try { localStorage.setItem(STORAGE_KEY, String(windowMs)); } catch {}
      window.WanderContext?.set?.('sessions.recentTrackWindowMs', windowMs, {
        source: 'recent-tracks', kind: 'confirmed', confidence: 1, ttlMs: Infinity,
      });
    }

    if (!map.getPane('wander-recent-tracks-pane')) {
      map.createPane('wander-recent-tracks-pane');
      const pane = map.getPane('wander-recent-tracks-pane');
      pane.style.zIndex = '445';
      pane.style.pointerEvents = 'none';
    }
    const line = L.polyline([], {
      pane: 'wander-recent-tracks-pane',
      color: '#087f75',
      weight: 4,
      opacity: .48,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    }).addTo(map);

    function validPoints(segment) {
      const points = (segment?.points || []).filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)));
      return window.WanderTracks?.displayLatLngs?.(points) || points.map((point) => [Number(point.lat), Number(point.lng)]);
    }

    function recentSegments(snapshot = engine.snapshot?.()) {
      if (!snapshot || windowMs === 0) return [];
      const sessions = [...(snapshot.sessions || [])];
      if (snapshot.active) sessions.push(snapshot.active);
      const cutoff = windowMs < 0 ? -Infinity : Date.now() - windowMs;
      const segments = [];
      sessions.forEach((session) => {
        (session?.segments || []).forEach((segment) => {
          if (segment?.type !== 'movement' || !segment.endedAt || Number(segment.endedAt) < cutoff) return;
          const points = validPoints(segment);
          if (points.length >= 2) segments.push({ endedAt: Number(segment.endedAt), points });
        });
      });
      return segments.sort((a, b) => a.endedAt - b.endedAt).slice(-300).map((item) => item.points);
    }

    function refresh(snapshot = null) {
      const segments = recentSegments(snapshot || engine.snapshot?.());
      line.setLatLngs(segments);
      const select = document.querySelector('#travel-log-recent-tracks-window');
      if (select && select.value !== String(windowMs)) select.value = String(windowMs);
      return segments;
    }

    function setWindow(value) {
      const numeric = Number(value);
      windowMs = OPTIONS.some((option) => option.value === numeric) ? numeric : DEFAULT_WINDOW_MS;
      persist();
      refresh();
      return windowMs;
    }

    function ensureControl() {
      const recorder = document.querySelector('[data-app-screen="travel-log"] .travel-log-recorder');
      if (!recorder || recorder.querySelector('#travel-log-recent-tracks-window')) return Boolean(recorder);
      const row = document.createElement('label');
      row.className = 'travel-log-recent-tracks-control';
      row.innerHTML = `<span><strong>Mostrar en el mapa</strong><small>Recorridos finalizados dentro del período elegido</small></span><select id="travel-log-recent-tracks-window" aria-label="Mostrar recorridos recientes en el mapa">${OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}</select>`;
      const details = recorder.querySelector('.travel-log-recording-details');
      recorder.insertBefore(row, details || null);
      row.querySelector('select').value = String(windowMs);
      row.querySelector('select').addEventListener('change', (event) => setWindow(event.target.value));
      return true;
    }

    const style = document.createElement('style');
    style.dataset.wanderRecentTracks = 'true';
    style.textContent = '.travel-log-recent-tracks-control{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;margin-top:10px;padding:11px 12px;border-radius:14px;background:rgba(127,127,127,.08)}.travel-log-recent-tracks-control span{display:grid;gap:2px}.travel-log-recent-tracks-control small{opacity:.68;line-height:1.25}.travel-log-recent-tracks-control select{max-width:180px}@media(max-width:430px){.travel-log-recent-tracks-control{grid-template-columns:1fr}.travel-log-recent-tracks-control select{max-width:none;width:100%}}';
    document.head.appendChild(style);

    persist();
    engine.subscribe?.((snapshot) => refresh(snapshot));
    window.addEventListener('wander:track-smoothing-changed', () => refresh());
    window.addEventListener('wander:screen-change', (event) => {
      if (event.detail?.to === 'travel-log') setTimeout(() => { ensureControl(); refresh(); }, 0);
    });
    window.addEventListener('wander:travel-log-ready', () => setTimeout(ensureControl, 0));
    const timer = setInterval(() => { ensureControl(); refresh(); }, 60000);
    ensureControl();
    refresh();

    window.WanderRecentTracks = Object.freeze({
      refresh,
      setWindow,
      getWindow: () => windowMs,
      options: () => OPTIONS.map((option) => ({ ...option })),
      destroy() { clearInterval(timer); map.removeLayer(line); style.remove(); },
    });
    return window.WanderRecentTracks;
  }

  async function initialize() {
    const cloudBootstrap = loadCloudBackup()
      .then((cloud) => cloud?.bootstrap?.() || null)
      .catch((error) => {
        console.warn('Wander cloud backup could not be initialized', error);
        return { error };
      });

    const localResults = await Promise.allSettled([
      loadDirectionIndicator(),
      loadMapCrosshair(),
      loadTravelMemory(),
      loadMapCacheSettings(),
      loadNotificationRouting(),
    ]);
    reportLoadResult('Wander direction indicator', localResults[0]);
    reportLoadResult('Wander map crosshair', localResults[1]);
    reportLoadResult('Wander travel memory', localResults[2]);
    reportLoadResult('Wander map cache settings', localResults[3]);
    reportLoadResult('Wander notification routing', localResults[4]);

    initializeStableDirectionMarker();
    initializeRecentTracks();

    window.WanderProviders?.nearby?.configure?.({
      sources: ['google-places', 'openstreetmap', 'wikidata'],
    });

    window.WanderProviders?.nearby?.refresh?.(true);
    window.WanderProviders?.container?.refresh?.(true);
    window.WanderProviders?.googleContainer?.apply?.();
    window.WanderProviders?.currentPOI?.detect?.();
    window.WanderProviders?.currentContainerBridge?.apply?.();
    window.WanderCurrentPOIMotionGuard?.enforce?.();
    window.WanderContextDashboard?.restore?.();
    renderLocationQuality();
    window.WanderSituationEngine?.evaluate?.();
    window.WanderSessionEngine?.observe?.('app-ready');

    window.WanderAppReady = true;
    window.dispatchEvent(new CustomEvent('wander:app-ready', {
      detail: { at: Date.now(), version: window.WanderVersion },
    }));

    cloudBootstrap.then((cloudResult) => {
      if (cloudResult?.reloading) return;
      window.WanderCloudBackup?.start?.();
    });
  }

  window.WanderContext?.subscribe((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) renderLocationQuality();
  });
  window.addEventListener('wander:screen-change', renderLocationQuality);
  window.WanderLocationQualityUI = Object.freeze({ render: renderLocationQuality, snapshot: locationQualitySnapshot });

  window.addEventListener('load', () => {
    requestAnimationFrame(() => requestAnimationFrame(initialize));
  }, { once: true });

  if (!('serviceWorker' in navigator)) return;

  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloadingForUpdate = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    const build = encodeURIComponent(window.WanderVersion || 'development');
    navigator.serviceWorker.register('./sw.js?build=' + build, { updateViaCache: 'none' }).then((registration) => {
      registration.update().catch(() => {});
      if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    }).catch(() => {});
  }, { once: true });
})();
