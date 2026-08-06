(() => {
  if (window.WanderActiveTrackLogBridge) return;

  function formatDuration(ms) {
    const min = Math.max(0, Math.floor(Number(ms || 0) / 60000));
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
  }

  function formatDistance(m) {
    const value = Math.max(0, Number(m || 0));
    return value < 1000 ? `${Math.round(value)} m` : `${(value / 1000).toFixed(1)} km`;
  }

  function timeLabel(at) {
    return new Date(Number(at || Date.now())).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  function activityLabel(activity) {
    const labels = {
      walking: 'Caminata', running: 'Carrera', cycling: 'Bicicleta', driving: 'Vehículo',
      sailing: 'Navegación', train: 'Tren', bus: 'Autobús', stationary: 'Estadía', unknown: 'Actividad en curso'
    };
    return labels[String(activity || 'unknown').toLowerCase()] || 'Actividad en curso';
  }

  function currentActive() {
    const intelligence = window.WanderTrackIntelligence?.status?.()?.active;
    if (intelligence) return { ...intelligence, source: 'track-intelligence' };

    const snapshot = window.WanderSessionEngine?.snapshot?.() || {};
    const activeSession = snapshot.active;
    const segment = [...(activeSession?.segments || [])].reverse().find((item) => item?.type === 'movement' && !item.endedAt);
    if (!segment) return null;
    return {
      id: segment.id || `active-${segment.startedAt}`,
      startedAt: segment.startedAt,
      endedAt: Date.now(),
      durationMs: Date.now() - Number(segment.startedAt || Date.now()),
      distanceM: Number(segment.distanceM || 0),
      activity: segment.method || 'unknown',
      source: 'session-engine',
    };
  }

  function mount() {
    const tree = document.querySelector('[data-app-screen="travel-log"] #travel-log-content .utl-tree');
    const today = tree?.querySelector('.utl-day[data-day]');
    if (!tree || !today) return;

    tree.querySelectorAll('[data-active-track-bridge]').forEach((node) => node.remove());
    const active = currentActive();
    if (!active) return;

    const dayKey = (() => {
      const d = new Date(active.startedAt || Date.now());
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const targetDay = tree.querySelector(`.utl-day[data-day="${dayKey}"]`);
    if (!targetDay) return;

    const body = targetDay.querySelector(':scope > div');
    if (!body) return;

    const folder = document.createElement('details');
    folder.open = true;
    folder.className = 'utl-folder utl-episode';
    folder.dataset.activeTrackBridge = 'true';
    folder.innerHTML = `
      <summary><span>●</span><strong>Track actual</strong><small>En curso</small></summary>
      <div>
        <details class="utl-folder utl-activity" open>
          <summary><span>▱</span><strong>${activityLabel(active.activity)}</strong><small>1 track</small></summary>
          <div>
            <article class="utl-item utl-track" data-track-id="${active.id || 'active'}">
              <span class="utl-dot"></span>
              <div>
                <strong>${timeLabel(active.startedAt)} · ${formatDuration(Date.now() - Number(active.startedAt || Date.now()))}</strong>
                <p>${formatDistance(active.distanceM)} · En curso</p>
                <small>Grabación local activa</small>
              </div>
            </article>
          </div>
        </details>
      </div>`;
    body.prepend(folder);
  }

  const refresh = () => {
    window.WanderUnifiedTravelLog?.render?.();
    setTimeout(mount, 80);
  };

  window.addEventListener('wander:sessions-changed', refresh);
  window.addEventListener('wander:raw-location-sample', refresh);
  window.addEventListener('wander:track-finalized', refresh);
  window.addEventListener('wander:screen-change', (event) => {
    if (event.detail?.to === 'travel-log') setTimeout(mount, 120);
  });
  const observer = new MutationObserver(() => setTimeout(mount, 0));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(mount, 1000);

  window.WanderActiveTrackLogBridge = Object.freeze({ mount, refresh });
  setTimeout(mount, 1500);
})();