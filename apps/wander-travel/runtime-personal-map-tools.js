(() => {
  if (window.WanderPersonalMapTools) return;

  const base = window.WanderBase;
  const context = window.WanderContext;
  if (!base?.map) return;
  const map = base.map;

  let wanderModeActive = false;
  let wanderModeButton = null;

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

  function radarMarkup() {
    return '<svg class="ui-icon wander-radar-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="8.5"></circle>' +
      '<circle cx="12" cy="12" r="5.25"></circle>' +
      '<circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none"></circle>' +
      '<path d="M12 12 18.2 7.8"></path>' +
      '<path d="M12 3.5v2M20.5 12h-2M12 20.5v-2M3.5 12h2"></path>' +
      '</svg>';
  }

  function ensureWanderModeStyle() {
    if (document.querySelector('style[data-wander-mode-control]')) return;
    const style = document.createElement('style');
    style.dataset.wanderModeControl = 'true';
    style.textContent = '@keyframes wander-radar-pulse{0%{opacity:.72;transform:scale(.86)}70%,100%{opacity:0;transform:scale(1.35)}}' +
      '.wander-mode-action{position:relative;overflow:visible}' +
      '.wander-mode-action[data-active="true"]{background:var(--accent);color:#083b37;box-shadow:0 0 0 3px var(--accent-ring),var(--shadow)}' +
      '.wander-mode-action[data-active="true"]::after{content:"";position:absolute;inset:-3px;border:2px solid var(--accent);border-radius:50%;pointer-events:none;animation:wander-radar-pulse 2.2s ease-out infinite}' +
      '.wander-mode-action[data-active="true"] .wander-radar-icon{filter:drop-shadow(0 0 2px rgba(255,255,255,.5))}';
    document.head.appendChild(style);
  }

  function publishWanderMode(reason = 'state') {
    context?.set?.('companion.wanderModeActive', wanderModeActive, {
      source: 'wander-mode', kind: 'confirmed', confidence: 1, ttlMs: Infinity,
    });
    window.dispatchEvent(new CustomEvent('wander:wander-mode-change', {
      detail: { active: wanderModeActive, reason, at: Date.now() },
    }));
  }

  function syncWanderModeButton() {
    if (!wanderModeButton) return;
    const active = wanderModeActive;
    const label = active ? 'Desactivar modo Wander' : '¿Qué puedo hacer por acá? Activar modo Wander';
    wanderModeButton.dataset.active = String(active);
    wanderModeButton.setAttribute('aria-pressed', String(active));
    wanderModeButton.setAttribute('aria-label', label);
    wanderModeButton.title = active ? 'Modo Wander activo' : '¿Qué puedo hacer por acá?';
  }

  function requestCurrentSuggestion() {
    if (!wanderModeActive) return false;
    window.WanderProviders?.nearby?.refresh?.(true);
    window.WanderProviders?.container?.refresh?.(true);
    window.WanderProviders?.googleContainer?.apply?.();
    window.WanderProviders?.currentPOI?.detect?.();
    window.WanderProviders?.currentContainerBridge?.apply?.();
    window.WanderSituationEngine?.evaluate?.();

    const ask = () => window.WanderProactiveCompanion?.requestNowPlan?.() === true;
    if (ask()) return true;
    setTimeout(() => {
      if (!wanderModeActive || ask()) return;
      setTimeout(() => {
        if (!wanderModeActive || ask()) return;
        window.WanderUI?.showWander?.(
          'Modo Wander activo',
          'Estoy mirando qué hay cerca y te voy a avisar cuando encuentre algo que valga la pena.',
          { timeoutMs: 5000 },
        );
      }, 1800);
    }, 650);
    return false;
  }

  function setWanderMode(next, options = {}) {
    const active = next === true;
    if (active === wanderModeActive) {
      if (active && options.request !== false) requestCurrentSuggestion();
      return wanderModeActive;
    }
    wanderModeActive = active;
    syncWanderModeButton();
    publishWanderMode(options.reason || 'user');

    if (active) {
      window.WanderUI?.hideWander?.();
      if (options.request !== false) requestCurrentSuggestion();
    } else {
      window.WanderUI?.hideWander?.();
    }
    return wanderModeActive;
  }

  function toggleWanderMode() {
    return setWanderMode(!wanderModeActive, { reason: 'map-button', request: true });
  }

  window.WanderMode = Object.freeze({
    isActive: () => wanderModeActive,
    setActive: (value, options = {}) => setWanderMode(value === true, options),
    toggle: toggleWanderMode,
    requestNow: requestCurrentSuggestion,
  });

  const PersonalActions = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      ensureWanderModeStyle();
      const wrap = L.DomUtil.create('div', 'wander-map-actions wander-personal-map-actions');
      const waypointButton = makeButton('pin', 'Seleccionar punto en el centro del mapa');
      waypointButton.addEventListener('click', (event) => {
        event.preventDefault();
        if (window.WanderMapSelectedPoint?.openAtCenter) window.WanderMapSelectedPoint.openAtCenter();
        else window.dispatchEvent(new CustomEvent('wander:open-waypoint-center'));
      });

      wanderModeButton = L.DomUtil.create('button', 'wander-map-action wander-personal-map-action wander-mode-action');
      wanderModeButton.type = 'button';
      wanderModeButton.innerHTML = radarMarkup();
      L.DomEvent.disableClickPropagation(wanderModeButton);
      L.DomEvent.disableScrollPropagation(wanderModeButton);
      wanderModeButton.addEventListener('click', (event) => {
        event.preventDefault();
        toggleWanderMode();
      });
      syncWanderModeButton();

      wrap.append(waypointButton, wanderModeButton);
      return wrap;
    },
  });

  if (!map.getContainer().querySelector('.wander-personal-map-actions')) {
    map.addControl(new PersonalActions());
    const corner = map.getContainer().querySelector('.leaflet-bottom.leaflet-right');
    const personalWrap = corner?.querySelector('.wander-personal-map-actions')?.parentElement;
    if (personalWrap && corner.firstElementChild !== personalWrap) corner.insertBefore(personalWrap, corner.firstElementChild);
  }

  publishWanderMode('startup');

  window.WanderPersonalMapTools = Object.freeze({
    ready: true,
    getWanderMode: () => wanderModeActive,
    setWanderMode,
  });
  window.dispatchEvent(new CustomEvent('wander:personal-map-tools-ready'));
})();