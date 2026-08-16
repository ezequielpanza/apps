(() => {
  if (window.WanderPersistenceConfig) return;

  window.WanderPersistenceConfig = Object.freeze({
    schemaVersion: 1,
    provider: 'google-sheets-drive',
    spreadsheetId: '11hQDPp2nKDyaI8SHvRwPujIgGSN15Mt1_AlbQ6WxRCU',
    tracksFolderId: '1LlNCtOA5vLlxyP-ltiL8GRwerTtNES1W',
    endpoint: '/api/persistence',
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
