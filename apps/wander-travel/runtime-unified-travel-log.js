(() => {
  if (window.WanderUnifiedTravelLog) return;

  const INTELLIGENCE_DB = 'wander-track-intelligence';
  const HISTORY_DB = 'wander-track-history';
  const DB_VERSION = 1;
  const EPISODE_MATCH_TOLERANCE_MS = 30 * 60 * 1000;
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
    const d = new Date(Number(at || Date.now()));
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
  function rangeLabel(startedAt, endedAt, active = false) {
    const start = timeLabel(startedAt);
    return `${start}–${active ? 'Ahora' : timeLabel(endedAt || startedAt)}`;
  }
  function duration(ms) {
    const min = Math.max(0, Math.round(Number(ms || 0) / 60000));
    if (min < 1) return '< 1 min';
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
  }
  function distance(m) {
    const value = Math.max(0, Number(m || 0));
    return value < 1000 ? `${Math.round(value)} m` : `${(value / 1000).toFixed(1)} km`;
  }
  function trackName(at) {
    const d = new Date(Number(at || Date.now()));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function openDb(name, storeName) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        if (name !== HISTORY_DB) return;
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'id' });
          store.createIndex('startedAt', 'startedAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
  }
  async function allFrom(name, storeName) {
    try {
      const db = await openDb(name, storeName);
      if (!db.objectStoreNames.contains(storeName)) return [];
      return await new Promise((resolve, reject) => {
        const request = db.transaction(storeName).objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch { return []; }
  }

  function snapshot() { return engine()?.snapshot?.() || {}; }
  function sessions() {
    const state = snapshot();
    const rows = [...(state.sessions || [])];
    if (state.active) rows.push(state.active);
    const seen = new Set();
    return rows.filter((session) => session?.id && !seen.has(session.id) && seen.add(session.id));
  }
  function activeSessionId() { return snapshot().active?.id || null; }

  function movementTitle(method) {
    const value = String(method || 'unknown').toLowerCase();
    if (['walking', 'walk', 'on-foot', 'foot', 'caminando'].includes(value)) return 'Caminando';
    if (['running', 'run'].includes(value)) return 'Corriendo';
    if (['cycling', 'bicycle', 'bike'].includes(value)) return 'En bicicleta';
    if (['boat', 'sailing', 'motorboat'].includes(value)) return 'Navegando';
    if (value === 'train') return 'Viajando en tren';
    if (value === 'bus') return 'Viajando en autobús';
    if (['car', 'driving', 'vehicle'].includes(value)) return 'Viajando';
    return 'Viajando';
  }
  function stayTitle(episode) {
    const text = episode.elements.map((item) => `${item.title || ''} ${item.summary || ''}`).join(' ').toLowerCase();
    if (episode.overnight && Number(episode.endedAt || Date.now()) - Number(episode.startedAt || 0) >= 3 * 60 * 60 * 1000) return 'Durmiendo';
    if (/\b(desayun|almuerz|cen|comiend|comer|restaurant|café|cafe)\b/i.test(text)) return 'Comiendo';
    if (/\b(descans|pausa|relaj)\b/i.test(text)) return 'Descansando';
    if (episode.placeName) return `En ${episode.placeName}`;
    return 'Permanencia';
  }
  function episodeTitle(episode) {
    if (episode.kind === 'movement') return movementTitle(episode.activity);
    if (episode.kind === 'stay') return stayTitle(episode);
    if (episode.activity && episode.activity !== 'unknown') return movementTitle(episode.activity);
    return episode.active ? 'Episodio en curso' : 'Episodio';
  }

  function entryRows() {
    return (log()?.listEntries?.() || [])
      .filter((item) => item.kind !== 'session-link')
      .map((item) => ({
        id: item.id,
        type: 'event',
        entryKind: item.kind || 'event',
        day: item.day || localDay(item.at),
        at: atValue(item.at),
        title: item.title || 'Evento',
        summary: item.summary || '',
        placeName: item.placeName || '',
        source: item.source || 'local',
        sessionId: item.sessionId || null,
        interactionId: item.interactionId || null,
        raw: item,
      }));
  }

  function trackEquivalent(a, b) {
    if (!a || !b || localDay(a.startedAt) !== localDay(b.startedAt)) return false;
    if (a.id && b.id && a.id === b.id) return true;
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
    return (startClose || overlapRatio >= .8) && Math.abs(aDistance - bDistance) <= Math.max(30, Math.max(aDistance, bDistance) * .3);
  }

  function sessionTracks() {
    const rows = [];
    sessions().forEach((session) => (session.segments || []).forEach((segment) => {
      if (segment?.type !== 'movement') return;
      const startedAt = Number(segment.startedAt || Date.now());
      const endedAt = Number(segment.endedAt || Date.now());
      rows.push({
        id: segment.id || `movement-${startedAt}`,
        name: segment.name || trackName(startedAt),
        type: 'track',
        day: localDay(startedAt),
        sessionId: session.id || null,
        startedAt,
        endedAt,
        durationMs: Math.max(0, endedAt - startedAt),
        distanceM: Number(segment.distanceM || 0),
        activity: segment.method || 'unknown',
        relevance: 'valid',
        status: segment.endedAt ? 'closed' : 'active',
        points: Array.isArray(segment.points) ? segment.points : [],
        source: 'session-engine',
      });
    }));
    return rows;
  }

  function mergeTracks(...sources) {
    const merged = [];
    sources.flat().filter(Boolean).forEach((raw) => {
      if (raw.status === 'deleted') return;
      const track = {
        ...raw,
        type: 'track',
        name: raw.name || trackName(raw.startedAt),
        day: raw.day || localDay(raw.startedAt),
      };
      const existing = merged.find((candidate) => trackEquivalent(candidate, track));
      if (!existing) {
        merged.push(track);
        return;
      }
      const incomingPoints = Array.isArray(track.points) ? track.points.length : 0;
      const existingPoints = Array.isArray(existing.points) ? existing.points.length : 0;
      if (incomingPoints > existingPoints || Number(track.updatedAt || track.endedAt || 0) > Number(existing.updatedAt || existing.endedAt || 0)) {
        Object.assign(existing, track);
      }
    });
    return merged;
  }

  function ensureDay(map, day) {
    if (!map.has(day)) map.set(day, { day, episodes: new Map() });
    return map.get(day);
  }
  function ensureEpisode(dayNode, id, seed = {}) {
    if (!dayNode.episodes.has(id)) {
      dayNode.episodes.set(id, {
        id,
        sessionId: seed.sessionId || null,
        kind: seed.kind || 'inferred',
        activity: seed.activity || 'unknown',
        startedAt: Number(seed.startedAt || Date.now()),
        endedAt: Number(seed.endedAt || seed.startedAt || Date.now()),
        active: seed.active === true,
        placeName: seed.placeName || '',
        overnight: seed.overnight === true,
        elements: [],
      });
    }
    const episode = dayNode.episodes.get(id);
    episode.startedAt = Math.min(episode.startedAt, Number(seed.startedAt || episode.startedAt));
    episode.endedAt = Math.max(episode.endedAt, Number(seed.endedAt || seed.startedAt || episode.endedAt));
    if (seed.active) episode.active = true;
    if (seed.placeName) episode.placeName = seed.placeName;
    if (seed.activity && episode.activity === 'unknown') episode.activity = seed.activity;
    return episode;
  }

  function sessionEpisodes(dayMap) {
    const activeId = activeSessionId();
    sessions().forEach((session) => {
      const activeSession = session.id === activeId || session.status === 'active';
      (session.segments || []).forEach((segment) => {
        if (segment?.type !== 'movement') return;
        const startedAt = Number(segment.startedAt || Date.now());
        const endedAt = Number(segment.endedAt || Date.now());
        const dayNode = ensureDay(dayMap, localDay(startedAt));
        ensureEpisode(dayNode, `movement:${segment.id || startedAt}`, {
          sessionId: session.id,
          kind: 'movement',
          activity: segment.method || 'unknown',
          startedAt,
          endedAt,
          active: activeSession && !segment.endedAt,
        });
      });
      (session.stays || []).forEach((stay) => {
        const startedAt = Number(stay.startedAt || Date.now());
        const endedAt = Number(stay.endedAt || Date.now());
        const dayNode = ensureDay(dayMap, localDay(startedAt));
        ensureEpisode(dayNode, `stay:${stay.id || startedAt}`, {
          sessionId: session.id,
          kind: 'stay',
          startedAt,
          endedAt,
          active: activeSession && !stay.endedAt,
          placeName: stay.poiName || '',
          overnight: stay.overnight === true || stay.overnightCandidate === true,
        });
      });
    });
  }

  function intervalDistance(start, end, episode) {
    const eStart = Number(episode.startedAt || 0);
    const eEnd = Number(episode.endedAt || eStart);
    if (end >= eStart && start <= eEnd) return 0;
    return start > eEnd ? start - eEnd : eStart - end;
  }
  function matchingEpisode(dayNode, start, end = start, sessionId = null) {
    const candidates = [...dayNode.episodes.values()]
      .map((episode) => ({
        episode,
        distance: intervalDistance(start, end, episode),
        sameSession: Boolean(sessionId && episode.sessionId === sessionId),
      }))
      .filter(({ distance }) => distance <= EPISODE_MATCH_TOLERANCE_MS)
      .sort((a, b) => Number(b.sameSession) - Number(a.sameSession) || a.distance - b.distance || a.episode.startedAt - b.episode.startedAt);
    return candidates[0]?.episode || null;
  }

  async function buildDays() {
    const [intelligenceTracks, historyTracks] = await Promise.all([
      allFrom(INTELLIGENCE_DB, 'tracks'),
      allFrom(HISTORY_DB, 'tracks'),
    ]);
    const tracks = mergeTracks(historyTracks, sessionTracks(), intelligenceTracks);
    const dayMap = new Map();
    sessionEpisodes(dayMap);

    tracks.forEach((track) => {
      const start = Number(track.startedAt || Date.now());
      const end = Number(track.endedAt || start);
      const dayNode = ensureDay(dayMap, track.day || localDay(start));
      let episode = matchingEpisode(dayNode, start, end, track.sessionId || null);
      if (!episode) {
        episode = ensureEpisode(dayNode, `track:${track.id || start}`, {
          sessionId: track.sessionId || null,
          kind: 'movement',
          activity: track.activity || 'unknown',
          startedAt: start,
          endedAt: end,
          active: track.status === 'active',
        });
      }
      episode.startedAt = Math.min(episode.startedAt, start);
      episode.endedAt = Math.max(episode.endedAt, end);
      if (track.status === 'active') episode.active = true;
      if (!episode.elements.some((item) => item.type === 'track' && trackEquivalent(item, track))) episode.elements.push(track);
    });

    entryRows().forEach((event) => {
      const dayNode = ensureDay(dayMap, event.day);
      let episode = matchingEpisode(dayNode, event.at, event.at, event.sessionId);
      if (!episode) {
        episode = ensureEpisode(dayNode, `event:${event.id}`, {
          sessionId: event.sessionId,
          kind: 'event',
          startedAt: event.at,
          endedAt: event.at,
        });
      }
      if (!episode.elements.some((item) => item.type === 'event' && item.id === event.id)) episode.elements.push(event);
      if (event.placeName && !episode.placeName) episode.placeName = event.placeName;
    });

    ensureDay(dayMap, todayKey());
    return [...dayMap.values()].sort((a, b) => b.day.localeCompare(a.day));
  }

  function eventIcon(kind) {
    if (kind === 'conversation') return 'W';
    if (kind === 'decision') return '✓';
    if (kind === 'note') return '✎';
    if (kind === 'place') return '⌖';
    if (kind === 'weather') return '☁';
    return '•';
  }
  function itemMarkup(item) {
    if (item.type === 'track') {
      const active = item.status === 'active';
      const points = Array.isArray(item.points) ? item.points.length : Number(item.pointCount || 0);
      return `<article class="utl-item utl-track" data-track-id="${esc(item.id)}"><time class="utl-time">${esc(timeLabel(item.startedAt))}</time><span class="utl-item-icon utl-track-icon">↝</span><div class="utl-item-copy"><strong>${esc(item.name || trackName(item.startedAt))}</strong><p>${esc(rangeLabel(item.startedAt, item.endedAt, active))} · ${esc(duration(item.durationMs || (Number(item.endedAt || Date.now()) - Number(item.startedAt || Date.now()))))}</p><small>${esc(distance(item.distanceM))}${active ? ' · En curso' : ''}${points ? ` · ${points} puntos` : ''}</small></div></article>`;
    }
    return `<article class="utl-item utl-event"><time class="utl-time">${esc(timeLabel(item.at))}</time><span class="utl-item-icon">${esc(eventIcon(item.entryKind))}</span><div class="utl-item-copy"><strong>${esc(item.title)}</strong>${item.summary ? `<p>${esc(item.summary)}</p>` : ''}${item.placeName ? `<small>${esc(item.placeName)}</small>` : ''}</div></article>`;
  }

  function episodeMarkup(episode) {
    const elements = [...episode.elements].sort((a, b) => Number(a.startedAt || a.at || 0) - Number(b.startedAt || b.at || 0));
    const title = episodeTitle({ ...episode, elements });
    const end = episode.active ? Date.now() : episode.endedAt;
    const meta = `${rangeLabel(episode.startedAt, end, episode.active)} · ${duration(Number(end || Date.now()) - Number(episode.startedAt || Date.now()))}`;
    const place = episode.placeName ? `<span class="utl-episode-place">${esc(episode.placeName)}</span>` : '';
    return `<details class="utl-episode${episode.active ? ' is-active' : ''}" data-tree-key="episode:${esc(episode.id)}" data-episode-kind="${esc(episode.kind)}"><summary><span class="utl-chevron" aria-hidden="true">›</span><div class="utl-episode-heading"><strong>${esc(title)}</strong><span>${esc(meta)}</span>${place}</div><small>${elements.length} elemento${elements.length === 1 ? '' : 's'}</small></summary><div class="utl-elements">${elements.map(itemMarkup).join('') || '<div class="utl-empty">Sin elementos registrados.</div>'}</div></details>`;
  }

  function dayMarkup(node) {
    const episodes = [...node.episodes.values()].sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0));
    const current = node.day === todayKey();
    return `<details class="utl-day"${current ? ' open' : ''} data-day="${esc(node.day)}" data-tree-key="day:${esc(node.day)}"><summary><span class="utl-chevron" aria-hidden="true">›</span><strong>${esc(dayLabel(node.day))}</strong><small>${episodes.length} episodio${episodes.length === 1 ? '' : 's'}</small></summary><div class="utl-day-body">${episodes.map(episodeMarkup).join('') || '<div class="utl-empty">Sin actividad registrada todavía.</div>'}</div></details>`;
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
      [data-app-screen="travel-log"] #travel-log-content{color:#0f172a}
      .utl-tree{display:flex;flex-direction:column;gap:18px;padding:2px 0 24px}
      .utl-day{border:0;background:transparent;overflow:visible}
      .utl-day>summary{display:flex;align-items:center;gap:10px;padding:8px 2px 13px;border-bottom:1px solid #dfe5ea;list-style:none;cursor:pointer;color:#0f172a}
      .utl-day>summary::-webkit-details-marker,.utl-episode>summary::-webkit-details-marker{display:none}
      .utl-day>summary strong{flex:1;font-size:20px;letter-spacing:-.02em}.utl-day>summary small{font-size:12px;color:#64748b;font-weight:600}
      .utl-day-body{display:grid;gap:12px;padding-top:12px}
      .utl-chevron{display:inline-grid;place-items:center;width:20px;height:20px;color:#64748b;font-size:23px;line-height:1;transition:transform .16s ease;transform-origin:center}
      details[open]>summary>.utl-chevron{transform:rotate(90deg)}
      .utl-episode{border:1px solid #e3e8ed;border-radius:18px;background:#fff;box-shadow:0 3px 14px rgba(15,23,42,.055);overflow:hidden}
      .utl-episode.is-active{border-color:rgba(1,224,203,.62);box-shadow:0 4px 18px rgba(1,224,203,.12)}
      .utl-episode>summary{display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;gap:10px;padding:15px 15px 14px;list-style:none;cursor:pointer;color:#0f172a}
      .utl-episode-heading{display:grid;gap:3px;min-width:0}.utl-episode-heading strong{font-size:17px;letter-spacing:-.015em}.utl-episode-heading>span{font-size:12px;color:#64748b}.utl-episode-place{color:#0f766e!important;font-weight:650}
      .utl-episode>summary>small{align-self:start;padding:4px 8px;border-radius:999px;background:#f1f5f9;color:#64748b;font-size:10px;font-weight:700;white-space:nowrap}.utl-episode.is-active>summary>small{background:#e6fffb;color:#0f766e}
      .utl-elements{border-top:1px solid #edf0f2;padding:3px 14px 7px}
      .utl-item{display:grid;grid-template-columns:48px 30px minmax(0,1fr);align-items:start;gap:8px;padding:12px 0;border-bottom:1px solid #f0f2f4;background:transparent}.utl-item:last-child{border-bottom:0}
      .utl-time{padding-top:4px;font-size:11px;font-weight:700;color:#64748b;font-variant-numeric:tabular-nums}
      .utl-item-icon{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#f1f5f9;color:#475569;font-size:12px;font-weight:800}.utl-track-icon{background:#e6fffb;color:#0f766e;font-size:16px}
      .utl-item-copy{min-width:0}.utl-item-copy strong{display:block;font-size:14px;color:#172033}.utl-item-copy p,.utl-item-copy small{display:block;margin:3px 0 0;line-height:1.3}.utl-item-copy p{font-size:12px;color:#475569}.utl-item-copy small{font-size:11px;color:#7b8796}
      .utl-empty{padding:16px;border:1px dashed #d8dee5;border-radius:14px;background:#fafbfc;color:#7b8796;font-size:12px;text-align:center}
      @media(max-width:430px){.utl-episode>summary{grid-template-columns:20px minmax(0,1fr)}.utl-episode>summary>small{grid-column:2;justify-self:start}.utl-item{grid-template-columns:44px 28px minmax(0,1fr)}}
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
    return JSON.stringify(days.map((day) => [
      day.day,
      [...day.episodes.values()].map((episode) => [
        episode.id,
        episode.active,
        Number(episode.startedAt || 0),
        Number(episode.endedAt || 0),
        episode.elements.map((item) => [item.id, item.type, item.status || '', Number(item.endedAt || item.at || 0), Math.round(Number(item.distanceM || 0))]),
      ]),
    ]));
  }
  function expansionState(content) {
    const state = new Set();
    content.querySelectorAll('[data-tree-key]').forEach((node) => { if (node.open) state.add(node.dataset.treeKey); });
    return state;
  }
  function restoreExpansion(content, state) {
    if (!state) return;
    content.querySelectorAll('[data-tree-key]').forEach((node) => { node.open = state.has(node.dataset.treeKey); });
  }

  async function render(options = {}) {
    if (rendering) return;
    const screen = document.querySelector('[data-app-screen="travel-log"]');
    const content = screen?.querySelector('#travel-log-content');
    if (!screen || !content) return;
    rendering = true;
    try {
      injectStyles();
      cleanLegacyChrome(screen);
      const days = await buildDays();
      const signature = signatureFor(days);
      if (signature !== lastSignature || !content.querySelector('.utl-tree') || options.resetExpansion === true) {
        const expanded = options.resetExpansion === true ? null : expansionState(content);
        lastSignature = signature;
        content.innerHTML = `<div class="utl-tree">${days.map(dayMarkup).join('')}</div>`;
        if (expanded) restoreExpansion(content, expanded);
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
  window.addEventListener('wander:track-cloud-sync', refresh);
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
    hierarchy: 'day-episode-elements',
  });
  start();
})();