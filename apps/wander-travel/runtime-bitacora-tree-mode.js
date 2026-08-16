(() => {
  if (window.WanderBitacoraTreeMode) return;

  const SORT_KEY = 'wander.travelLog.sortOrder.v1';
  const DEFAULT_SORT = 'desc';
  const MIN_JITTER_RADIUS_M = 40;
  const MAX_JITTER_RADIUS_M = 100;
  const SHORT_NOISE_MS = 2 * 60 * 1000;
  let applying = false;

  function loadSortOrder() {
    try { return localStorage.getItem(SORT_KEY) === 'asc' ? 'asc' : DEFAULT_SORT; }
    catch { return DEFAULT_SORT; }
  }

  function saveSortOrder(order) {
    try { localStorage.setItem(SORT_KEY, order === 'asc' ? 'asc' : 'desc'); } catch {}
  }

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function distanceMeters(a, b) {
    if (!a || !b) return 0;
    const lat1 = finite(a.lat);
    const lng1 = finite(a.lng);
    const lat2 = finite(b.lat);
    const lng2 = finite(b.lng);
    if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return 0;
    const radius = 6371000;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 10;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function sessionRows() {
    const snapshot = window.WanderSessionEngine?.snapshot?.() || {};
    const rows = [...(snapshot.sessions || [])];
    if (snapshot.active) rows.push(snapshot.active);
    return rows;
  }

  function segmentLooksLikeGpsJitter(segment) {
    if (!segment || segment.type !== 'movement') return false;
    const startedAt = Number(segment.startedAt || 0);
    const endedAt = Number(segment.endedAt || Date.now());
    const durationMs = Math.max(0, endedAt - startedAt);
    const recordedDistance = Math.max(0, Number(segment.distanceM || 0));
    const points = (Array.isArray(segment.points) ? segment.points : [])
      .filter((point) => finite(point?.lat) !== null && finite(point?.lng) !== null);

    if (points.length <= 1) return durationMs <= SHORT_NOISE_MS && recordedDistance <= 80;

    const accuracies = points
      .map((point) => finite(point.accuracy))
      .filter((value) => value !== null && value > 0 && value <= 180);
    const accuracy = median(accuracies);
    const allowedRadius = Math.max(MIN_JITTER_RADIUS_M, Math.min(MAX_JITTER_RADIUS_M, accuracy * 2.25));
    const center = points.reduce((sum, point) => ({ lat: sum.lat + Number(point.lat), lng: sum.lng + Number(point.lng) }), { lat: 0, lng: 0 });
    center.lat /= points.length;
    center.lng /= points.length;
    const maxRadius = points.reduce((max, point) => Math.max(max, distanceMeters(center, point)), 0);
    const netDisplacement = distanceMeters(points[0], points[points.length - 1]);
    const firstAccuracy = Math.max(0, finite(points[0]?.accuracy) || accuracy);
    const lastAccuracy = Math.max(0, finite(points[points.length - 1]?.accuracy) || accuracy);
    const effectiveNet = Math.max(0, netDisplacement - 0.7 * (firstAccuracy + lastAccuracy));
    const strongSpeedSamples = points.filter((point) => (finite(point.speedKmh) || 0) >= 5).length;

    if (strongSpeedSamples >= 2 && (recordedDistance >= 50 || effectiveNet >= 35)) return false;
    if (durationMs <= SHORT_NOISE_MS && effectiveNet <= 20 && maxRadius <= allowedRadius) return true;
    return strongSpeedSamples === 0 && netDisplacement <= allowedRadius && maxRadius <= allowedRadius && recordedDistance <= allowedRadius * 1.5;
  }

  function jitterSegmentIds() {
    const ids = new Set();
    sessionRows().forEach((session) => (session?.segments || []).forEach((segment) => {
      if (segmentLooksLikeGpsJitter(segment) && segment.id) ids.add(String(segment.id));
    }));
    return ids;
  }

  function stayById() {
    const stays = new Map();
    sessionRows().forEach((session) => (session?.stays || []).forEach((stay) => {
      if (stay?.id) stays.set(String(stay.id), stay);
    }));
    return stays;
  }

  function keyId(details, prefix) {
    const key = String(details?.dataset?.treeKey || '');
    const marker = `episode:${prefix}:`;
    return key.startsWith(marker) ? key.slice(marker.length) : null;
  }

  function parseDistanceM(text) {
    const value = String(text || '').replace(',', '.');
    const km = value.match(/(\d+(?:\.\d+)?)\s*km\b/i);
    if (km) return Number(km[1]) * 1000;
    const m = value.match(/(\d+(?:\.\d+)?)\s*m\b/i);
    return m ? Number(m[1]) : null;
  }

  function markupLooksLikeNoise(episode) {
    const meta = String(episode?.querySelector('.utl-episode-heading > span')?.textContent || '');
    const short = /<\s*1\s*min|\b1\s*min\b/i.test(meta);
    const tracks = [...(episode?.querySelectorAll('.utl-track') || [])];
    if (!tracks.length) return false;
    const distances = tracks.map((track) => parseDistanceM(track.querySelector('small')?.textContent)).filter(Number.isFinite);
    const pointCounts = tracks.map((track) => {
      const match = String(track.querySelector('small')?.textContent || '').match(/(\d+)\s+puntos?/i);
      return match ? Number(match[1]) : null;
    }).filter(Number.isFinite);
    const tinyDistance = distances.length && Math.max(...distances) <= 40;
    const tinyPoints = pointCounts.length && Math.max(...pointCounts) <= 2;
    return short && (tinyDistance || tinyPoints);
  }

  function hideJitterEpisodes(content) {
    const jitter = jitterSegmentIds();
    content.querySelectorAll('details.utl-episode').forEach((episode) => {
      const movementId = keyId(episode, 'movement');
      const hidden = Boolean(movementId && jitter.has(movementId)) ||
        (episode.dataset.episodeKind === 'movement' && markupLooksLikeNoise(episode));
      episode.hidden = hidden;
      episode.dataset.gpsJitter = hidden ? 'true' : 'false';
    });
  }

  function normalizedStayTitle(details) {
    return String(details?.querySelector('.utl-episode-heading strong')?.textContent || '').trim().toLocaleLowerCase('es');
  }

  function sameStay(previous, current, stays) {
    const previousTitle = normalizedStayTitle(previous);
    const currentTitle = normalizedStayTitle(current);
    if (previousTitle && currentTitle && previousTitle === currentTitle && previousTitle.startsWith('en ')) return true;
    const previousStay = stays.get(keyId(previous, 'stay'));
    const currentStay = stays.get(keyId(current, 'stay'));
    if (!previousStay?.center || !currentStay?.center) return false;
    const accuracy = Math.max(Number(previousStay.radiusM || 0), Number(currentStay.radiusM || 0), MIN_JITTER_RADIUS_M);
    return distanceMeters(previousStay.center, currentStay.center) <= Math.min(MAX_JITTER_RADIUS_M, accuracy * 2);
  }

  function moveElements(from, to) {
    const fromHost = from.querySelector('.utl-elements');
    const toHost = to.querySelector('.utl-elements');
    if (!fromHost || !toHost) return;
    [...fromHost.children].forEach((node) => toHost.appendChild(node));
  }

  function clock24(at) {
    const date = new Date(Number(at || Date.now()));
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function mergeDuplicateStays(content) {
    const stays = stayById();
    content.querySelectorAll('.utl-day-body').forEach((body) => {
      let previousVisible = null;
      [...body.querySelectorAll(':scope > details.utl-episode')].forEach((episode) => {
        if (episode.hidden) return;
        if (previousVisible && keyId(previousVisible, 'stay') && keyId(episode, 'stay') && sameStay(previousVisible, episode, stays)) {
          moveElements(episode, previousVisible);
          const previousStay = stays.get(keyId(previousVisible, 'stay'));
          const currentStay = stays.get(keyId(episode, 'stay'));
          const meta = previousVisible.querySelector('.utl-episode-heading > span');
          if (meta && previousStay && currentStay) {
            const start = Math.min(Number(previousStay.startedAt || Date.now()), Number(currentStay.startedAt || Date.now()));
            const end = Math.max(Number(previousStay.endedAt || Date.now()), Number(currentStay.endedAt || Date.now()));
            const minutes = Math.max(0, Math.round((end - start) / 60000));
            const duration = minutes < 1 ? '< 1 min' : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
            meta.textContent = `${clock24(start)}–${currentStay.endedAt ? clock24(end) : 'Ahora'} · ${duration}`;
          }
          episode.hidden = true;
          episode.dataset.mergedStay = 'true';
          return;
        }
        previousVisible = episode;
      });
    });
  }

  function humanize(text) {
    return String(text || '')
      .replace(/\bstationary\b/gi, 'detenido')
      .replace(/\bwalking\b/gi, 'caminando')
      .replace(/\bdriving\b/gi, 'en vehículo')
      .replace(/\bsailing\b/gi, 'navegando')
      .replace(/\bunknown\b/gi, 'sin determinar');
  }

  function hideTechnicalItems(content) {
    content.querySelectorAll('.utl-track').forEach((item) => {
      item.hidden = true;
      item.dataset.technicalTrack = 'true';
    });

    const internalTitles = new Set(['en movimiento', 'permanencia', 'forma de desplazamiento']);
    content.querySelectorAll('.utl-event').forEach((item) => {
      const title = String(item.querySelector('.utl-item-copy strong')?.textContent || '').trim().toLocaleLowerCase('es');
      if (internalTitles.has(title)) {
        item.hidden = true;
        item.dataset.internalContext = 'true';
        return;
      }
      const summary = item.querySelector('.utl-item-copy p');
      if (summary) summary.textContent = humanize(summary.textContent);
    });
  }

  function cleanPoiOscillation(content) {
    content.querySelectorAll('details.utl-episode').forEach((episode) => {
      if (!keyId(episode, 'stay') || episode.hidden) return;
      const heading = String(episode.querySelector('.utl-episode-heading strong')?.textContent || '').replace(/^En\s+/i, '').trim();
      const arrivals = [...episode.querySelectorAll('.utl-event')].filter((item) => {
        const title = String(item.querySelector('.utl-item-copy strong')?.textContent || '').trim().toLocaleLowerCase('es');
        return title === 'llegada' && !item.hidden;
      });
      if (arrivals.length > 1) {
        const matching = arrivals.filter((item) => {
          const text = `${item.querySelector('.utl-item-copy p')?.textContent || ''} ${item.querySelector('.utl-item-copy small')?.textContent || ''}`;
          return heading && text.toLocaleLowerCase('es').includes(heading.toLocaleLowerCase('es'));
        });
        const keep = matching[matching.length - 1] || arrivals[arrivals.length - 1];
        arrivals.forEach((item) => {
          if (item !== keep) {
            item.hidden = true;
            item.dataset.poiOscillation = 'true';
          }
        });
      }
      episode.querySelectorAll('.utl-event').forEach((item) => {
        const title = String(item.querySelector('.utl-item-copy strong')?.textContent || '').trim().toLocaleLowerCase('es');
        if (title === 'salida' && !item.hidden) {
          item.hidden = true;
          item.dataset.poiOscillation = 'true';
        }
      });
    });
  }

  function normalizeClockText(text) {
    return String(text || '').replace(/(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)/gi, (_all, hourRaw, minute, periodRaw) => {
      let hour = Number(hourRaw) % 12;
      const period = periodRaw.toLocaleLowerCase('es').replace(/[.\s]/g, '');
      if (period === 'pm') hour += 12;
      return `${String(hour).padStart(2, '0')}:${minute}`;
    });
  }

  function normalizeClockLabels(content) {
    content.querySelectorAll('.utl-time, .utl-episode-heading > span').forEach((node) => {
      node.textContent = normalizeClockText(node.textContent);
      node.style.whiteSpace = 'nowrap';
    });
  }

  function refreshEpisodeBadges(content) {
    content.querySelectorAll('details.utl-episode').forEach((episode) => {
      const count = [...episode.querySelectorAll(':scope > .utl-elements > .utl-item')].filter((item) => !item.hidden).length;
      const badge = episode.querySelector(':scope > summary > small');
      if (!badge) return;
      badge.hidden = count === 0;
      if (count > 0) badge.textContent = `${count} elemento${count === 1 ? '' : 's'}`;
      const host = episode.querySelector(':scope > .utl-elements');
      if (host) host.hidden = count === 0;
    });
  }

  function timeMinutes(node) {
    const text = String(node?.querySelector('.utl-episode-heading > span, .utl-time')?.textContent || '');
    const match = text.match(/(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
  }

  function sortTree(content, order) {
    const direction = order === 'asc' ? 1 : -1;
    content.querySelectorAll('.utl-day-body').forEach((body) => {
      const episodes = [...body.querySelectorAll(':scope > details.utl-episode')];
      const sorted = [...episodes].sort((a, b) => direction * (timeMinutes(a) - timeMinutes(b)));
      if (episodes.some((node, index) => node !== sorted[index])) sorted.forEach((node) => body.appendChild(node));
    });
    content.querySelectorAll('.utl-elements').forEach((host) => {
      const items = [...host.querySelectorAll(':scope > .utl-item')];
      const sorted = [...items].sort((a, b) => direction * (timeMinutes(a) - timeMinutes(b)));
      if (items.some((node, index) => node !== sorted[index])) sorted.forEach((node) => host.appendChild(node));
    });
  }

  function updateDayCounts(content) {
    content.querySelectorAll('details.utl-day').forEach((day) => {
      const count = [...day.querySelectorAll(':scope > .utl-day-body > details.utl-episode')].filter((episode) => !episode.hidden).length;
      const badge = day.querySelector(':scope > summary > small');
      if (badge) badge.textContent = `${count} episodio${count === 1 ? '' : 's'}`;
    });
  }

  function ensureSortControl(content) {
    let button = content.querySelector('[data-bitacora-sort-toggle]');
    if (button) return button;
    button = document.createElement('button');
    button.type = 'button';
    button.dataset.bitacoraSortToggle = 'true';
    button.className = 'wander-secondary-action';
    button.style.cssText = 'align-self:flex-end;margin:0 0 8px auto;padding:7px 10px;border-radius:999px;font-size:12px;';
    button.addEventListener('click', () => {
      const next = loadSortOrder() === 'desc' ? 'asc' : 'desc';
      saveSortOrder(next);
      applyView();
    });
    const tree = content.querySelector('.utl-tree');
    if (tree) tree.before(button);
    return button;
  }

  function applyView() {
    if (applying) return false;
    const screen = document.querySelector('[data-app-screen="travel-log"]');
    const content = screen?.querySelector('#travel-log-content');
    if (!screen || !content || !content.querySelector('.utl-tree')) return false;
    applying = true;
    try {
      normalizeClockLabels(content);
      hideJitterEpisodes(content);
      mergeDuplicateStays(content);
      hideTechnicalItems(content);
      cleanPoiOscillation(content);
      refreshEpisodeBadges(content);
      const order = loadSortOrder();
      sortTree(content, order);
      updateDayCounts(content);
      const button = ensureSortControl(content);
      if (button) button.textContent = order === 'desc' ? 'Más recientes primero' : 'Más antiguos primero';
      return true;
    } finally {
      applying = false;
    }
  }

  function mount() {
    const screen = document.querySelector('[data-app-screen="travel-log"]');
    const content = screen?.querySelector('#travel-log-content');
    if (!screen || !content) return false;
    content.hidden = false;
    screen.querySelector('#travel-log-tree-host')?.remove();
    window.WanderUnifiedTravelLog?.render?.();
    setTimeout(applyView, 40);
    return true;
  }

  window.addEventListener('wander:screen-change', (event) => {
    if (event.detail?.to === 'travel-log') setTimeout(mount, 0);
  });
  window.addEventListener('wander:sessions-changed', () => setTimeout(mount, 0));
  window.addEventListener('wander:track-finalized', () => setTimeout(mount, 0));
  window.addEventListener('wander:track-cloud-sync', () => setTimeout(mount, 0));

  const observer = new MutationObserver(() => {
    if (applying) return;
    const screen = document.querySelector('[data-app-screen="travel-log"]');
    if (screen && !screen.hidden) setTimeout(applyView, 0);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.WanderBitacoraTreeMode = Object.freeze({
    mount,
    applyView,
    segmentLooksLikeGpsJitter,
    getSortOrder: loadSortOrder,
  });
  setTimeout(mount, 500);
})();