(() => {
  if (typeof map === 'undefined' || typeof marker === 'undefined' || typeof L === 'undefined') return;

  const SETTINGS_KEY = 'wander-travel-settings';
  const $ = (selector) => document.querySelector(selector);
  const LEGACY_TABS = ['#show-panel', '#show-guide-panel', '#show-dev-panel', '#show-settings-panel'];
  const ORIENTATION_MODES = ['center', 'route', 'compass', 'north'];
  let locateMode = 0;
  let lastPoint = marker.getLatLng();
  let routeBearing = 0;
  let compassBearing = null;

  const style = document.createElement('style');
  style.textContent = `
    body.wander-clean-ui .round-button[aria-label*="Auriculares"]{display:none!important}
    body.wander-clean-ui #show-panel,body.wander-clean-ui #show-guide-panel,body.wander-clean-ui #show-dev-panel,body.wander-clean-ui #show-settings-panel,body.wander-clean-ui .side-panel-tab,body.wander-clean-ui .guide-panel-tab,body.wander-clean-ui .dev-panel-tab,body.wander-clean-ui .settings-panel-tab{display:none!important;visibility:hidden!important;pointer-events:none!important;opacity:0!important}
    body.wander-clean-ui #real-poi-button,body.wander-clean-ui #route-button,body.wander-clean-ui .zoom-tools{display:none!important}
    body.wander-clean-ui .map-tools{top:18px!important;right:18px!important;left:auto!important;align-items:flex-end!important;gap:10px!important;z-index:900!important}
    body.wander-clean-ui .map-tool,body.wander-clean-ui .clean-menu-button{width:50px!important;height:50px!important;min-width:50px!important;min-height:50px!important;padding:0!important;border:0!important;border-radius:50%!important;display:grid!important;place-items:center!important;background:rgba(255,255,255,.97)!important;color:#173f3b!important;box-shadow:0 10px 26px rgba(20,35,55,.18)!important;font-size:0!important;line-height:0!important;cursor:pointer!important;overflow:hidden!important}
    body.wander-clean-ui .map-tool svg,body.wander-clean-ui .clean-menu-button svg{display:block!important;width:26px!important;height:26px!important;stroke:currentColor!important;stroke-width:2.2!important;fill:none!important;stroke-linecap:round!important;stroke-linejoin:round!important;pointer-events:none!important;transition:transform .18s ease!important}
    body.wander-clean-ui #locate-button .locate-arrow{fill:currentColor!important;stroke:none!important}
    body.wander-clean-ui #locate-button .locate-n{display:none;font:800 8px system-ui;fill:currentColor;stroke:none}
    body.wander-clean-ui #locate-button[data-orientation="compass"]{background:#173f3b!important;color:#fff!important}
    body.wander-clean-ui #locate-button[data-orientation="north"] .locate-n{display:block!important}
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

  function loadSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; } }
  function saveSettings(settings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

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

  function tell(titleText, bodyText) {
    const panel = $('.companion-panel');
    const title = $('#wander-title');
    const message = $('#wander-message');
    if (!panel || !title || !message) return;
    title.textContent = titleText;
    message.textContent = bodyText;
    panel.classList.remove('is-hidden');
  }

  function disableStartupTracking() {
    const settings = loadSettings();
    settings.trackRouteByDefault = false;
    saveSettings(settings);
    const toggle = $('#setting-track-default');
    if (toggle) toggle.checked = false;
    const trackButton = $('#track-route-button');
    const badge = $('#track-status-badge');
    const active = trackButton?.classList.contains('active') || badge?.textContent === 'ON';
    if (active) trackButton?.click();
  }

  function locateIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="locate-arrow" d="M12 3.2 19.7 20.8 12 17.2 4.3 20.8 12 3.2Z"/><text class="locate-n" x="12" y="8.2" text-anchor="middle">N</text></svg>';
  }

  function iconizeButtons() {
    const locate = $('#locate-button');
    if (locate) {
      locate.innerHTML = locateIcon();
      locate.setAttribute('aria-label', 'Orientación y centrado');
      locate.title = 'Orientación';
      locate.dataset.orientation = ORIENTATION_MODES[locateMode];
    }
    const track = $('#track-route-button');
    if (track) {
      track.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="record-dot" cx="12" cy="12" r="6"/></svg>';
      track.setAttribute('aria-label', 'Grabar recorrido');
      track.title = 'Grabar recorrido';
    }
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
    menu.innerHTML = '<button type="button" data-open-panel="trip">Viaje</button><button type="button" data-open-panel="guide">Guía</button><button type="button" data-open-panel="developer">Desarrollador</button><button type="button" data-open-panel="settings">Configuración</button>';
    $('.map-stage')?.append(backdrop, menu);

    function closeMenu() { menu.classList.remove('is-open'); backdrop.classList.remove('is-open'); }
    function toggleMenu() { menu.classList.toggle('is-open'); backdrop.classList.toggle('is-open', menu.classList.contains('is-open')); }
    button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); hardHideLegacyTabs(); toggleMenu(); });
    backdrop.addEventListener('click', closeMenu);
    menu.querySelectorAll('[data-open-panel]').forEach((item) => {
      item.addEventListener('click', () => {
        const panel = item.dataset.openPanel;
        const tab = panel === 'trip' ? $('#show-panel') : panel === 'guide' ? $('#show-guide-panel') : panel === 'developer' ? $('#show-dev-panel') : $('#show-settings-panel');
        closeMenu();
        tab?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        window.setTimeout(hardHideLegacyTabs, 0);
        window.setTimeout(hardHideLegacyTabs, 300);
      });
    });
  }

  function addVisualSettings() {
    if ($('#setting-show-mode')) return;
    const list = $('#settings-panel .settings-list');
    if (!list) return;
    const card = document.createElement('section');
    card.className = 'settings-card visual-aids-card';
    card.innerHTML = '<div><h3>Ayudas visuales</h3><p>Mostrar u ocultar datos permanentes sobre el mapa. Por defecto Wander prioriza una pantalla limpia.</p><div class="poi-source-grid"><label><input id="setting-show-mode" type="checkbox" data-visual-aid="showMode" /> Modo</label><label><input id="setting-show-pace" type="checkbox" data-visual-aid="showPace" /> Ritmo</label><label><input id="setting-show-group" type="checkbox" data-visual-aid="showGroup" /> Grupo</label></div></div>';
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

  function bearing(a, b) {
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function setLocateIconRotation(degrees = 0) {
    const svg = $('#locate-button svg');
    if (svg) svg.style.transform = `rotate(${degrees}deg)`;
  }

  function updateLocateState() {
    const locate = $('#locate-button');
    if (!locate) return;
    locate.dataset.orientation = ORIENTATION_MODES[locateMode] || 'center';
    locate.title = locateMode === 0 ? 'Modo centrado' : locateMode === 1 ? 'Modo ruta' : locateMode === 2 ? 'Modo brújula' : 'Norte arriba';
  }

  async function ensureCompass() {
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        return (await DeviceOrientationEvent.requestPermission()) === 'granted';
      }
      return true;
    } catch { return false; }
  }

  window.addEventListener('deviceorientationabsolute', (event) => { if (Number.isFinite(event.alpha)) compassBearing = event.alpha; });
  window.addEventListener('deviceorientation', (event) => {
    if (Number.isFinite(event.webkitCompassHeading)) compassBearing = event.webkitCompassHeading;
    else if (Number.isFinite(event.alpha)) compassBearing = 360 - event.alpha;
  });

  window.setInterval(() => {
    const current = marker.getLatLng();
    if (map.distance(lastPoint, current) > 2) routeBearing = bearing(lastPoint, current);
    lastPoint = L.latLng(current.lat, current.lng);
    if (locateMode === 1) setLocateIconRotation(routeBearing);
    if (locateMode === 2 && Number.isFinite(compassBearing)) setLocateIconRotation(compassBearing);
  }, 1000);

  function isUserCentered(target) {
    const centerPoint = map.latLngToContainerPoint(map.getCenter());
    const targetPoint = map.latLngToContainerPoint(target);
    return centerPoint.distanceTo(targetPoint) < 36;
  }

  function panToUserOnlyIfNeeded(target) {
    if (!target || isUserCentered(target)) return;
    map.panTo(target, { animate: true });
    window.setTimeout(() => map.invalidateSize(true), 80);
  }

  function refreshMarkerFromGpsThenMaybeCenter() {
    const fallback = () => panToUserOnlyIfNeeded(marker.getLatLng());
    if (!navigator.geolocation) return fallback();
    navigator.geolocation.getCurrentPosition((position) => {
      const point = L.latLng(position.coords.latitude, position.coords.longitude);
      marker.setLatLng(point);
      panToUserOnlyIfNeeded(point);
    }, fallback, { enableHighAccuracy: true, timeout: 6000, maximumAge: 3000 });
  }

  function applyLocateMode() {
    if (locateMode === 0) setLocateIconRotation(0);
    else if (locateMode === 1) setLocateIconRotation(routeBearing || 0);
    else if (locateMode === 2) {
      if (Number.isFinite(compassBearing)) setLocateIconRotation(compassBearing);
      else setLocateIconRotation(0);
    } else setLocateIconRotation(0);
    updateLocateState();
  }

  function installLocateCycle() {
    const locate = $('#locate-button');
    if (!locate) return;
    locate.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      locateMode = (locateMode + 1) % ORIENTATION_MODES.length;
      if (locateMode === 2) {
        const ok = await ensureCompass();
        if (!ok) {
          tell('Brújula no disponible', 'No pude activar la orientación por brújula en este dispositivo. Sigo con el siguiente modo.');
          locateMode = 3;
        }
      }
      applyLocateMode();
      refreshMarkerFromGpsThenMaybeCenter();
    }, true);
    applyLocateMode();
  }

  iconizeButtons();
  createMenu();
  addVisualSettings();
  installLocateCycle();
  hardHideLegacyTabs();
  new MutationObserver(hardHideLegacyTabs).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
  window.setInterval(hardHideLegacyTabs, 500);
  window.setTimeout(disableStartupTracking, 120);
  window.setTimeout(disableStartupTracking, 600);
  window.setTimeout(() => map.invalidateSize(true), 300);
})();
