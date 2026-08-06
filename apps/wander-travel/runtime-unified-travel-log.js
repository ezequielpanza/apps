(() => {
  if (window.WanderUnifiedTravelLog) return;

  const FILTERS = [
    ['all', 'Todo'],
    ['today', 'Hoy'],
    ['upcoming', 'Próximamente'],
    ['history', 'Historial'],
  ];
  const TYPE_LABELS = {
    track: 'Track', event: 'Evento', note: 'Nota', plan: 'Plan',
    walking: 'Caminata', running: 'Carrera', cycling: 'Bicicleta', driving: 'Vehículo',
    sailing: 'Navegación', train: 'Tren', bus: 'Autobús', stationary: 'Estadía', unknown: 'Actividad',
  };
  const DB_NAME = 'wander-track-intelligence';
  const DB_VERSION = 1;
  let activeFilter = 'all';
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
  function atValue(value) {
    if (typeof value === 'number') return value;
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : Date.now();
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
  function sessions() {
    const snapshot = engine()?.snapshot?.() || {};
    return snapshot.active ? [...(snapshot.sessions || []), snapshot.active] : [...(snapshot.sessions || [])];
  }
  function sessionTracks() {
    const rows = [];
    sessions().forEach((session) => (session.segments || []).forEach((segment) => {
      if (segment?.type !== 'movement') return;
      rows.push({
        id: segment.id || `segment-${segment.startedAt}`,
        day: localDay(segment.startedAt), episodeId: session.id || `session-${segment.startedAt}`,
        startedAt: segment.startedAt, endedAt: segment.endedAt || Date.now(),
        durationMs: Math.max(0, Number(segment.endedAt || Date.now()) - Number(segment.startedAt || Date.now())),
        distanceM: Number(segment.distanceM || 0), activity: segment.method || 'unknown',
        relevance: 'valid', status: segment.endedAt ? 'closed' : 'active', source: 'session-engine',
      });
    }));
    return rows;
  }
  function entries() {
    const source = log()?.listEntries?.() || [];
    return source.filter((item) => item.kind !== 'session-link').map((item) => ({
      id: item.id, type: item.kind === 'note' ? 'note' : 'event', day: item.day || localDay(item.at),
      at: atValue(item.at), title: item.title || TYPE_LABELS[item.kind] || 'Evento',
      summary: item.summary || '', placeName: item.placeName || '', source: item.source || 'local', raw: item,
    }));
  }
  function plans() {
    return (log()?.listPlans?.() || []).map((item) => ({
      id: item.id, type: 'plan', day: item.day || localDay(item.scheduledAt || Date.now()),
      at: atValue(item.scheduledAt || Date.now()), title: item.title || 'Plan', summary: item.notes || '',
      status: item.status || 'planned', placeName: item.placeName || '', raw: item,
    }));
  }
  function filterDay(day, hasFuturePlan = false) {
    const today = todayKey();
    if (activeFilter === 'all') return true;
    if (activeFilter === 'today') return day === today;
    if (activeFilter === 'history') return day < today;
    return day > today || hasFuturePlan;
  }
  function activityLabel(activity) { return TYPE_LABELS[String(activity || 'unknown').toLowerCase()] || activity || 'Actividad'; }

  function itemMarkup(item) {
    if (item.type === 'track') {
      const active = item.status === 'active' ? ' · En curso' : '';
      const pending = item.enrichmentStatus === 'pending' || !navigator.onLine;
      return `<article class="utl-item utl-track" data-track-id="${esc(item.id)}"><span class="utl-dot relevance-${esc(item.relevance || 'valid')}"></span><div><strong>${esc(timeLabel(item.startedAt))} · ${esc(duration(item.durationMs))}</strong><p>${esc(distance(item.distanceM))}${active}</p><small>${pending ? 'Datos locales · ubicación pendiente de enriquecer' : 'Datos locales enriquecidos'}</small></div></article>`;
    }
    const when = timeLabel(item.at);
    const state = item.type === 'plan' ? ` · ${item.status}` : '';
    return `<article class="utl-item utl-${esc(item.type)}"><span class="utl-symbol">${item.type === 'plan' ? '◷' : item.type === 'note' ? '✎' : '•'}</span><div><strong>${esc(item.title)}</strong><p>${esc(when + state)}${item.placeName ? ` · ${esc(item.placeName)}` : ''}</p>${item.summary ? `<small>${esc(item.summary)}</small>` : ''}</div></article>`;
  }

  async function buildDays() {
    const [dbTracks, dbEpisodes] = await Promise.all([all('tracks'), all('episodes')]);
    const mergedTracks = [...dbTracks.filter((t) => t.status !== 'deleted')];
    const seen = new Set(mergedTracks.map((t) => t.id));
    sessionTracks().forEach((t) => { if (!seen.has(t.id)) mergedTracks.push(t); });
    const episodeMap = new Map(dbEpisodes.map((e) => [e.id, e]));
    const dayMap = new Map();
    const ensureDay = (day) => {
      if (!dayMap.has(day)) dayMap.set(day, { day, episodes: new Map(), loose: [], plans: [] });
      return dayMap.get(day);
    };
    const ensureEpisode = (dayNode, id, fallbackAt) => {
      if (!dayNode.episodes.has(id)) {
        const stored = episodeMap.get(id);
        dayNode.episodes.set(id, {
          id, title: stored?.title || 'Episodio', startedAt: stored?.startedAt || fallbackAt,
          activities: new Map(), items: [],
        });
      }
      return dayNode.episodes.get(id);
    };
    mergedTracks.forEach((track) => {
      const day = track.day || localDay(track.startedAt);
      const dayNode = ensureDay(day);
      const episodeId = track.episodeId || `episode-${day}-${track.startedAt}`;
      const episode = ensureEpisode(dayNode, episodeId, track.startedAt);
      const activity = track.activity || 'unknown';
      if (!episode.activities.has(activity)) episode.activities.set(activity, []);
      episode.activities.get(activity).push({ ...track, type: 'track' });
    });
    entries().forEach((item) => ensureDay(item.day).loose.push(item));
    plans().forEach((item) => ensureDay(item.day).plans.push(item));
    const today = todayKey();
    ensureDay(today);
    return [...dayMap.values()].filter((node) => filterDay(node.day, node.plans.some((p) => !['completed', 'cancelled'].includes(p.status)))).sort((a, b) => b.day.localeCompare(a.day));
  }

  function dayMarkup(node) {
    const episodes = [...node.episodes.values()].sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0));
    const episodeMarkup = episodes.map((episode) => {
      const activities = [...episode.activities.entries()].map(([activity, tracks]) => `<details class="utl-folder utl-activity" open><summary><span>▱</span><strong>${esc(activityLabel(activity))}</strong><small>${tracks.length} track${tracks.length === 1 ? '' : 's'}</small></summary><div>${tracks.sort((a,b)=>a.startedAt-b.startedAt).map(itemMarkup).join('')}</div></details>`).join('');
      return `<details class="utl-folder utl-episode" open><summary><span>▰</span><strong>${esc(episode.title)}</strong><small>${episode.activities.size} actividad${episode.activities.size === 1 ? '' : 'es'}</small></summary><div>${activities}</div></details>`;
    }).join('');
    const extras = [...node.plans, ...node.loose].sort((a, b) => a.at - b.at);
    const extrasMarkup = extras.length ? `<details class="utl-folder utl-activity" open><summary><span>▱</span><strong>Eventos, notas y planes</strong><small>${extras.length}</small></summary><div>${extras.map(itemMarkup).join('')}</div></details>` : '';
    const empty = !episodeMarkup && !extrasMarkup ? '<div class="utl-empty">Sin episodios todavía. La grabación local sigue activa.</div>' : '';
    return `<details class="utl-folder utl-day" open data-day="${esc(node.day)}"><summary><span>▰</span><strong>${esc(dayLabel(node.day))}</strong><small>${episodes.length} episodios · ${node.plans.length + node.loose.length} eventos</small></summary><div>${episodeMarkup}${extrasMarkup}${empty}</div></details>`;
  }

  function injectStyles() {
    if (document.querySelector('#wander-unified-log-styles')) return;
    const style = document.createElement('style');
    style.id = 'wander-unified-log-styles';
    style.textContent = `
      .utl-filterbar{display:flex;gap:7px;overflow:auto;padding:2px 0 8px}.utl-filterbar button{border:1px solid rgba(148,163,184,.3);border-radius:999px;padding:8px 13px;background:rgba(15,23,42,.55);color:inherit;white-space:nowrap}.utl-filterbar button.is-active{background:#01e0cb;color:#042f2e;border-color:#01e0cb;font-weight:700}
      .utl-sync{display:flex;justify-content:space-between;gap:10px;padding:9px 11px;margin:0 0 9px;border-radius:10px;background:rgba(15,23,42,.48);font-size:12px}.utl-sync small{opacity:.7}
      .utl-tree{display:flex;flex-direction:column;gap:8px}.utl-folder{border:1px solid rgba(148,163,184,.23);border-radius:12px;background:rgba(15,23,42,.42);overflow:hidden}.utl-folder .utl-folder{margin:7px;background:rgba(30,41,59,.35)}
      .utl-folder summary{display:flex;align-items:center;gap:8px;padding:11px;list-style:none;cursor:pointer}.utl-folder summary::-webkit-details-marker{display:none}.utl-folder summary strong{flex:1}.utl-folder summary small{opacity:.67;font-size:11px}.utl-folder>div{padding:0 5px 6px}
      .utl-item{display:grid;grid-template-columns:14px 1fr;gap:8px;margin:6px;padding:9px;border-radius:9px;background:rgba(2,6,23,.42)}.utl-item p,.utl-item small{margin:3px 0 0;display:block}.utl-item p{font-size:12px}.utl-item small{font-size:11px;opacity:.68}.utl-dot{width:10px;height:10px;border-radius:50%;margin-top:4px;background:#14b8a6}.utl-dot.relevance-suspect{background:#f59e0b}.utl-dot.relevance-irrelevant{background:#ef4444}.utl-symbol{opacity:.8}.utl-empty{padding:15px;text-align:center;opacity:.65}
    `;
    document.head.appendChild(style);
  }

  async function render() {
    if (rendering) return;
    const screen = document.querySelector('[data-app-screen="travel-log"]');
    const content = screen?.querySelector('#travel-log-content');
    const tabs = screen?.querySelector('.travel-log-tabs');
    if (!screen || !content || !tabs) return;
    rendering = true;
    try {
      injectStyles();
      tabs.className = 'utl-filterbar';
      tabs.innerHTML = FILTERS.map(([id, label]) => `<button type="button" class="${activeFilter === id ? 'is-active' : ''}" data-unified-filter="${id}">${label}</button>`).join('');
      const days = await buildDays();
      const signature = JSON.stringify({ activeFilter, online: navigator.onLine, days: days.map((d) => [d.day, d.episodes.size, d.loose.length, d.plans.length]) });
      if (signature !== lastSignature || !content.querySelector('.utl-tree')) {
        lastSignature = signature;
        const sync = navigator.onLine
          ? '<div class="utl-sync"><span>Datos locales disponibles</span><small>Enriquecimiento en segundo plano</small></div>'
          : '<div class="utl-sync"><span>Modo offline</span><small>Se completará al recuperar conexión</small></div>';
        content.innerHTML = `${sync}<div class="utl-tree">${days.map(dayMarkup).join('') || '<div class="utl-empty">No hay elementos para este filtro.</div>'}</div>`;
      }
    } finally { rendering = false; }
  }

  function queueEnrichment() {
    try { localStorage.setItem('wander.travel-log.enrichment.pending.v1', JSON.stringify({ requestedAt: Date.now(), status: 'pending' })); } catch {}
    window.dispatchEvent(new CustomEvent('wander:travel-log-enrichment-requested', { detail: { reason: 'connectivity-restored', at: Date.now() } }));
    render();
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-unified-filter]');
    if (!button) return;
    activeFilter = button.dataset.unifiedFilter || 'all';
    lastSignature = '';
    render();
  });
  window.addEventListener('online', queueEnrichment);
  window.addEventListener('offline', render);
  window.addEventListener('wander:sessions-changed', render);
  window.addEventListener('wander:track-finalized', render);
  window.addEventListener('wander:screen-change', (event) => { if (event.detail?.to === 'travel-log') setTimeout(render, 40); });

  function start() {
    const root = document.documentElement;
    observer = new MutationObserver(() => {
      const screen = document.querySelector('[data-app-screen="travel-log"]');
      if (screen && !screen.hidden) setTimeout(render, 0);
    });
    observer.observe(root, { childList: true, subtree: true });
    setInterval(render, 15000);
    setTimeout(render, 1200);
  }

  window.WanderUnifiedTravelLog = Object.freeze({ render, setFilter: (filter) => { activeFilter = filter; lastSignature = ''; render(); }, queueEnrichment });
  start();
})();
