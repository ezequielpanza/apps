(() => {
  if (window.WanderPersonalMapTools) return;

  const context = window.WanderContext;
  const base = window.WanderBase;
  if (!base?.map) return;

  const map = base.map;
  const AUTO_TRACK_KEY = 'wander.tracks.autoEnabled.v1';
  const HOLD_MS = 650;
  let suppressTrackClick = false;
  let trackButton = null;

  const tracks = () => window.WanderTracks || null;

  function makeButton(iconName, label) {
    const button = L.DomUtil.create('button', 'wander-map-action wander-personal-map-action');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="wander-icons.svg#${iconName}"></use></svg>`;
    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.disableScrollPropagation(button);
    return button;
  }

  function bindHold(button, onClick, onHold, suppressSetter) {
    let timer = null;
    let held = false;
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    button.addEventListener('pointerdown', () => {
      held = false;
      cancel();
      timer = setTimeout(() => {
        held = true;
        suppressSetter(true);
        navigator.vibrate?.(35);
        onHold();
      }, HOLD_MS);
    });
    button.addEventListener('pointerup', cancel);
    button.addEventListener('pointercancel', cancel);
    button.addEventListener('pointerleave', cancel);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (!held) onClick();
    });
  }

  function autoTrackEnabled() {
    try {
      const stored = localStorage.getItem(AUTO_TRACK_KEY);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  }

  function setAutoTrackEnabled(enabled) {
    try { localStorage.setItem(AUTO_TRACK_KEY, String(Boolean(enabled))); } catch {}
    context?.set?.('tracks.autoRecording', Boolean(enabled), { source: 'track-control', kind: 'confirmed', confidence: 1 });
  }

  function effectivePosition() {
    return base.getPosition?.() || window.WanderMapPosition?.getPosition?.() || null;
  }

  function syncTrackButton() {
    if (!trackButton) return;
    const api = tracks();
    const ready = Boolean(api?.isRecording);
    const recording = Boolean(api?.isRecording?.());
    trackButton.disabled = !ready;
    trackButton.classList.toggle('is-recording', recording);
    trackButton.setAttribute('aria-pressed', String(recording));
    trackButton.title = !ready
      ? 'Preparando recorridos'
      : recording
        ? 'Pausar grabación automática'
        : 'Reanudar grabación automática';
    trackButton.setAttribute('aria-label', trackButton.title);
    trackButton.style.color = recording ? '#d84848' : 'var(--green)';
    trackButton.style.boxShadow = recording ? '0 0 0 3px rgba(216,72,72,.22), var(--shadow)' : 'var(--shadow)';
  }

  function toggleTrackRecording() {
    if (suppressTrackClick) {
      suppressTrackClick = false;
      return;
    }
    const api = tracks();
    if (!api) return;

    if (api.isRecording?.()) {
      api.stop?.();
      setAutoTrackEnabled(false);
      window.WanderUI?.showWander('Grabación pausada', 'El tramo actual quedó guardado. Al reanudar comenzará uno nuevo.');
    } else {
      const started = api.start?.();
      if (started) setAutoTrackEnabled(true);
    }
    syncTrackButton();
  }

  function openTracksManager() {
    suppressTrackClick = true;
    window.WanderScreen?.open?.('routes');
  }

  function ensureAutoRecording() {
    const api = tracks();
    if (!api) {
      syncTrackButton();
      return;
    }
    context?.set?.('tracks.autoRecording', autoTrackEnabled(), { source: 'track-control', kind: 'confirmed', confidence: 1 });
    if (!autoTrackEnabled() || api.isRecording?.()) {
      syncTrackButton();
      return;
    }
    if (effectivePosition()) api.start?.({ silent: true });
    syncTrackButton();
  }

  function addTrackPoint() {
    const api = tracks();
    if (!api || !autoTrackEnabled()) return;
    if (!api.isRecording?.()) ensureAutoRecording();
    const position = effectivePosition();
    if (position) api.addPoint?.(position);
    syncTrackButton();
  }

  const PersonalActions = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'wander-map-actions wander-personal-map-actions');
      const waypointButton = makeButton('pin', 'Seleccionar punto en el centro del mapa');
      trackButton = makeButton('record', 'Preparando recorridos');

      waypointButton.addEventListener('click', (event) => {
        event.preventDefault();
        if (window.WanderMapSelectedPoint?.openAtCenter) window.WanderMapSelectedPoint.openAtCenter();
        else window.dispatchEvent(new CustomEvent('wander:open-waypoint-center'));
      });
      bindHold(trackButton, toggleTrackRecording, openTracksManager, (value) => { suppressTrackClick = value; });
      wrap.append(waypointButton, trackButton);
      syncTrackButton();
      return wrap;
    },
  });

  if (!map.getContainer().querySelector('.wander-personal-map-actions')) {
    map.addControl(new PersonalActions());
    const corner = map.getContainer().querySelector('.leaflet-bottom.leaflet-right');
    const personalWrap = corner?.querySelector('.wander-personal-map-actions')?.parentElement;
    if (personalWrap && corner.firstElementChild !== personalWrap) corner.insertBefore(personalWrap, corner.firstElementChild);
  }

  context?.subscribe?.((key) => {
    if (typeof key !== 'string') return;
    if (key === 'location.effective' || key.startsWith('location.effective.')) addTrackPoint();
  });

  window.setInterval(() => {
    ensureAutoRecording();
    addTrackPoint();
  }, 15000);

  window.WanderPersonalMapTools = Object.freeze({
    syncTrackButton,
    ensureAutoRecording,
  });

  ensureAutoRecording();
  window.dispatchEvent(new CustomEvent('wander:personal-map-tools-ready'));
})();