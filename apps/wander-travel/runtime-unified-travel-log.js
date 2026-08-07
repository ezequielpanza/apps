(() => {
  if (window.WanderUnifiedTravelLog) return;

  const TYPE_LABELS = {
    track: 'Track', event: 'Evento', note: 'Nota',
    walking: 'Caminata', running: 'Carrera', cycling: 'Bicicleta', driving: 'Vehículo',
    sailing: 'Navegación', train: 'Tren', bus: 'Autobús', stationary: 'Estadía', unknown: 'Actividad',
  };
  const DB_NAME = 'wander-track-intelligence';
  const DB_VERSION = 1;
  const EPISODE_MATCH_TOLERANCE_MS = 30 * 60 * 1000;
  const ACTIVITY_JOIN_GAP_MS = 5 * 60 * 1000;
  let rendering = false;
  let lastSignature = '';
  let observer = null;

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function log() { return window.WanderTravelLog || null; }
  function engine() { return window.WanderSessionEngine || null; }
  function todayKey() { return log()?.dayKey?.() || localDay(Date.now()); }
  function localDay(at) {
    const d = new Date(at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function atValue(value, fallback = Date.now()) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  function dayLabel(day) {
    if (day === todayKey()) return 'Hoy';
    const d = new Date(`${day}T12:00:00`);
    return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function timeLabel(at) {
    return new Date(atValue(at)).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  function duration(ms) {
    const min = Math.max(0, Math.round(Number(ms || 0) / 60000));
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
  }
  function distance(m) {
    const value = Math.max(0, Number(m || 0));
    return value < 1000 ? `${Math.round(value)} m` : `${(value / 1000).toFixed(1)} km`;
  }
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
  async function all(store) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(store)) return resolve([]);
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch { return []; }
  }

  function sessionSnapshot() {
    return engine()?.snapshot?.() || {};
  }
  function sessions() {
    const snapshot = sessionSnapshot();
    const rows = [...(snapshot.sessions || [])];
    if (snapshot.active) rows.push(snapshot.active);
    const seen = new Set();
    return rows.filter((session) => {
      const id = session?.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  function activeSessionId() {
    return sessionSnapshot().active?.id || null;
  }
  function sessionStart(session) {
    const segmentStarts = (session?.segments || []).map((segment) => Number(segment?.startedAt)).filter(Number.isFinite);
    return atValue(session?.startedAt || session?.createdAt || Math.min(...segmentStarts), Date.now());
  }
  function sessionEnd(session) {
    if (session?.id === activeSessionId() || session?.status === 'active' || !session?.endedAt) {
      const segmentEnds = (session?.segments || []).map((segment) => Number(segment?.endedAt || segment?.startedAt)).filter(Number.isFinite);
      return Math.max(sessionStart(session), ...segmentEnds, Date.now());
    }
    return atValue(session.endedAt || session.updatedAt, sessionStart(session));
  }
  function sessionTracks() {
    const rows = [];
    sessions().forEach((session) => (session.segments || []).forEach((segment) => {
      if (segment?.type !== 'movement') return;
      rows.push({
        id: segment.id || `segment-${segment.startedAt}`,
        day: localDay(segment.startedAt),
        episodeId: session.id || `session-${segment.startedAt}`,
        startedAt: Number(segment.startedAt || Date.now()),
        endedAt: Number(segment.endedAt || Date.now()),
        durationMs: Math.max(0, Number(segment.endedAt || Date.now()) - Number(segment.startedAt || Date.now())),
        distanceM: Number(segment.distanceM || 0),
        activity: segment.method || 'unknown',
        relevance: 'valid',
        status: segment.endedAt ? 'closed' : 'active',
        source: 'session-engine',
      });
    }));
    return rows;
  }
  function activeIntelligenceTrack() {
    const active = window.WanderTrackIntelligence?.status?.()?.active;
    if (!active?.id || !Number.isFinite(Number(active.startedAt))) return null;
    return {
      ...active,
      day: active.day || localDay(active.startedAt),
      episodeId: active.episodeId || activeSessionId() || null,
      endedAt: Date.now(),
      durationMs: Math.max(0, Date.now() - Number(active.startedAt)),
      status: 'active',
      source: 'track-intelligence-live',
    };
  }

  function entries() {
    const source = log()?.listEntries?.() || [];
    return source.filter((item) => item.kind !== 'session-link').map((item) => ({
      id: item.id,
      type: item.kind === 'note' ? 'note' : 'event',
      day: item.day || localDay(item.at),
      at: atValue(item.at),
      title: item.title || TYPE_LABELS[item.kind] || 'Evento',
      summary: item.summary || '',
      placeName: item.placeName || '',
      source: item.source || 'local',
      sessionId: item.sessionId || null,
      trackId: item.trackId || null,
      raw: item,
    }));
  }
  function activityLabel(activity) {
    return TYPE_LABELS[String(activity || 'unknown').toLowerCase()] || activity || 'Actividad';
  }

  function trackEquivalent(a, b) {
    if (!a || !b || localDay(a.startedAt) !== localDay(b.startedAt)) return false;
    const aStart = Number(a.startedAt || 0);
    const bStart = Number(b.startedAt || 0);
    const aEnd = Number(a.endedAt || aStart);
    const bEnd = Number(b.endedAt || bStart);
    const startClose = Math.abs(aStart - bStart) <= 15000;
    const overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
    const shorter = Math.max(1, Math.min(Math.max(1, aEnd - aStart), Math.max(1, bEnd - bStart)));
    const overlapRatio = overlap / shorter;
    const aDistance = Math.max(0, Number(a.distanceM || 0));
    const bDistance = Math.max(0, Number(b.distanceM || 0));
    const distanceClose = Math.abs(aDistance - bDistance) <= Math.max(30, Math.max(aDistance, bDistance) * 0.25);
    return distanceClose && (startClose || overlapRatio >= 0.8);
  }
  function mergeTracks(dbTracks) {
    const merged = dbTracks.filter((track) => track.status !== 'deleted').map((track) => ({ ...track }));
    sessionTracks().forEach((track) => {
      if (!merged.some((existing) => existing.id === track.id || trackEquivalent(existing, track))) merged.push(track);
    });
    const live = activeIntelligenceTrack();
    if (live && !merged.some((existing) => existing.id === live.id || trackEquivalent(existing, live))) merged.push(live);
    return merged;
  }

  function itemMarkup(item) {
    if (item.type === 'track') {
      const active = item.status === 'active' ? ' · En curso' : '';
      const pending = item.enrichmentStatus === 'pending' || !navigator.onLine;
      return `<article class="utl-item utl-track" data-track-id="${esc(item.id)}"><span class="utl-dot relevance-${esc(item.relevance || 'valid')}"></span><div><strong>${esc(timeLabel(item.startedAt))} · ${esc(duration(item.durationMs))}</strong><p>${esc(distance(item.distanceM))}${active}</p><small>${pending ? 'Datos locales · ubicación pendiente de enriquecer' : 'Datos locales enriquecidos'}</small></div></article>`;
    }
    const when = timeLabel(item.at);
    return `<article class="utl-item utl-${esc(item.type)} utl-event"><span class="utl-symbol">${item.type === 'note' ? '✎' : '•'}</span><div><strong>${esc(item.title)}</strong><p>${esc(when)}${item.placeName ? ` · ${esc(item.placeName)}` : ''}</p>${item.summary ? `<small>${esc(item.summary)}</small>` : ''}</div></article>`;
  }

  function intervalDistance(start, end, episode) {
    const eStart = Number(episode.startedAt || 0);
    const eEnd = Number(episode.endedAt || eStart);
    if (end >= eStart && start <= eEnd) return 0;
    return start > eEnd ? start - eEnd : eStart - end;
  }
  function matchingEpisode(dayNode, start, end = start) {
    const candidates = [...dayNode.episodes.values()]
      .map((episode) => ({ episode, distance: intervalDistance(start, end, episode) }))
      .filter(({ distance }) => distance <= EPISODE_MATCH_TOLERANCE_MS)
      .sort((a, b) => a.distance - b.distance || Number(a.episode.startedAt) - Number(b.episode.startedAt));
    return candidates[0]?.episode || null;
  }

  async function buildDays() {
    const [dbTracks, dbEpisodes] = await Promise.all([all('tracks'), all('episodes')]);
    const mergedTracks = mergeTracks(dbTracks);
    const dayMap = new Map();
    const ensureDay = (day) => {
      if (!dayMap.has(day)) dayMap.set(day, { day, episodes: new Map() });
      return dayMap.get(day);
    };
    const ensureEpisode = (dayNode, id, seed = {}) => {
      if (!dayNode.episodes.has(id)) {
        dayNode.episodes.set(id, {
          id,
          title: seed.title || 'Episodio',
          startedAt: Number(seed.startedAt || Date.now()),
          endedAt: Number(seed.endedAt || seed.startedAt || Date.now()),
          active: seed.active === true,
          tracks: [],
          events: [],
        });
      }
      const episode = dayNode.episodes.get(id);
      episode.startedAt = Math.min(Number(episode.startedAt || seed.startedAt || Date.now()), Number(seed.startedAt || episode.startedAt || Date.now()));
      episode.endedAt = Math.max(Number(episode.endedAt || 0), Number(seed.endedAt || seed.startedAt || episode.endedAt || 0));
      if (seed.active) episode.active = true;
      if (seed.title && episode.title === 'Episodio') episode.title = seed.title;
      return episode;
    };

    const activeId = activeSessionId();
    sessions().forEach((session) => {
      const startedAt = sessionStart(session);
      const endedAt = sessionEnd(session);
      const dayNode = ensureDay(localDay(startedAt));
      const active = session.id === activeId || session.status === 'active';
      ensureEpisode(dayNode, session.id, {
        startedAt,
        endedAt,
        active,
        title: active ? 'Episodio en curso' : 'Episodio',
      });
    });

    dbEpisodes.forEach((stored) => {
      const startedAt = Number(stored.startedAt || Date.now());
      const endedAt = Number(stored.endedAt || startedAt);
      const dayNode = ensureDay(stored.day || localDay(startedAt));
      const matched = matchingEpisode(dayNode, startedAt, endedAt);
      if (matched) {
        if (!matched.active && stored.title && stored.title !== 'Episodio sin nombre') matched.title = stored.title;
        matched.startedAt = Math.min(matched.startedAt, startedAt);
        matched.endedAt = Math.max(matched.endedAt, endedAt);
      } else {
        ensureEpisode(dayNode, stored.id, {
          startedAt,
          endedAt,
          title: stored.title && stored.title !== 'Episodio sin nombre' ? stored.title : 'Episodio',
        });
      }
    });

    mergedTracks.forEach((track) => {
      const startedAt = Number(track.startedAt || Date.now());
      const endedAt = Number(track.endedAt || startedAt);
      const dayNode = ensureDay(track.day || localDay(startedAt));
      let episode = track.episodeId ? dayNode.episodes.get(track.episodeId) : null;
      if (!episode) episode = matchingEpisode(dayNode, startedAt, endedAt);
      if (!episode) {
        const id = track.episodeId || `episode-${dayNode.day}-${startedAt}`;
        episode = ensureEpisode(dayNode, id, {
          startedAt,
          endedAt,
          active: track.status === 'active',
          title: track.status === 'active' ? 'Episodio en curso' : 'Episodio',
        });
      }
      episode.startedAt = Math.min(episode.startedAt, startedAt);
      episode.endedAt = Math.max(episode.endedAt, endedAt);
      if (track.status === 'active') {
        episode.active = true;
        episode.title = 'Episodio en curso';
      }
      if (!episode.tracks.some((existing) => existing.id === track.id || trackEquivalent(existing, track))) {
        episode.tracks.push({ ...track, type: 'track' });
      }
    });

    entries().forEach((item) => {
      const dayNode = ensureDay(item.day);
      let episode = item.sessionId ? dayNode.episodes.get(item.sessionId) : null;
      if (!episode) episode = matchingEpisode(dayNode, item.at, item.at);
      if (!episode) {
        const id = `episode-events-${item.day}`;
        episode = ensureEpisode(dayNode, id, {
          startedAt: item.at,
          endedAt: item.at,
          title: 'Episodio',
        });
      }
      episode.startedAt = Math.min(episode.startedAt, item.at);
      episode.endedAt = Math.max(episode.endedAt, item.at);
      if (!episode.events.some((existing) => existing.id === item.id)) episode.events.push(item);
    });

    ensureDay(todayKey());
    return [...dayMap.values()].sort((a, b) => b.day.localeCompare(a.day));
  }

  function activityNodes(episode) {
    const tracks = [...episode.tracks].sort((a, b) => Number(a.startedAt) - Number(b.startedAt));
    const events = [...episode.events].sort((a, b) => Number(a.at) - Number(b.at));
    const groups = [];
    tracks.forEach((track) => {
      const activity = track.activity || 'unknown';
      const previous = groups[groups.length - 1];
      const start = Number(track.startedAt || 0);
      const previousEnd = Number(previous?.endedAt || 0);
      const eventBetween = previous && events.some((event) => Number(event.at) > previousEnd && Number(event.at) < start);
      if (previous && previous.activity === activity && !eventBetween && start - previousEnd <= ACTIVITY_JOIN_GAP_MS) {
        previous.tracks.push(track);
        previous.endedAt = Math.max(previous.endedAt, Number(track.endedAt || start));
      } else {
        groups.push({
          id: `activity-${episode.id}-${start}-${activity}`,
          activity,
          startedAt: start,
          endedAt: Number(track.endedAt || start),
          tracks: [track],
        });
      }
    });
    return groups;
  }

  function activityMarkup(activity) {
    const tracks = [...activity.tracks].sort((a, b) => Number(a.startedAt) - Number(b.startedAt));
    return `<details class="utl-folder utl-activity" data-tree-key="activity:${esc(activity.id)}"><summary><span>▱</span><strong>${esc(activityLabel(activity.activity))}</strong><small>${tracks.length} track${tracks.length === 1 ? '' : 's'}</small></summary><div>${tracks.map(itemMarkup).join('')}</div></details>`;
  }

  function episodeMarkup(episode) {
    const activities = activityNodes(episode);
    const timeline = [
      ...activities.map((activity) => ({ kind: 'activity', at: activity.startedAt, value: activity })),
      ...episode.events.map((event) => ({ kind: 'event', at: event.at, value: event })),
    ].sort((a, b) => Number(a.at) - Number(b.at));
    const children = timeline.map((item) => item.kind === 'activity' ? activityMarkup(item.value) : itemMarkup(item.value)).join('');
    const eventCount = episode.events.length;
    const metaParts = [];
    if (activities.length) metaParts.push(`${activities.length} actividad${activities.length === 1 ? '' : 'es'}`);
    if (eventCount) metaParts.push(`${eventCount} evento${eventCount === 1 ? '' : 's'}`);
    const meta = episode.active ? 'En curso' : (metaParts.join(' · ') || 'Sin actividad');
    const title = episode.active ? 'Episodio en curso' : (episode.title || 'Episodio');
    return `<details class="utl-folder utl-episode" data-episode-id="${esc(episode.id)}" data-tree-key="episode:${esc(episode.id)}"><summary><span>▰</span><strong>${esc(title)}</strong><small>${esc(meta)}</small></summary><div>${children || '<div class="utl-empty">Sin actividad registrada.</div>'}</div></details>`;
  }

  function dayMarkup(node) {
    const episodes = [...node.episodes.values()].sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0));
    const current = node.day === todayKey();
    const episodeHtml = episodes.map(episodeMarkup).join('');
    const empty = !episodeHtml ? '<div class="utl-empty">Sin actividad registrada todavía.</div>' : '';
    return `<details class="utl-folder utl-day"${current ? ' open' : ''} data-day="${esc(node.day)}" data-tree-key="day:${esc(node.day)}"><summary><span>▰</span><strong>${esc(dayLabel(node.day))}</strong><small>${episodes.length} episodio${episodes.length === 1 ? '' : 's'}</small></summary><div>${episodeHtml}${empty}</div></details>`;
  }

  function injectStyles() {
    if (document.querySelector('#wander-unified-log-styles')) return;
    const style = document.createElement('style');
    style.id = 'wander-unified-log-styles';
    style.textContent = `
      [data-app-screen="travel-log"][data-unified-bitacora="true"] .travel-log-tabs,
      [data-app-screen="travel-log"][data-unified-bitacora="true"] .travel-log-summary,
      [data-app-screen="travel-log"][data-unified-bitacora="true"] .travel-log-toolbar,
      [data-app-screen="travel-log"][data-unified-bitacora="true"] #travel-log-add-form{display:none!important}
      .utl-tree{display:flex;flex-direction:column;gap:8px}.utl-folder{border:1px solid rgba(148,163,184,.23);border-radius:12px;background:rgba(15,23,42,.42);overflow:hidden}.utl-folder .utl-folder{margin:7px;background:rgba(30,41,59,.35)}
      .utl-folder summary{display:flex;align-items:center;gap:8px;padding:11px;list-style:none;cursor:pointer}.utl-folder summary::-webkit-details-marker{display:none}.utl-folder summary strong{flex:1}.utl-folder summary small{opacity:.67;font-size:11px}.utl-folder>div{padding:0 5px 6px}
      .utl-item{display:grid;grid-template-columns:14px 1fr;gap:8px;margin:6px;padding:9px;border-radius:9px;background:rgba(2,6,23,.42)}.utl-item p,.utl-item small{margin:3px 0 0;display:block}.utl-item p{font-size:12px}.utl-item small{font-size:11px;opacity:.68}.utl-dot{width:10px;height:10px;border-radius:50%;margin-top:4px;background:#14b8a6}.utl-dot.relevance-suspect{background:#f59e0b}.utl-dot.relevance-irrelevant{background:#ef4444}.utl-symbol{opacity:.8}.utl-event{margin-left:8px;margin-right:8px}.utl-empty{padding:12px 11px 14px;opacity:.65;font-size:12px}
    `;
    document.head.appendChild(style);
  }

  function cleanLegacyChrome(screen) {
    screen.dataset.unifiedBitacora = 'true';
    for (const selector of ['.travel-log-tabs', '.travel-log-summary', '.travel-log-toolbar', '#travel-log-add-form']) {
      const node = screen.querySelector(selector);
      if (node) node.hidden = true;
    }
  }

  function signatureFor(days) {
    return JSON.stringify({
      online: navigator.onLine,
      days: days.map((day) => [
        day.day,
        [...day.episodes.values()].map((episode) => [
          episode.id,
          episode.active,
          episode.tracks.map((track) => [track.id, track.status, Math.round(Number(track.distanceM || 0)), Number(track.endedAt || 0)]),
          episode.events.map((event) => [event.id, Number(event.at || 0)]),
        ]),
      ]),
    });
  }

  function expansionState(content) {
    const state = new Set();
    content.querySelectorAll('.utl-folder[data-tree-key]').forEach((node) => {
      if (node.open) state.add(node.dataset.treeKey);
    });
    return state;
  }
  function restoreExpansion(content, state) {
    if (!state) return;
    content.querySelectorAll('.utl-folder[data-tree-key]').forEach((node) => {
      node.open = state.has(node.dataset.treeKey);
    });
  }

  async function render(options = {}) {
    if (rendering) return;
    const resetExpansion = options?.resetExpansion === true;
    const screen = document.querySelector('[data-app-screen="travel-log"]');
    const content = screen?.querySelector('#travel-log-content');
    if (!screen || !content) return;
    rendering = true;
    try {
      injectStyles();
      cleanLegacyChrome(screen);
      const days = await buildDays();
      const signature = signatureFor(days);
      if (signature !== lastSignature || !content.querySelector('.utl-tree') || resetExpansion) {
        const expanded = resetExpansion ? null : expansionState(content);
        lastSignature = signature;
        content.innerHTML = `<div class="utl-tree">${days.map(dayMarkup).join('')}</div>`;
        restoreExpansion(content, expanded);
      }
    } finally {
      rendering = false;
    }
  }

  function queueEnrichment() {
    try { localStorage.setItem('wander.travel-log.enrichment.pending.v1', JSON.stringify({ requestedAt: Date.now(), status: 'pending' })); } catch {}
    window.dispatchEvent(new CustomEvent('wander:travel-log-enrichment-requested', { detail: { reason: 'connectivity-restored', at: Date.now() } }));
    lastSignature = '';
    render();
  }

  const refresh = () => render();
  window.addEventListener('online', queueEnrichment);
  window.addEventListener('offline', refresh);
  window.addEventListener('wander:sessions-changed', refresh);
  window.addEventListener('wander:track-finalized', refresh);
  window.addEventListener('wander:travel-log-change', refresh);
  window.addEventListener('wander:screen-change', (event) => {
    if (event.detail?.to === 'travel-log') {
      lastSignature = '';
      setTimeout(() => render({ resetExpansion: true }), 40);
    }
  });

  function start() {
    observer = new MutationObserver(() => {
      const screen = document.querySelector('[data-app-screen="travel-log"]');
      if (screen && !screen.hidden) setTimeout(render, 0);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(render, 15000);
    setTimeout(render, 400);
  }

  window.WanderUnifiedTravelLog = Object.freeze({
    render,
    setFilter: () => { lastSignature = ''; render({ resetExpansion: true }); },
    queueEnrichment,
  });
  start();
})();
