(() => {
  if (window.WanderPersistenceConfig) return;

  const STORAGE_KEY = 'wander.googleDrive.storage.v2';
  function storageState() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return value && typeof value === 'object' ? value : {};
    } catch { return {}; }
  }

  window.WanderPersistenceConfig = Object.freeze({
    schemaVersion: 2,
    provider: 'google-drive-oauth',
    get spreadsheetId() { return storageState().spreadsheetId || null; },
    get tracksFolderId() { return storageState().tracksFolderId || null; },
    endpoint: '/__wander_google_drive_persistence__',
    offlineFirst: true,
    tables: Object.freeze({
      waypoints: 'Waypoints',
      bitacora: 'Bitacora',
      sessions: 'Sesiones',
      trackPoints: 'TrackPoints',
      settings: 'Ajustes',
      hud: 'HUD',
    }),
  });
})();
