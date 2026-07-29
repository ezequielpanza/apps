(() => {
  const base = window.WanderBase;
  if (!base) return;

  const map = base.map;
  const line = base.route;
  const currentLine = base.currentTrack || null;
  const CURRENT_TRACK_VISIBLE_KEY = 'wander.tracks.current.visible.v1';
  let currentTrackVisible = loadCurrentTrackVisibility();
  let initialized = false;
  let travelLogObserver = null;

  function engine() {
    return window.WanderSessionEngine || null;
  }

  function loadCurrentTrackVisibility() {
    try {
      const stored = localStorage.getItem(CURRENT_TRACK_VISIBLE_KEY);
      return stored == null ? true : stored === 'true';
    } catch {
      return true;
    }
  }

  function persistCurrentTrackVisibility() {
    try { localStorage.setItem(CURRENT_TRACK_VISIBLE_KEY, String(currentTrackVisible)); } catch {}
    window.WanderContext?.set?.('sessions.currentTrackVisible', currentTrackVisible, {
      source: 'tracks-ui',
      kind: 'confirmed',
      confidence: 1,
      ttlMs: Infinity,
    });
  }

  function validPoint(point) {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  function sessionMovementSegments(session) {
    return (session?.segments || [])
      .filter((segment) => segment?.type === 'movement')
      .map((segment) => ({ ...segment, points: (segment.points || []).filter(validPoint) }))
      .filter((segment) => segment.points.length > 0);
  }

  function sessionLatLngSegments(session) {
    return sessionMovementSegments(session)
      .map((segment) => segment.points.map((point) => [Number(point.lat), Number(point.lng)]));
  }

  function currentLatLngs(active) {
    return sessionLatLngSegments(active);
  }

  function syncCurrentTrack(state = null) {
    if (!currentLine) return [];
    const snapshot = state || engine()?.snapshot?.() || null;
    const latLngs = currentTrackVisible ? currentLatLngs(snapshot?.active) : [];
    currentLine.setLatLngs(latLngs);
    return latLngs;
  }

  function setCurrentTrackVisible(visible) {
    currentTrackVisible = Boolean(visible);
    persistCurrentTrackVisibility();
    document.querySelectorAll?.('#session-map-toggle, #travel-log-map-toggle').forEach((toggle) => {
      toggle.checked = currentTrackVisible;
    });
    syncCurrentTrack();
    return currentTrackVisible;
  }

  function sessionById(id) {
    const snapshot = engine()?.snapshot?.();
    if (snapshot?.active?.id === id) return snapshot.active;
    return snapshot?.sessions?.find((session) => session.id === id) || null;
  }

  function movementById(sessionId, segmentId) {
    const session = sessionById(sessionId);
    const segment = (session?.segments || []).find((item) => item?.id === segmentId && item.type === 'movement') || null;
    return { session, segment };
  }

  function showSession(id) {
    const state = engine()?.snapshot?.();
    const session = state?.active?.id === id ? state.active : state?.sessions?.find((item) => item.id === id);
    const segments = sessionLatLngSegments(session);
    const latLngs = segments.flat();
    if (!session || !latLngs.length) {
      window.WanderUI?.showToast?.('Recorrido', 'Todavía no tiene puntos suficientes para mostrar');
      return false;
    }
    if (!(state?.active?.id === id && currentTrackVisible)) line.setLatLngs(segments);
    map.fitBounds?.(latLngs, { padding: [40, 40], maxZoom: 16 });
    return true;
  }

  function xmlEscape(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }

  function safeFilenamePart(value, fallback = 'track') {
    const normalized = String(value || fallback)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72);
    return normalized || fallback;
  }

  function timestampPart(value = Date.now()) {
    const date = new Date(Number(value) || value || Date.now());
    const safe = Number.isFinite(date.getTime()) ? date : new Date();
    return safe.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  }

  function pointExtensions(point) {
    const values = [];
    if (Number.isFinite(Number(point?.accuracy))) values.push(`<wander:accuracy>${Number(point.accuracy).toFixed(1)}</wander:accuracy>`);
    if (Number.isFinite(Number(point?.speedKmh))) values.push(`<wander:speedKmh>${Number(point.speedKmh).toFixed(2)}</wander:speedKmh>`);
    if (Number.isFinite(Number(point?.heading))) values.push(`<wander:heading>${Number(point.heading).toFixed(1)}</wander:heading>`);
    return values.length ? `<extensions>${values.join('')}</extensions>` : '';
  }

  function gpxPoint(point) {
    const lat = Number(point.lat).toFixed(7);
    const lng = Number(point.lng).toFixed(7);
    const at = Number(point.at);
    const time = Number.isFinite(at) ? `<time>${new Date(at).toISOString()}</time>` : '';
    return `<trkpt lat="${lat}" lon="${lng}">${time}${pointExtensions(point)}</trkpt>`;
  }

  function buildGpx({ name = 'Track Wander', description = '', type = '', segments = [] } = {}) {
    const validSegments = segments
      .map((segment) => (segment?.points || segment || []).filter(validPoint))
      .filter((points) => points.length > 0);
    if (!validSegments.length) return null;
    const exportedAt = new Date().toISOString();
    const segmentMarkup = validSegments.map((points) => `<trkseg>${points.map(gpxPoint).join('')}</trkseg>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Wander Travel ${xmlEscape(window.WanderVersion || '')}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:wander="https://wander-travel.pages.dev/gpx/1" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd"><metadata><name>${xmlEscape(name)}</name>${description ? `<desc>${xmlEscape(description)}</desc>` : ''}<time>${exportedAt}</time></metadata><trk><name>${xmlEscape(name)}</name>${description ? `<desc>${xmlEscape(description)}</desc>` : ''}${type ? `<type>${xmlEscape(type)}</type>` : ''}${segmentMarkup}</trk></gpx>`;
  }

  async function saveGpx(content, filename) {
    if (!content) throw new Error('El track no contiene puntos válidos.');
    const nativePlugin = window.Capacitor?.Plugins?.WanderLocation;
    if (window.Capacitor?.isNativePlatform?.() === true && typeof nativePlugin?.saveGpx === 'function') {
      return nativePlugin.saveGpx({ content, filename });
    }
    const blob = new Blob([content], { type: 'application/gpx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body?.appendChild?.(link);
    link.click();
    link.remove?.();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { cancelled: false, filename, native: false };
  }

  function stayLabel(stay, fallback) {
    if (stay?.poiName) return stay.poiName;
    if (stay?.startedAt) {
      return `Detención ${new Date(stay.startedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return fallback;
  }

  function movementLabels(session, segment) {
    const stays = [...(session?.stays || [])].sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0));
    const startedAt = Number(segment?.startedAt || 0);
    const endedAt = Number(segment?.endedAt || Date.now());
    const previousStay = [...stays].reverse().find((stay) => Number(stay.endedAt || Infinity) <= startedAt + 1500) || null;
    const nextStay = stays.find((stay) => Number(stay.startedAt || 0) >= endedAt - 1500) || null;
    return {
      from: stayLabel(previousStay, 'Inicio'),
      to: segment?.endedAt ? stayLabel(nextStay, 'Punto detenido') : 'En movimiento',
    };
  }

  async function exportSegment(session, segment, options = {}) {
    const points = (segment?.points || []).filter(validPoint);
    if (!session || !segment || !points.length) {
      window.WanderUI?.showToast?.('Descargar track', 'El tramo todavía no tiene puntos válidos');
      return { skipped: true, reason: 'empty' };
    }
    const labels = movementLabels(session, segment);
    const name = options.name || `${labels.from} → ${labels.to}`;
    const description = options.description || `${points.length} puntos · ${Math.round(Number(segment.distanceM || 0))} m`;
    const filename = options.filename || `Wander_${timestampPart(segment.startedAt)}_${safeFilenamePart(labels.from)}-${safeFilenamePart(labels.to)}.gpx`;
    const content = buildGpx({ name, description, type: segment.method || 'movement', segments: [segment] });
    try {
      const result = await saveGpx(content, filename);
      if (result?.cancelled) return result;
      window.WanderUI?.showToast?.('Track GPX', 'Archivo preparado correctamente');
      return { ...result, filename, content };
    } catch (error) {
      window.WanderUI?.showToast?.('No se pudo descargar', error?.message || 'Error al crear el archivo GPX');
      return { error };
    }
  }

  async function exportSession(session) {
    const segments = sessionMovementSegments(session);
    if (!session || !segments.length) {
      window.WanderUI?.showToast?.('Exportar', 'Todavía no hay recorridos con puntos');
      return { skipped: true, reason: 'empty' };
    }
    const filename = `Wander_${timestampPart(session.startedAt)}_${safeFilenamePart(session.name, 'sesion')}.gpx`;
    const content = buildGpx({
      name: session.name || 'Sesión Wander',
      description: `${segments.length} tramos · ${Math.round(Number(session.distanceM || 0))} m`,
      type: 'wander-session',
      segments,
    });
    try {
      const result = await saveGpx(content, filename);
      if (result?.cancelled) return result;
      window.WanderUI?.showToast?.('Sesión GPX', 'Archivo preparado correctamente');
      return { ...result, filename, content };
    } catch (error) {
      window.WanderUI?.showToast?.('No se pudo exportar', error?.message || 'Error al crear el archivo GPX');
      return { error };
    }
  }

  function enhanceTravelLogDownloads() {
    const content = document.querySelector?.('#travel-log-content');
    if (!content?.querySelectorAll || typeof document.createElement !== 'function') return 0;
    let added = 0;
    content.querySelectorAll('button.travel-log-movement[data-log-movement]:not([data-gpx-enhanced])').forEach((movement) => {
      movement.dataset.gpxEnhanced = 'true';
      const wrapper = document.createElement('div');
      wrapper.className = 'travel-log-movement-download-row';
      movement.before(wrapper);
      wrapper.appendChild(movement);

      const download = document.createElement('button');
      download.type = 'button';
      download.className = 'travel-log-movement-download';
      download.dataset.logMovementDownload = 'true';
      download.dataset.sessionId = movement.dataset.sessionId || '';
      download.dataset.segmentId = movement.dataset.segmentId || '';
      download.setAttribute('aria-label', 'Descargar track en formato GPX');
      download.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="wander-icons.svg#export"></use></svg><span>GPX</span>';
      download.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const { session, segment } = movementById(download.dataset.sessionId, download.dataset.segmentId);
        exportSegment(session, segment);
      });
      wrapper.appendChild(download);
      added += 1;
    });
    return added;
  }

  function installTravelLogDownloads() {
    enhanceTravelLogDownloads();
    if (!travelLogObserver && typeof MutationObserver === 'function' && document.documentElement) {
      travelLogObserver = new MutationObserver(() => enhanceTravelLogDownloads());
      travelLogObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
    ['wander:screen-change', 'wander:sessions-changed', 'wander:travel-log-change'].forEach((name) => {
      window.addEventListener(name, () => setTimeout(enhanceTravelLogDownloads, 0));
    });
  }

  function render(state = null) {
    syncCurrentTrack(state);
    enhanceTravelLogDownloads();
  }

  function initialize() {
    if (initialized || !engine()) return;
    initialized = true;
    persistCurrentTrackVisibility();
    engine().subscribe?.(render);
    installTravelLogDownloads();
    render();
  }

  window.addEventListener('wander:session-engine-ready', initialize);

  window.WanderTracks = Object.freeze({
    render,
    manage: () => window.WanderTravelLogScreen?.open?.() || window.WanderScreen?.open?.('travel-log'),
    showTrack: showSession,
    exportTrack: exportSession,
    exportSegment,
    buildGpx,
    saveGpx,
    list: () => engine()?.list?.() || [],
    isRecording: () => Boolean(engine()?.isAutoEnabled?.()),
    start: () => engine()?.setAutoEnabled?.(true),
    stop: () => engine()?.finishSession?.('manual'),
    addPoint: () => engine()?.observe?.('legacy-add-point'),
    setCurrentTrackVisible,
    isCurrentTrackVisible: () => currentTrackVisible,
    segmentLatLngs: sessionLatLngSegments,
    enhanceTravelLogDownloads,
  });

  initialize();
})();