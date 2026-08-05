(() => {
  if (window.WanderTrackIntelligence) return;
  const context = window.WanderContext;
  if (!context) return;

  const DB_NAME = 'wander-track-intelligence';
  const DB_VERSION = 1;
  const TRACKS = 'tracks';
  const EPISODES = 'episodes';
  const DAYS = 'days';
  const ACTIVE_KEY = 'wander.track-intelligence.active.v1';
  const MAX_SPEED_KMH = 220;
  const GAP_CUT_MS = 2 * 60 * 1000;
  const EPISODE_GAP_MS = 30 * 60 * 1000;
  const STAY_RADIUS_MIN_M = 12;
  const STAY_CONFIRM_MS = 60 * 1000;

  let dbPromise = null;
  let active = load(ACTIVE_KEY, null);
  let lastSample = null;

  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
  }
  function saveActive() {
    try {
      if (active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {}
  }
  function id(prefix, at = Date.now()) {
    return `${prefix}-${at}-${Math.random().toString(36).slice(2, 9)}`;
  }
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(TRACKS)) {
          const store = db.createObjectStore(TRACKS, { keyPath: 'id' });
          store.createIndex('day', 'day');
          store.createIndex('episodeId', 'episodeId');
          store.createIndex('relevance', 'relevance');
        }
        if (!db.objectStoreNames.contains(EPISODES)) {
          const store = db.createObjectStore(EPISODES, { keyPath: 'id' });
          store.createIndex('day', 'day');
        }
        if (!db.objectStoreNames.contains(DAYS)) db.createObjectStore(DAYS, { keyPath: 'day' });
      };
      request.onsuccess = () => resolve(request.result);
    });
    return dbPromise;
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
  async function all(storeName) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(storeName).objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
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
  function dayKey(at) {
    const d = new Date(at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function distance(a, b) {
    if (!a || !b) return 0;
    const r = 6371000;
    const p1 = a.lat * Math.PI / 180;
    const p2 = b.lat * Math.PI / 180;
    const dp = (b.lat - a.lat) * Math.PI / 180;
    const dl = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return r * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  function classifyActivity(track) {
    if (track.type === 'inconsistency') return 'unknown';
    const durationH = Math.max(1, track.endedAt - track.startedAt) / 3600000;
    const avg = (track.distanceM / 1000) / durationH;
    if (track.type === 'stay' || avg < 0.5) return 'stationary';
    if (avg < 7) return 'walking';
    if (avg < 18) return 'running';
    if (avg < 35) return 'cycling';
    const hinted = String(track.mobilityMode || '').toLowerCase();
    if (hinted.includes('boat') || hinted.includes('sail')) return 'sailing';
    if (hinted.includes('train')) return 'train';
    if (hinted.includes('bus')) return 'bus';
    return 'driving';
  }
  function colorFor(relevance) {
    if (relevance === 'irrelevant') return '#ef4444';
    if (relevance === 'suspect') return '#f59e0b';
    return '#14b8a6';
  }
  function newTrack(sample, type = 'movement', relevance = 'valid', reasons = []) {
    return {
      id: id('track', sample.at), day: dayKey(sample.at), episodeId: null,
      type, relevance, reasons, color: colorFor(relevance),
      startedAt: sample.at, endedAt: sample.at, durationMs: 0,
      distanceM: 0, pointCount: 0, sampleIds: [],
      start: { lat: sample.lat, lng: sample.lng }, end: { lat: sample.lat, lng: sample.lng },
      center: { lat: sample.lat, lng: sample.lng }, maxRadiusM: 0,
      mobilityMode: sample.mobilityMode || 'unknown', activity: 'unknown', confidence: 0.5,
      status: 'active', userDecision: null,
    };
  }
  function append(track, sample) {
    const previous = track._last || track.end;
    const d = distance(previous, sample);
    track.distanceM += d;
    track.endedAt = sample.at;
    track.durationMs = track.endedAt - track.startedAt;
    track.pointCount += 1;
    if (sample.id != null) track.sampleIds.push(sample.id);
    track.end = { lat: sample.lat, lng: sample.lng };
    track._last = { lat: sample.lat, lng: sample.lng };
    const n = track.pointCount;
    track.center.lat += (sample.lat - track.center.lat) / Math.max(1, n);
    track.center.lng += (sample.lng - track.center.lng) / Math.max(1, n);
    track.maxRadiusM = Math.max(track.maxRadiusM, distance(track.center, sample));
    track.mobilityMode = sample.mobilityMode || track.mobilityMode;
    return track;
  }
  function inconsistency(previous, sample) {
    if (!previous) return null;
    const dt = sample.at - previous.at;
    if (dt <= 0) return { relevance: 'irrelevant', reasons: ['time_discontinuity'] };
    if (dt > GAP_CUT_MS) return { relevance: 'suspect', reasons: ['time_gap'] };
    const d = distance(previous, sample);
    const speed = d / (dt / 1000) * 3.6;
    const accuracy = Math.max(Number(previous.accuracy || 0), Number(sample.accuracy || 0));
    if (accuracy > 150) return { relevance: 'suspect', reasons: ['poor_accuracy'] };
    if (speed > MAX_SPEED_KMH) return { relevance: 'irrelevant', reasons: ['impossible_speed'], calculatedSpeedKmh: speed };
    return null;
  }
  async function finalize(track) {
    if (!track) return null;
    delete track._last;
    track.status = 'closed';
    if (track.type !== 'inconsistency' && track.durationMs >= STAY_CONFIRM_MS && track.maxRadiusM <= Math.max(STAY_RADIUS_MIN_M, 1.5 * Number(track.accuracy || 0))) {
      track.type = 'stay';
      track.distanceM = 0;
    }
    track.activity = classifyActivity(track);
    track.confidence = track.relevance === 'valid' ? 0.8 : track.relevance === 'suspect' ? 0.45 : 0.1;
    track.color = colorFor(track.relevance);
    const episode = await assignEpisode(track);
    track.episodeId = episode.id;
    await put(TRACKS, track);
    await rebuildDay(track.day);
    window.dispatchEvent(new CustomEvent('wander:track-finalized', { detail: track }));
    return track;
  }
  async function assignEpisode(track) {
    const episodes = (await all(EPISODES)).filter((e) => e.day === track.day).sort((a, b) => b.endedAt - a.endedAt);
    let episode = episodes.find((e) => track.startedAt - e.endedAt <= EPISODE_GAP_MS && track.startedAt >= e.startedAt);
    if (!episode) episode = { id: id('episode', track.startedAt), day: track.day, startedAt: track.startedAt, endedAt: track.endedAt, trackIds: [], activities: [], title: 'Episodio sin nombre', status: 'inferred' };
    episode.endedAt = Math.max(episode.endedAt, track.endedAt);
    if (!episode.trackIds.includes(track.id)) episode.trackIds.push(track.id);
    if (!episode.activities.includes(track.activity)) episode.activities.push(track.activity);
    episode.title = episode.activities.includes('driving') ? 'Salida y traslado' : episode.activities.includes('walking') ? 'Recorrido a pie' : episode.activities.includes('stationary') ? 'Estadía' : 'Actividad';
    await put(EPISODES, episode);
    return episode;
  }
  async function rebuildDay(day) {
    const tracks = (await all(TRACKS)).filter((t) => t.day === day && t.status !== 'deleted');
    const episodes = (await all(EPISODES)).filter((e) => e.day === day);
    const summary = {
      day, trackIds: tracks.map((t) => t.id), episodeIds: episodes.map((e) => e.id),
      distanceM: tracks.filter((t) => t.relevance === 'valid').reduce((s, t) => s + t.distanceM, 0),
      movingMs: tracks.filter((t) => t.type === 'movement' && t.relevance === 'valid').reduce((s, t) => s + t.durationMs, 0),
      stayMs: tracks.filter((t) => t.type === 'stay' && t.relevance === 'valid').reduce((s, t) => s + t.durationMs, 0),
      validCount: tracks.filter((t) => t.relevance === 'valid').length,
      suspectCount: tracks.filter((t) => t.relevance === 'suspect').length,
      irrelevantCount: tracks.filter((t) => t.relevance === 'irrelevant').length,
      updatedAt: Date.now(),
    };
    await put(DAYS, summary);
    context.set('sessions.trackIntelligenceDay', summary, { source: 'track-intelligence', kind: 'derived', ttlMs: 60000, confidence: 0.9 });
    return summary;
  }
  async function process(sample) {
    if (!sample || !Number.isFinite(sample.lat) || !Number.isFinite(sample.lng)) return;
    const issue = inconsistency(lastSample, sample);
    if (active && (issue || dayKey(sample.at) !== active.day)) {
      await finalize(active);
      active = null;
    }
    if (issue) {
      const broken = append(newTrack(sample, 'inconsistency', issue.relevance, issue.reasons), sample);
      if (issue.calculatedSpeedKmh) broken.calculatedSpeedKmh = issue.calculatedSpeedKmh;
      await finalize(broken);
      lastSample = sample;
      saveActive();
      return;
    }
    if (!active) active = newTrack(sample);
    append(active, sample);
    active.accuracy = Math.max(Number(active.accuracy || 0), Number(sample.accuracy || 0));
    lastSample = sample;
    saveActive();
    context.set('sessions.trackIntelligenceStatus', 'processing', { source: 'track-intelligence', kind: 'derived', ttlMs: 5000, confidence: 1 });
  }
  async function flush() {
    if (!active) return null;
    const done = await finalize(active);
    active = null;
    saveActive();
    return done;
  }
  async function setRelevance(trackId, relevance, userDecision = 'manual') {
    const tracks = await all(TRACKS);
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return false;
    track.relevance = ['valid', 'suspect', 'irrelevant'].includes(relevance) ? relevance : track.relevance;
    track.color = colorFor(track.relevance);
    track.userDecision = userDecision;
    await put(TRACKS, track);
    await rebuildDay(track.day);
    return true;
  }
  async function deleteTrack(trackId, deleteRaw = false) {
    const tracks = await all(TRACKS);
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return false;
    track.status = 'deleted';
    track.deletedAt = Date.now();
    track.deleteRawRequested = Boolean(deleteRaw);
    await put(TRACKS, track);
    await rebuildDay(track.day);
    return true;
  }

  window.addEventListener('wander:raw-location-sample', (event) => process(event.detail).catch(() => {}));
  window.addEventListener('pagehide', () => flush().catch(() => {}));
  setInterval(() => { if (active && Date.now() - active.endedAt > GAP_CUT_MS) flush().catch(() => {}); }, 30000);

  window.WanderTrackIntelligence = {
    process, flush, listTracks: () => all(TRACKS), listEpisodes: () => all(EPISODES), listDays: () => all(DAYS),
    setRelevance, deleteTrack,
    status: () => ({ active: active ? { ...active } : null, maxSpeedKmh: MAX_SPEED_KMH, gapCutMs: GAP_CUT_MS }),
    colors: Object.freeze({ valid: '#14b8a6', suspect: '#f59e0b', irrelevant: '#ef4444' }),
  };
})();
