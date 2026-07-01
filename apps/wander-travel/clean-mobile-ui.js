(() => {
  if (window.__wanderCleanUi) return;
  window.__wanderCleanUi = true;
  if (typeof map === 'undefined' || typeof marker === 'undefined') return;

  const SETTINGS_KEY = 'wander-travel-settings';
  const $ = (selector) => document.querySelector(selector);
  const LEGACY_TABS = ['#show-panel', '#show-guide-panel', '#show-dev-panel', '#show-settings-panel'];

  function loadSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; } }
  function saveSettings(settings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

  const style = document.createElement('style');
  style.textContent = `
    body.wander-clean-ui .round-button[aria-label*="Auriculares"]{display:none!important}
    body.wander-clean-ui #show-panel,body.wander-clean-ui #show-guide-panel,body.wander-clean-ui #show-dev-panel,body.wander-clean-ui #show-settings-panel,body.wander-clean-ui .side-panel-tab,body.wander-clean-ui .guide-panel-tab,body.wander-clean-ui .dev-panel-tab,body.wander-clean-ui .settings-panel-tab{display:none!important;visibility:hidden!important;pointer-events:none!important;opacity:0!important}
    body.wander-clean-ui #locate-button,body.wander-clean-ui #real-poi-button,body.wander-clean-ui #route-button,body.wander-clean-ui .zoom-tools{display:none!important;visibility:hidden!important;pointer-events:none!important}
    body.wander-clean-ui .map-tools{top:18px!important;right:18px!important;left:auto!important;align-items:flex-end!important;gap:10px!important;z-index:900!important}
    body.wander-clean-ui .map-tool,body.wander-clean-ui .clean-menu-button{width:50px!important;height:50px!important;min-width:50px!important;min-height:50px!important;padding:0!important;border:0!important;border-radius:50%!important;display:grid!important;place-items:center!important;background:rgba(255,255,255,.97)!important;color:#173f3b!important;box-shadow:0 10px 26px rgba(20,35,55,.18)!important;font-size:0!important;line-height:0!important;cursor:pointer!important;overflow:hidden!important;position:relative!important}
    body.wander-clean-ui .map-tool svg,body.wander-clean-ui .clean-menu-button svg{display:block!important;width:26px!important;height:26px!important;stroke:currentColor!important;stroke-width:2.2!important;fill:none!important;stroke-linecap:round!important;stroke-linejoin:round!important;pointer-events:none!important}
    body.wander-clean-ui #track-route-button.active{background:#d84848!important;color:#fff!important}
    body.wander-clean-ui #track-route-button .record-dot{fill:currentColor!important;stroke:none!important}
    body.wander-clean-ui .location-readout{display:none!important}
    body.wander-clean-ui .status-rail{display:none!important}
    body.wander-clean-ui.show-movement-mode .status-rail,body.wander-clean-ui.show-movement-pace .status-rail,body.wander-clean-ui.show-movement-group .status-rail{display:flex!important}
    body.wander-clean-ui .status-rail .metric{display:none!important}
    body.wander-clean-ui.show-movement-mode .status-rail .metric:nth-child(1){display:block!important}
    body.wander-clean-ui.show-movement-pace .status-rail .metric:nth-child(2){display:block!important}
    body.wander-clean-ui.show-movement-group .status-rail .metric:nth-child(3){display:block!important}
    .clean-menu{position:absolute;z-index:1200;right:18px;top:78px;display:none;min-width:220px;padding:8px;border-radius:16px;background:#fff;box-shadow:0 18px 50px rgba(20,35,55,.25)}
    .clean-menu.is-open{display:grid;gap:6px}.clean-menu button{border:0;background:#f5f7f9;border-radius:12px;padding:12px 13px;text-align:left;font-weight:800;color:#173f3b;cursor:pointer}
    .clean-menu-backdrop{position:absolute;inset:0;z-index:1100;background:transparent;display:none}.clean-menu-backdrop.is-open{display:block}
    body.wander-clean-ui .top-bar{right:84px}
    @media(max-width:820px){body.wander-clean-ui .top-bar{display:none!important}body.wander-clean-ui .map-tools{top:14px!important;right:14px!important}.clean-menu{right:14px;top:72px}.companion-panel{bottom:76px!important;width:calc(100% - 24px)!important}.companion-tab{bottom:18px!important}}
  `;
  document.head.appendChild(style);
  document.body.classList.add('wander-clean-ui');

  function hardHideLegacyTabs() {
    LEGACY_TABS.forEach((selector) => {
      const element = $(selector);
      if (!element) return;
      element.style.setProperty('display', 'none', 'important');
      element.style.setProperty('visibility', 'hidden', 'important');
      element.style.setProperty('pointer-events', 'none', 'important');
      element.style.setProperty('opacity', '0', 'important');
      element.setAttribute('aria-hidden', 'true');
    });
  }

  function iconizeButtons() {
    const locate = $('#locate-button');
    if (locate) {
      locate.hidden = true;
      locate.setAttribute('aria-hidden', 'true');
      locate.replaceChildren();
    }
    const track = $('#track-route-button');
    if (track) {
      track.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="record-dot" cx="12" cy="12" r="6"/></svg>';
      track.setAttribute('aria-label', 'Grabar recorrido');
      track.title = 'Grabar recorrido';
    }
  }

  function closeMenu() {
    $('#wander-clean-menu')?.classList.remove('is-open');
    $('.clean-menu-backdrop')?.classList.remove('is-open');
  }

  function closePanels() {
    $('.app-shell')?.classList.add('panel-collapsed');
    document.body.classList.remove('dev-panel-open');
    $('#developer-panel')?.classList.add('dev-collapsed');
  }

  function showTravel() { closePanels(); $('.app-shell')?.classList.remove('panel-collapsed'); }
  function showDeveloper() { closePanels(); document.body.classList.add('dev-panel-open'); $('#developer-panel')?.classList.remove('dev-collapsed'); }
  function showSimulator() {
    closePanels();
    const overlay = $('#movement-simulator-overlay');
    if (overlay) overlay.classList.remove('is-hidden');
    const toggle = $('#toggle-movement-overlay');
    if (toggle) toggle.checked = true;
    localStorage.setItem('wander-travel-simulator-overlay-visible', 'true');
  }
  function showBoat() {
    closePanels();
    window.WanderContextEngine?.noteBoatPlaceholder?.();
    const panel = $('.companion-panel');
    const title = $('#wander-title');
    const message = $('#wander-message');
    if (title) title.textContent = 'Wander Boat';
    if (message) message.textContent = 'Boat queda reservado para funciones náuticas. Por ahora Travel sigue activo.';
    panel?.classList.remove('is-hidden');
  }

  function createMenu() {
    if ($('#wander-clean-menu-button')) return;
    const mapTools = $('.map-tools');
    if (!mapTools) return;
    const button = document.createElement('button');
    button.id = 'wander-clean-menu-button';
    button.className = 'clean-menu-button';
    button.type = 'button';
    button.setAttribute('aria-label', 'Menú');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>';
    mapTools.prepend(button);

    const backdrop = document.createElement('div');
    backdrop.className = 'clean-menu-backdrop';
    const menu = document.createElement('nav');
    menu.id = 'wander-clean-menu';
    menu.className = 'clean-menu';
    menu.setAttribute('aria-label', 'Menú principal');
    menu.innerHTML = `
      <button type="button" data-main-menu="travel">Travel</button>
      <button type="button" data-main-menu="boat">Barco</button>
      <button type="button" data-main-menu="developer">Desarrollador</button>
      <button type="button" data-main-menu="simulator">Simulador</button>
    `;
    $('.map-stage')?.append(backdrop, menu);

    button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); hardHideLegacyTabs(); menu.classList.toggle('is-open'); backdrop.classList.toggle('is-open', menu.classList.contains('is-open')); });
    backdrop.addEventListener('click', closeMenu);
    menu.querySelector('[data-main-menu="travel"]')?.addEventListener('click', () => { closeMenu(); showTravel(); });
    menu.querySelector('[data-main-menu="boat"]')?.addEventListener('click', () => { closeMenu(); showBoat(); });
    menu.querySelector('[data-main-menu="developer"]')?.addEventListener('click', () => { closeMenu(); showDeveloper(); });
    menu.querySelector('[data-main-menu="simulator"]')?.addEventListener('click', () => { closeMenu(); showSimulator(); });
  }

  function addVisualSettings() {
    if ($('#setting-show-mode')) return;
    const list = $('#settings-panel .settings-list');
    if (!list) return;
    const card = document.createElement('section');
    card.className = 'settings-card visual-aids-card';
    card.innerHTML = '<div><h3>Ayudas visuales</h3><p>Mostrar u ocultar datos permanentes sobre el mapa.</p><div class="poi-source-grid"><label><input id="setting-show-mode" type="checkbox" data-visual-aid="showMode" /> Estado</label><label><input id="setting-show-pace" type="checkbox" data-visual-aid="showPace" /> Velocidad</label><label><input id="setting-show-group" type="checkbox" data-visual-aid="showGroup" /> Rumbo</label></div></div>';
    list.appendChild(card);
    const settings = loadSettings();
    settings.visualAids = { showMode: false, showPace: false, showGroup: false, ...(settings.visualAids || {}) };
    saveSettings(settings);
    function apply() {
      const current = loadSettings().visualAids || {};
      document.body.classList.toggle('show-movement-mode', Boolean(current.showMode));
      document.body.classList.toggle('show-movement-pace', Boolean(current.showPace));
      document.body.classList.toggle('show-movement-group', Boolean(current.showGroup));
      if ($('#setting-show-mode')) $('#setting-show-mode').checked = Boolean(current.showMode);
      if ($('#setting-show-pace')) $('#setting-show-pace').checked = Boolean(current.showPace);
      if ($('#setting-show-group')) $('#setting-show-group').checked = Boolean(current.showGroup);
    }
    card.querySelectorAll('[data-visual-aid]').forEach((input) => {
      input.addEventListener('change', () => {
        const next = loadSettings();
        next.visualAids = { showMode: false, showPace: false, showGroup: false, ...(next.visualAids || {}) };
        next.visualAids[input.dataset.visualAid] = input.checked;
        saveSettings(next);
        apply();
      });
    });
    apply();
  }

  function disableStartupTracking() {
    const settings = loadSettings();
    settings.trackRouteByDefault = false;
    saveSettings(settings);
    const toggle = $('#setting-track-default');
    if (toggle) toggle.checked = false;
  }

  iconizeButtons();
  createMenu();
  addVisualSettings();
  hardHideLegacyTabs();
  new MutationObserver(hardHideLegacyTabs).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
  window.setInterval(hardHideLegacyTabs, 500);
  window.setTimeout(disableStartupTracking, 120);
  window.setTimeout(disableStartupTracking, 600);
  window.setTimeout(() => map.invalidateSize(true), 300);
})();