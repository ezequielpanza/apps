(() => {
  if (window.WanderTrackIntelligencePoller) return;
  const RAW_DB = 'wander-raw-recording';
  const RAW_STORE = 'location_samples';
  const LAST_KEY = 'wander.track-intelligence.last-raw-id.v1';
  let running = false;
  let timer = null;

  function lastId() {
    try { return Number(localStorage.getItem(LAST_KEY) || 0); } catch { return 0; }
  }
  function setLastId(value) {
    try { localStorage.setItem(LAST_KEY, String(value)); } catch {}
  }
  function openRawDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(RAW_DB, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function readPending() {
    const db = await openRawDb();
    return new Promise((resolve, reject) => {
      const results = [];
      const tx = db.transaction(RAW_STORE, 'readonly');
      const store = tx.objectStore(RAW_STORE);
      const range = IDBKeyRange.lowerBound(lastId() + 1);
      const request = store.openCursor(range);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve(results);
        results.push({ ...cursor.value, id: cursor.primaryKey });
        if (results.length >= 300) return resolve(results);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }
  async function tick() {
    if (running || !window.WanderTrackIntelligence) return;
    running = true;
    try {
      const samples = await readPending();
      for (const sample of samples) {
        await window.WanderTrackIntelligence.process(sample);
        setLastId(sample.id);
      }
    } catch {}
    running = false;
  }
  function start() {
    if (timer) return;
    tick();
    timer = setInterval(tick, 2000);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }
  window.WanderTrackIntelligencePoller = { start, stop, tick, status: () => ({ active: Boolean(timer), lastRawId: lastId() }) };
  start();
})();
