(() => {
  if (window.WanderTrackReviewUI) return;
  const engine = () => window.WanderTrackIntelligence;
  const container = () => document.querySelector('#track-list');

  function formatDuration(ms) {
    const minutes = Math.max(0, Math.round(Number(ms || 0) / 60000));
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }
  function label(track) {
    if (track.type === 'stay') return 'Estadía';
    if (track.type === 'inconsistency') return 'Datos inconsistentes';
    const map = { walking: 'Caminata', running: 'Carrera', cycling: 'Bicicleta', driving: 'Traslado en vehículo', sailing: 'Navegación', stationary: 'Estadía' };
    return map[track.activity] || 'Track';
  }
  function reasonText(track) {
    const map = {
      impossible_speed: 'Salto con velocidad imposible', poor_accuracy: 'Precisión insuficiente',
      time_gap: 'Interrupción prolongada', time_discontinuity: 'Orden temporal inconsistente',
    };
    return (track.reasons || []).map((reason) => map[reason] || reason).join(' · ');
  }
  function button(text, action, trackId) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.dataset.trackReviewAction = action;
    b.dataset.trackId = trackId;
    return b;
  }
  async function render() {
    const root = container();
    if (!root || !engine()) return;
    const tracks = (await engine().listTracks()).filter((track) => track.status !== 'deleted').sort((a, b) => b.startedAt - a.startedAt);
    if (!tracks.length) return;
    const fragment = document.createDocumentFragment();
    const heading = document.createElement('div');
    heading.className = 'track-intelligence-heading';
    heading.innerHTML = '<strong>Tracks interpretados</strong><small>Verde: válido · Ámbar: dudoso · Rojo: irrelevante</small>';
    fragment.appendChild(heading);
    tracks.slice(0, 100).forEach((track) => {
      const card = document.createElement('article');
      card.className = `track-intelligence-card relevance-${track.relevance}`;
      card.style.borderLeft = `5px solid ${track.color || '#14b8a6'}`;
      const title = document.createElement('strong');
      title.textContent = label(track);
      const meta = document.createElement('span');
      meta.textContent = `${new Date(track.startedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · ${formatDuration(track.durationMs)} · ${Math.round(track.distanceM || 0)} m`;
      card.append(title, meta);
      const reason = reasonText(track);
      if (reason) {
        const p = document.createElement('small');
        p.textContent = reason;
        card.appendChild(p);
      }
      const actions = document.createElement('div');
      actions.className = 'track-intelligence-actions';
      actions.append(
        button('Marcar válido', 'valid', track.id),
        button('Mantener ignorado', 'irrelevant', track.id),
        button('Eliminar', 'delete', track.id)
      );
      card.appendChild(actions);
      fragment.appendChild(card);
    });
    root.querySelectorAll('.track-intelligence-heading,.track-intelligence-card').forEach((node) => node.remove());
    root.prepend(fragment);
  }
  async function handle(event) {
    const target = event.target.closest('[data-track-review-action]');
    if (!target || !engine()) return;
    const action = target.dataset.trackReviewAction;
    const trackId = target.dataset.trackId;
    if (action === 'delete') await engine().deleteTrack(trackId, false);
    else await engine().setRelevance(trackId, action, 'user-review');
    render();
  }
  document.addEventListener('click', handle);
  window.addEventListener('wander:track-finalized', render);
  window.addEventListener('wander:sessions-changed', render);
  setInterval(render, 30000);
  window.WanderTrackReviewUI = { render };
  setTimeout(render, 1500);
})();
