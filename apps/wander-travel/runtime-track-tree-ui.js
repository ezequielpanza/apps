(() => {
  if (window.WanderTrackTreeUI) return;

  const DB_NAME = 'wander-track-intelligence';
  const DB_VERSION = 1;
  const TRACKS = 'tracks';
  const EPISODES = 'episodes';
  const DAYS = 'days';
  const ACTIVITIES = ['stationary', 'walking', 'running', 'cycling', 'driving', 'sailing', 'train', 'bus', 'unknown'];
  const ACTIVITY_LABELS = {
    stationary: 'Estadía', walking: 'Caminata', running: 'Carrera', cycling: 'Bicicleta',
    driving: 'Vehículo', sailing: 'Navegación', train: 'Tren', bus: 'Autobús', unknown: 'Desconocida'
  };
  let dbPromise;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    return dbPromise;
  }
  async function all(storeName) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName).objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
  async function put(storeName, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.objectStore(storeName).put(value);
    });
  }
  async function remove(storeName, key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.objectStore(storeName).delete(key);
    });
  }
  function uid(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  function formatDuration(ms) {
    const minutes = Math.max(0, Math.round(Number(ms || 0) / 60000));
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }
  function formatDistance(meters) {
    const value = Number(meters || 0);
    return value < 1000 ? `${Math.round(value)} m` : `${(value / 1000).toFixed(1)} km`;
  }
  function dayLabel(day) {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(year, month - 1, date).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function timeLabel(at) {
    return new Date(at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  function autoTitle(activities) {
    if (activities.includes('driving')) return 'Salida y traslado';
    if (activities.includes('sailing')) return 'Navegación';
    if (activities.includes('walking')) return 'Recorrido a pie';
    if (activities.includes('cycling')) return 'Recorrido en bicicleta';
    if (activities.includes('stationary')) return 'Estadía';
    return 'Actividad';
  }
  async function rebuildEpisode(episodeId) {
    const episodes = await all(EPISODES);
    const episode = episodes.find((item) => item.id === episodeId);
    if (!episode) return null;
    const tracks = (await all(TRACKS)).filter((track) => track.episodeId === episodeId && track.status !== 'deleted').sort((a, b) => a.startedAt - b.startedAt);
    if (!tracks.length) {
      await remove(EPISODES, episodeId);
      return null;
    }
    episode.trackIds = tracks.map((track) => track.id);
    episode.day = tracks[0].day;
    episode.startedAt = tracks[0].startedAt;
    episode.endedAt = Math.max(...tracks.map((track) => track.endedAt));
    episode.activities = [...new Set(tracks.map((track) => track.activity || 'unknown'))];
    if (!episode.customTitle) episode.title = autoTitle(episode.activities);
    episode.updatedAt = Date.now();
    await put(EPISODES, episode);
    return episode;
  }
  async function rebuildDay(day) {
    const tracks = (await all(TRACKS)).filter((track) => track.day === day && track.status !== 'deleted');
    const episodeIds = [...new Set(tracks.map((track) => track.episodeId).filter(Boolean))];
    const summary = {
      day,
      trackIds: tracks.map((track) => track.id),
      episodeIds,
      distanceM: tracks.filter((track) => track.relevance === 'valid').reduce((sum, track) => sum + Number(track.distanceM || 0), 0),
      movingMs: tracks.filter((track) => track.type === 'movement' && track.relevance === 'valid').reduce((sum, track) => sum + Number(track.durationMs || 0), 0),
      stayMs: tracks.filter((track) => track.type === 'stay' && track.relevance === 'valid').reduce((sum, track) => sum + Number(track.durationMs || 0), 0),
      validCount: tracks.filter((track) => track.relevance === 'valid').length,
      suspectCount: tracks.filter((track) => track.relevance === 'suspect').length,
      irrelevantCount: tracks.filter((track) => track.relevance === 'irrelevant').length,
      updatedAt: Date.now()
    };
    await put(DAYS, summary);
  }
  async function setActivity(trackId, activity) {
    const tracks = await all(TRACKS);
    const track = tracks.find((item) => item.id === trackId);
    if (!track || !ACTIVITIES.includes(activity)) return;
    track.activity = activity;
    track.activitySource = 'user';
    track.confidence = 1;
    await put(TRACKS, track);
    await rebuildEpisode(track.episodeId);
    await rebuildDay(track.day);
  }
  async function renameEpisode(episodeId) {
    const episodes = await all(EPISODES);
    const episode = episodes.find((item) => item.id === episodeId);
    if (!episode) return;
    const title = prompt('Nombre del episodio', episode.title || '');
    if (title === null) return;
    const clean = title.trim();
    episode.customTitle = Boolean(clean);
    episode.title = clean || autoTitle(episode.activities || []);
    episode.updatedAt = Date.now();
    await put(EPISODES, episode);
  }
  async function moveTrack(trackId, targetEpisodeId) {
    const tracks = await all(TRACKS);
    const episodes = await all(EPISODES);
    const track = tracks.find((item) => item.id === trackId);
    const target = episodes.find((item) => item.id === targetEpisodeId);
    if (!track || !target || track.day !== target.day) return;
    const previous = track.episodeId;
    track.episodeId = targetEpisodeId;
    await put(TRACKS, track);
    await rebuildEpisode(previous);
    await rebuildEpisode(targetEpisodeId);
    await rebuildDay(track.day);
  }
  async function splitEpisode(episodeId, fromTrackId) {
    const tracks = (await all(TRACKS)).filter((track) => track.episodeId === episodeId && track.status !== 'deleted').sort((a, b) => a.startedAt - b.startedAt);
    const index = tracks.findIndex((track) => track.id === fromTrackId);
    if (index <= 0) return;
    const moved = tracks.slice(index);
    const created = {
      id: uid('episode'), day: moved[0].day, startedAt: moved[0].startedAt, endedAt: moved[moved.length - 1].endedAt,
      trackIds: [], activities: [], title: 'Nuevo episodio', customTitle: false, status: 'manual', updatedAt: Date.now()
    };
    await put(EPISODES, created);
    for (const track of moved) {
      track.episodeId = created.id;
      await put(TRACKS, track);
    }
    await rebuildEpisode(episodeId);
    await rebuildEpisode(created.id);
    await rebuildDay(moved[0].day);
  }
  async function mergeEpisode(episodeId, targetEpisodeId) {
    if (!targetEpisodeId || episodeId === targetEpisodeId) return;
    const episodes = await all(EPISODES);
    const source = episodes.find((item) => item.id === episodeId);
    const target = episodes.find((item) => item.id === targetEpisodeId);
    if (!source || !target || source.day !== target.day) return;
    const tracks = (await all(TRACKS)).filter((track) => track.episodeId === episodeId && track.status !== 'deleted');
    for (const track of tracks) {
      track.episodeId = targetEpisodeId;
      await put(TRACKS, track);
    }
    await remove(EPISODES, episodeId);
    await rebuildEpisode(targetEpisodeId);
    await rebuildDay(source.day);
  }
  async function setRelevance(trackId, relevance) {
    const engine = window.WanderTrackIntelligence;
    if (engine?.setRelevance) return engine.setRelevance(trackId, relevance, 'tree-review');
  }
  async function deleteTrack(trackId) {
    const engine = window.WanderTrackIntelligence;
    if (engine?.deleteTrack) return engine.deleteTrack(trackId, false);
  }
  function injectStyles() {
    if (document.querySelector('#wander-track-tree-styles')) return;
    const style = document.createElement('style');
    style.id = 'wander-track-tree-styles';
    style.textContent = `
      .track-folder-tree{display:flex;flex-direction:column;gap:8px;margin:10px 0 16px;text-align:left}
      .track-folder-tree details{border:1px solid rgba(148,163,184,.28);border-radius:12px;background:rgba(15,23,42,.52);overflow:hidden}
      .track-folder-tree details details{margin:7px;border-radius:10px;background:rgba(30,41,59,.42)}
      .track-folder-tree summary{display:flex;align-items:center;gap:8px;padding:11px 12px;cursor:pointer;list-style:none;min-height:44px}
      .track-folder-tree summary::-webkit-details-marker{display:none}
      .track-folder-tree summary:before{content:'▸';font-size:13px;transition:transform .15s ease}
      .track-folder-tree details[open]>summary:before{transform:rotate(90deg)}
      .track-tree-icon{font-size:18px}.track-tree-title{font-weight:700;flex:1}.track-tree-meta{font-size:12px;opacity:.72}
      .track-tree-body{padding:0 7px 8px}.track-tree-toolbar{display:flex;flex-wrap:wrap;gap:6px;padding:0 10px 10px}
      .track-tree-toolbar button,.track-tree-actions button,.track-tree-actions select{border:1px solid rgba(148,163,184,.35);border-radius:8px;background:rgba(30,41,59,.82);color:inherit;padding:7px 9px;font-size:12px}
      .track-tree-activity{margin-left:14px;border-left:2px solid rgba(94,234,212,.35);padding-left:6px}
      .track-tree-track{display:grid;grid-template-columns:12px 1fr;gap:8px;margin:6px 8px 6px 22px;padding:9px;border-radius:9px;background:rgba(2,6,23,.46)}
      .track-tree-dot{width:10px;height:10px;border-radius:50%;margin-top:4px}.track-tree-track strong{display:block}.track-tree-track small{display:block;opacity:.72;margin-top:3px}
      .track-tree-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.track-tree-empty{padding:16px;text-align:center;opacity:.7}
      .track-tree-heading{display:flex;justify-content:space-between;align-items:end;margin:12px 2px 6px}.track-tree-heading small{opacity:.7}
    `;
    document.head.appendChild(style);
  }
  function makeButton(text, action, data = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.dataset.treeAction = action;
    Object.entries(data).forEach(([key, value]) => { button.dataset[key] = value; });
    return button;
  }
  function summary(icon, title, meta) {
    const node = document.createElement('summary');
    node.innerHTML = `<span class="track-tree-icon">${icon}</span><span class="track-tree-title"></span><span class="track-tree-meta"></span>`;
    node.querySelector('.track-tree-title').textContent = title;
    node.querySelector('.track-tree-meta').textContent = meta;
    return node;
  }
  function trackNode(track, episodes) {
    const row = document.createElement('div');
    row.className = 'track-tree-track';
    const dot = document.createElement('span');
    dot.className = 'track-tree-dot';
    dot.style.background = track.color || (track.relevance === 'irrelevant' ? '#ef4444' : track.relevance === 'suspect' ? '#f59e0b' : '#14b8a6');
    const content = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${timeLabel(track.startedAt)} · ${formatDuration(track.durationMs)}`;
    const meta = document.createElement('small');
    meta.textContent = `${formatDistance(track.distanceM)} · ${track.relevance === 'valid' ? 'Válido' : track.relevance === 'suspect' ? 'Dudoso' : 'Irrelevante'}`;
    const actions = document.createElement('div');
    actions.className = 'track-tree-actions';
    const select = document.createElement('select');
    select.dataset.treeAction = 'activity';
    select.dataset.trackId = track.id;
    ACTIVITIES.forEach((activity) => {
      const option = document.createElement('option');
      option.value = activity;
      option.textContent = ACTIVITY_LABELS[activity];
      option.selected = activity === (track.activity || 'unknown');
      select.appendChild(option);
    });
    const move = document.createElement('select');
    move.dataset.treeAction = 'move';
    move.dataset.trackId = track.id;
    move.innerHTML = '<option value="">Mover a…</option>';
    episodes.filter((episode) => episode.day === track.day && episode.id !== track.episodeId).forEach((episode) => {
      const option = document.createElement('option');
      option.value = episode.id;
      option.textContent = episode.title || 'Episodio';
      move.appendChild(option);
    });
    actions.append(select, move, makeButton('Separar desde aquí', 'split', { episodeId: track.episodeId, trackId: track.id }), makeButton('Válido', 'valid', { trackId: track.id }), makeButton('Ignorar', 'irrelevant', { trackId: track.id }), makeButton('Eliminar', 'delete', { trackId: track.id }));
    content.append(title, meta, actions);
    row.append(dot, content);
    return row;
  }
  async function render() {
    injectStyles();
    const root = document.querySelector('#track-list');
    if (!root) return;
    const [tracksRaw, episodesRaw, daysRaw] = await Promise.all([all(TRACKS), all(EPISODES), all(DAYS)]);
    const tracks = tracksRaw.filter((track) => track.status !== 'deleted');
    const episodes = episodesRaw.filter((episode) => tracks.some((track) => track.episodeId === episode.id));
    root.querySelectorAll('.track-intelligence-heading,.track-intelligence-card,.track-folder-tree,.track-tree-heading').forEach((node) => node.remove());
    const heading = document.createElement('div');
    heading.className = 'track-tree-heading';
    heading.innerHTML = '<strong>Tracks y actividades</strong><small>Días → Episodios → Actividades → Tracks</small>';
    const tree = document.createElement('div');
    tree.className = 'track-folder-tree';
    const days = [...new Set([...daysRaw.map((day) => day.day), ...tracks.map((track) => track.day)])].sort().reverse();
    if (!days.length) tree.innerHTML = '<div class="track-tree-empty">Todavía no hay tracks interpretados.</div>';
    days.forEach((day) => {
      const dayTracks = tracks.filter((track) => track.day === day);
      const dayEpisodes = episodes.filter((episode) => episode.day === day).sort((a, b) => a.startedAt - b.startedAt);
      const dayDetails = document.createElement('details');
      dayDetails.open = day === days[0];
      dayDetails.appendChild(summary('📁', dayLabel(day), `${dayEpisodes.length} episodios · ${dayTracks.length} tracks · ${formatDistance(dayTracks.filter((track) => track.relevance === 'valid').reduce((sum, track) => sum + Number(track.distanceM || 0), 0))}`));
      const dayBody = document.createElement('div');
      dayBody.className = 'track-tree-body';
      dayEpisodes.forEach((episode, episodeIndex) => {
        const episodeTracks = dayTracks.filter((track) => track.episodeId === episode.id).sort((a, b) => a.startedAt - b.startedAt);
        const episodeDetails = document.createElement('details');
        episodeDetails.open = day === days[0] && episodeIndex === dayEpisodes.length - 1;
        episodeDetails.appendChild(summary('📂', episode.title || 'Episodio', `${timeLabel(episode.startedAt)}–${timeLabel(episode.endedAt)} · ${episodeTracks.length} tracks`));
        const toolbar = document.createElement('div');
        toolbar.className = 'track-tree-toolbar';
        toolbar.appendChild(makeButton('Renombrar', 'rename', { episodeId: episode.id }));
        const mergeSelect = document.createElement('select');
        mergeSelect.dataset.treeAction = 'merge';
        mergeSelect.dataset.episodeId = episode.id;
        mergeSelect.innerHTML = '<option value="">Unir con…</option>';
        dayEpisodes.filter((candidate) => candidate.id !== episode.id).forEach((candidate) => {
          const option = document.createElement('option');
          option.value = candidate.id;
          option.textContent = candidate.title || 'Episodio';
          mergeSelect.appendChild(option);
        });
        toolbar.appendChild(mergeSelect);
        episodeDetails.appendChild(toolbar);
        const byActivity = new Map();
        episodeTracks.forEach((track) => {
          const activity = track.activity || 'unknown';
          if (!byActivity.has(activity)) byActivity.set(activity, []);
          byActivity.get(activity).push(track);
        });
        byActivity.forEach((activityTracks, activity) => {
          const activityDetails = document.createElement('details');
          activityDetails.className = 'track-tree-activity';
          activityDetails.open = true;
          activityDetails.appendChild(summary('🗂️', ACTIVITY_LABELS[activity] || activity, `${activityTracks.length} tracks · ${formatDuration(activityTracks.reduce((sum, track) => sum + Number(track.durationMs || 0), 0))}`));
          activityTracks.forEach((track) => activityDetails.appendChild(trackNode(track, dayEpisodes)));
          episodeDetails.appendChild(activityDetails);
        });
        dayBody.appendChild(episodeDetails);
      });
      dayDetails.appendChild(dayBody);
      tree.appendChild(dayDetails);
    });
    root.prepend(tree);
    root.prepend(heading);
  }
  async function handleClick(event) {
    const target = event.target.closest('[data-tree-action]');
    if (!target || ['activity', 'move', 'merge'].includes(target.dataset.treeAction)) return;
    const action = target.dataset.treeAction;
    if (action === 'rename') await renameEpisode(target.dataset.episodeId);
    if (action === 'split') await splitEpisode(target.dataset.episodeId, target.dataset.trackId);
    if (action === 'valid') await setRelevance(target.dataset.trackId, 'valid');
    if (action === 'irrelevant') await setRelevance(target.dataset.trackId, 'irrelevant');
    if (action === 'delete' && confirm('¿Ocultar este track? Los datos crudos no se borrarán.')) await deleteTrack(target.dataset.trackId);
    await render();
  }
  async function handleChange(event) {
    const target = event.target.closest('[data-tree-action]');
    if (!target) return;
    if (target.dataset.treeAction === 'activity') await setActivity(target.dataset.trackId, target.value);
    if (target.dataset.treeAction === 'move' && target.value) await moveTrack(target.dataset.trackId, target.value);
    if (target.dataset.treeAction === 'merge' && target.value && confirm('¿Unir ambos episodios?')) await mergeEpisode(target.dataset.episodeId, target.value);
    await render();
  }

  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  window.addEventListener('wander:track-finalized', render);
  window.addEventListener('wander:sessions-changed', render);
  window.addEventListener('wander:track-tree-changed', render);
  setInterval(render, 30000);
  window.WanderTrackTreeUI = { render, setActivity, renameEpisode, moveTrack, splitEpisode, mergeEpisode };
  setTimeout(render, 1800);
})();
