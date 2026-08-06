(() => {
  const VERSION = 'v0.109.15';
  const globalScope = typeof window !== 'undefined' ? window : self;
  globalScope.WanderVersion = VERSION;
  globalScope.WanderWebVersion = VERSION;

  if (typeof document === 'undefined') return;

  const RECENT_TRACKS_KEY = 'wander.tracks.recent.window.v1';
  const RECENT_TRACKS_MIGRATION_KEY = 'wander.tracks.recent.default.24h.v2';
  const RECORDING_KEY = 'wander.recording.profile.v1';
  const RECORDING_MIGRATION_KEY = 'wander.recording.default.1s.v1';
  const LAST_24_HOURS_MS = 24 * 60 * 60 * 1000;

  try {
    if (localStorage.getItem(RECENT_TRACKS_MIGRATION_KEY) !== 'done') {
      const stored = localStorage.getItem(RECENT_TRACKS_KEY);
      if (stored === null || stored === '0') localStorage.setItem(RECENT_TRACKS_KEY, String(LAST_24_HOURS_MS));
      localStorage.setItem(RECENT_TRACKS_MIGRATION_KEY, 'done');
    }
  } catch {}

  try {
    if (localStorage.getItem(RECORDING_MIGRATION_KEY) !== 'done') {
      const stored = JSON.parse(localStorage.getItem(RECORDING_KEY) || 'null') || {};
      if (!stored.profileId || stored.profileId === 'balanced') stored.profileId = 'precise';
      localStorage.setItem(RECORDING_KEY, JSON.stringify(stored));
      localStorage.setItem(RECORDING_MIGRATION_KEY, 'done');
    }
  } catch {}

  document.title = 'Wander Travel ' + VERSION;
  const drawerVersion = document.querySelector('#drawer-version');
  if (drawerVersion) drawerVersion.textContent = 'Web ' + VERSION;
  const metadata = { source: 'runtime-version', ttlMs: Infinity, confidence: 1 };
  window.WanderContext?.set?.('app.version', VERSION, metadata);
  window.WanderContext?.set?.('app.webVersion', VERSION, metadata);
  window.WanderContext?.set?.('sessions.rawTrackSchema', 2, metadata);
  window.WanderContext?.set?.('sessions.rawTrackPointFormat', 'latE7-array-v1', metadata);
  window.WanderContext?.set?.('sessions.constantRawRecording', true, metadata);
  window.WanderContext?.set?.('sessions.constantRawRecordingIntervalMs', 1000, metadata);
  window.WanderContext?.set?.('sessions.trackIntelligenceSchema', 1, metadata);
  window.WanderContext?.set?.('sessions.inconsistencyFilterEnabled', true, metadata);
  window.WanderContext?.set?.('sessions.unifiedTravelLog', true, metadata);
  window.WanderContext?.set?.('sessions.offlineFirstTravelLog', true, metadata);
  window.WanderContext?.set?.('sessions.activeTrackVisibleInTravelLog', true, metadata);
  window.WanderContext?.set?.('sessions.gpsStabilizationRequired', false, metadata);
  window.WanderContext?.set?.('sessions.immediateGpsCapture', true, metadata);
})();
