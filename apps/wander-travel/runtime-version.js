(() => {
  const VERSION = 'v0.109.27';
  const globalScope = typeof window !== 'undefined' ? window : self;
  globalScope.WanderVersion = VERSION;
  globalScope.WanderWebVersion = VERSION;

  if (typeof document === 'undefined') return;

  const RECENT_TRACKS_KEY = 'wander.tracks.recent.window.v1';
  const RECENT_TRACKS_MIGRATION_KEY = 'wander.tracks.recent.default.24h.v2';
  const RECORDING_KEY = 'wander.recording.profile.v1';
  const RECORDING_BALANCED_MIGRATION_KEY = 'wander.recording.default.balanced.v2';
  const RECORDING_USER_CHOSEN_KEY = 'wander.recording.userChosen.v1';
  const MESSAGE_TIMEOUT_KEY = 'wander.settings.messageTimeoutMs';
  const MESSAGE_TIMEOUT_MIGRATION_KEY = 'wander.messages.default.5s.v2';
  const LAST_24_HOURS_MS = 24 * 60 * 60 * 1000;

  try {
    if (localStorage.getItem(RECENT_TRACKS_MIGRATION_KEY) !== 'done') {
      const stored = localStorage.getItem(RECENT_TRACKS_KEY);
      if (stored === null || stored === '0') localStorage.setItem(RECENT_TRACKS_KEY, String(LAST_24_HOURS_MS));
      localStorage.setItem(RECENT_TRACKS_MIGRATION_KEY, 'done');
    }
  } catch {}

  try {
    if (localStorage.getItem(RECORDING_BALANCED_MIGRATION_KEY) !== 'done') {
      const stored = JSON.parse(localStorage.getItem(RECORDING_KEY) || 'null') || {};
      const userChosen = localStorage.getItem(RECORDING_USER_CHOSEN_KEY) === '1';
      if (!userChosen && (!stored.profileId || stored.profileId === 'precise')) stored.profileId = 'balanced';
      if (!Number.isFinite(Number(stored.manualIntervalSec))) stored.manualIntervalSec = 5;
      if (!Number.isFinite(Number(stored.manualDistanceM))) stored.manualDistanceM = 5;
      localStorage.setItem(RECORDING_KEY, JSON.stringify(stored));
      localStorage.setItem(RECORDING_BALANCED_MIGRATION_KEY, 'done');
    }
  } catch {}

  try {
    if (localStorage.getItem(MESSAGE_TIMEOUT_MIGRATION_KEY) !== 'done') {
      const stored = localStorage.getItem(MESSAGE_TIMEOUT_KEY);
      if (stored === null || stored === '0') localStorage.setItem(MESSAGE_TIMEOUT_KEY, '5000');
      localStorage.setItem(MESSAGE_TIMEOUT_MIGRATION_KEY, 'done');
    }
  } catch {}

  document.title = 'Wander Travel ' + VERSION;
  const drawerVersion = document.querySelector('#drawer-version');
  if (drawerVersion) drawerVersion.textContent = 'Web ' + VERSION;
  const metadata = { source: 'runtime-version', ttlMs: Infinity, confidence: 1 };
  window.WanderContext?.set?.('app.version', VERSION, metadata);
  window.WanderContext?.set?.('app.webVersion', VERSION, metadata);
  window.WanderContext?.set?.('app.stagedStartup', true, metadata);
  window.WanderContext?.set?.('app.coreBeforeInterpretation', true, metadata);
  window.WanderContext?.set?.('app.coreOfflineContract', 'cursor-track-waypoints-ui', metadata);
  window.WanderContext?.set?.('sessions.rawTrackSchema', 2, metadata);
  window.WanderContext?.set?.('sessions.rawTrackPointFormat', 'latE7-array-v1', metadata);
  window.WanderContext?.set?.('sessions.recordingProfileDefault', 'balanced', metadata);
  window.WanderContext?.set?.('sessions.recordingDefaultIntervalSec', 5, metadata);
  window.WanderContext?.set?.('sessions.recordingDefaultDistanceM', 5, metadata);
  window.WanderContext?.set?.('sessions.recordingMaximumFrequencyHz', 1, metadata);
  window.WanderContext?.set?.('sessions.trackIntelligenceSchema', 1, metadata);
  window.WanderContext?.set?.('sessions.inconsistencyFilterEnabled', true, metadata);
  window.WanderContext?.set?.('sessions.unifiedTravelLog', true, metadata);
  window.WanderContext?.set?.('sessions.offlineFirstTravelLog', true, metadata);
  window.WanderContext?.set?.('sessions.activeTrackVisibleInTravelLog', true, metadata);
  window.WanderContext?.set?.('sessions.gpsStabilizationRequired', false, metadata);
  window.WanderContext?.set?.('sessions.immediateGpsCapture', true, metadata);
  window.WanderContext?.set?.('sessions.pendingReplayDeferredUntilCoreReady', true, metadata);
  window.WanderContext?.set?.('direction.simulatorThresholdFix', true, metadata);
  window.WanderContext?.set?.('direction.defaultThresholdKmh', 5, metadata);
  window.WanderContext?.set?.('direction.unifiedMotionSource', true, metadata);
  window.WanderContext?.set?.('direction.singleMarkerAuthority', true, metadata);
  window.WanderContext?.set?.('simulation.authoritativeEffectiveMotion', true, metadata);
  window.WanderContext?.set?.('simulation.recordAsRealPipeline', true, metadata);
  window.WanderContext?.set?.('simulation.visualTickMs', 200, metadata);
  window.WanderContext?.set?.('travelLog.treeViewDefault', true, metadata);
  window.WanderContext?.set?.('travelLog.cleanScreen', true, metadata);
  window.WanderContext?.set?.('travelLog.singleTreeOnly', true, metadata);
  window.WanderContext?.set?.('travelLog.filtersEnabled', false, metadata);
  window.WanderContext?.set?.('travelLog.summaryCountersEnabled', false, metadata);
  window.WanderContext?.set?.('travelLog.quickAddEnabled', false, metadata);
  window.WanderContext?.set?.('travelLog.hierarchy', 'day-episode-elements', metadata);
  window.WanderContext?.set?.('travelLog.activityLayerEnabled', false, metadata);
  window.WanderContext?.set?.('travelLog.episodesCollapsedByDefault', true, metadata);
  window.WanderContext?.set?.('travelLog.activeTrackSingleRepresentation', true, metadata);
  window.WanderContext?.set?.('travelLog.gpsJitterReconciliation', true, metadata);
  window.WanderContext?.set?.('travelLog.hideTechnicalTrackItems', true, metadata);
  window.WanderContext?.set?.('travelLog.poiOscillationCleanup', true, metadata);
  window.WanderContext?.set?.('tracks.cloudHistorySync', true, metadata);
  window.WanderContext?.set?.('tracks.cloudHistoryBidirectional', true, metadata);
  window.WanderContext?.set?.('tracks.historyDatabase', 'wander-track-history', metadata);
  window.WanderContext?.set?.('tracks.defaultNameFromStartedAt', true, metadata);
  window.WanderContext?.set?.('messages.defaultTimeoutMs', 5000, metadata);
  window.WanderContext?.set?.('tts.mapToggle', true, metadata);
  window.WanderContext?.set?.('map.zoomButtonsEnabled', true, metadata);
  window.WanderContext?.set?.('map.resumeRecoveryEnabled', true, metadata);
  window.WanderContext?.set?.('map.centerModes', 'middle-off', metadata);
  window.WanderContext?.set?.('map.controlsRegrouped', true, metadata);
  window.WanderContext?.set?.('map.landscapeControlsCompact', true, metadata);
  window.WanderContext?.set?.('currentPOI.switchHysteresis', true, metadata);
  window.WanderContext?.set?.('companion.wanderModeControl', true, metadata);
  window.WanderContext?.set?.('companion.wanderModeDefaultActive', false, metadata);
  window.WanderContext?.set?.('companion.startupInteractionEnabled', false, metadata);
  window.WanderContext?.set?.('companion.startupSilenceMs', 120000, metadata);
  window.WanderContext?.set?.('companion.morningBriefingStartupSilenceMs', 120000, metadata);
  window.WanderContext?.set?.('companion.morningBriefingRequiresUsefulContext', true, metadata);
  window.WanderContext?.set?.('companion.invalidWeatherOmitted', true, metadata);
})();