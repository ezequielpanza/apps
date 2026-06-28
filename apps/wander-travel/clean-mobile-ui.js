(() => {
  if (typeof map === 'undefined' || typeof marker === 'undefined') return;

  const SETTINGS_KEY = 'wander-travel-settings';
  const $ = (selector) => document.querySelector(selector);

  const style = document.createElement('style');
  style.textContent = `
    body.wander-clean-ui .round-button[aria-label*="Auriculares"]{display:none!important}
    body.wander-clean-ui .side-panel-tab,
    body.wander-clean-ui .guide-panel-tab,
    body.wander-clean-ui .dev-panel-tab,
    body.wander-clean-ui .settings-panel-tab{display:none!important}
    body.wander-clean-ui #real-poi-button,
    body.wander-clean-ui #route-button,
    body.wander-clean-ui .zoom-tools{display:none!important}
    body.wander-clean-ui .map-tools{top:18px;right:18px;left:auto;align-items:flex-end;gap:10px}
    body.wander-clean-ui .map-tool,
    body.wander-clean-ui .clean-menu-button{width:48px;height:48px;min-width:48px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.96);color:#173f3b;box-shadow:0 10px 26px rgba(20,35,55,.18);font-size:0;cursor:pointer}
    body.wander-clean-ui .map-tool svg,
    body.wander-clean-ui .clean-menu-button svg{width:24px;height:24px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
    body.wander-clean-ui #track-route-button.active{background:#d84848;color:#fff}
    body.wander-clean-ui #track-route-button .record-dot{fill:currentColor;stroke:none}
    body.wander-clean-ui #locate-button[data-orientation="route"] svg{transform:rotate(35deg)}
    body.wander-clean-ui #locate-button[data-orientation="compass"]{background:#173f3b;color:#fff}
    body.wander-clean-ui #locate-button[data-orientation="north"]{background:#fff;color:#173f3b}
    body.wander-clean-ui .location-readout{display:none!important}
    body.wander-clean-ui .status-rail{display:none!important}
    body.wander-clean-ui.show-movement-mode .status-rail,
    body.wander-clean-ui.show-movement-pace .status-rail,
    body.wander-clean-ui.show-movement-group .status-rail{display:flex!important}
    body.wander-clean-ui .status-rail .metric{display:none!important}
    body.wander-clean-ui.show-movement-mode .status-rail .metric:nth-child(1){display:block!important}
    body.wander-clean-ui.show-movement-pace .status-rail .metric:nth-child(2){display:block!important}
    body.wander-clean-ui.show-movement-group .status-rail .metric:nth-child(3){display:block!important}
    .clean-menu{position:absolute;z-index:1200;right:18px;top:76px;display:none;min-width:220px;padding:8px;border-radius:16px;background:#fff;box-shadow:0 18px 50px rgba(20,35,55,.25)}
    .clean-menu.is-open{display:grid;gap:6px}
    .clean-menu button{border:0;background:#f5f7f9;border-radius:12px;padding:12px 13px;text-align:left;font-weight:800;color:#173f3b;cursor:pointer}
    .clean-menu button:active{transform:translateY(1px)}
    body.wander-clean-ui .clean-menu-backdrop{position:absolute;inset:0;z-index:1100;background:transparent;display:none}
    body.wander-clean-ui .clean-menu-backdrop.is-open{display:block}
    body.wander-clean-ui.map-bearing-route .leaflet-map-pane,
    body.wander-clean-ui.map-bearing-compass .leaflet-map-pane{rotate:calc(var(--wander-map-bearing,0deg) * -1);transform-origin:50% 50%}
    body.wander-clean-ui .top-bar{right:84px}
    @media(max-width:820px){
      body.wander-clean-ui .top-bar{display:none!important}
      body.wander-clean-ui .map-tools{top:14px;right:14px}
      body.wander-clean-ui .companion-tab{bottom:18px}
      body.wander-clean-ui .companion-panel{bottom:76px;width:calc(100% - 24px)}
    }
  `;
  document.head.appendChild(style);
  document.body.classList.add('wander-clean-ui');

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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
    if (settings.trackRouteByDefault !== false) {
      settings.trackRouteByDefault = false;
      saveSettings(settings);
    }
    const toggle = $('#setting-track-default');
    if (toggle) toggle.checked = false;
    const trackButton = $('#track-route-button');
    const badge = $('#track-status-badge');
    const active = trackButton?.classList.contains('active') || badge?.textContent === 'ON';
    if (active) trackButton?.click();
  }

  function iconizeButtons() {
    const locate = $('#locate-button');
    if (locate) {
      locate.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/><circle cx="12" cy="12" r="4"/></svg>';
      locate.setAttribute('aria-label', 'Mi ubicación y orientación');
      locate.title = 'Mi ubicación';
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
    menu.innerHTML = `
      <button type="button" data-open-panel="trip">Viaje</button>
      <button type="button" data-open-panel="guide">Guía</button>
      <button type="button" data-open-panel="developer">Desarrollador</button>
      <button type="button" data-open-panel="settings">Configuración</button>
    `;
    $('.map-stage')?.append(backdrop, menu);

    function closeMenu() {
      menu.classList.remove('is-open');
      backdrop.classList.remove('is-open');
    }
    function toggleMenu() {
      menu.classList.toggle('is-open');
      backdrop.classList.toggle('is-open', menu.classList.contains('is-open'));
    }

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleMenu();
    });
    backdrop.addEventListener('click', closeMenu);
    menu.querySelectorAll('[data-open-panel]').forEach((item) => {
      item.addEventListener('click', () => {
        const panel = item.dataset.openPanel;
        const tab = panel === 'trip' ? $('#show-panel') : panel === 'guide' ? $('#show-guide-panel') : panel === 'developer' ? $('#show-dev-panel') : $('#show-settings-panel');
        closeMenu();
        tab?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });
    });
  }

  function addVisualSettings() {
    if ($('#setting-show-mode')) return;
    const list = $('#settings-panel .settings-list');
    if (!list) return;
    const card = document.createElement('section');
    card.className = 'settings-card visual-aids-card';
    card.innerHTML = `
      <div>
        <h3>Ayudas visuales</h3>
        <p>Mostrar u ocultar datos permanentes sobre el mapa. Por defecto Wander prioriza una pantalla limpia.</p>
        <div class="poi-source-grid">
          <label><input id="setting-show-mode" type="checkbox" data-visual-aid="showMode" /> Modo</label>
          <label><input id="setting-show-pace" type="checkbox" data-visual-aid="showPace" /> Ritmo</label>
          <label><input id="setting-show-group" type="checkbox" data-visual-aid="showGroup" /> Grupo</label>
        </div>
      </div>
    `;
    list.appendChild(card);

    const settings = loadSettings();
    const visual = { showMode: false, showPace: false, showGroup: false, ...(settings.visualAids || {}) };
    settings.visualAids = visual;
    saveSettings(settings);

    function apply() {
      const current = loadSettings().visualAids || {};
      document.body.classList.toggle('show-movement-mode', Boolean(current.showMode));
      document.body.classList.toggle('show-movement-pace', Boolean(current.showPace));
      document.body.classList.toggle('show-movement-group', Boolean(current.showGroup));
      $('#setting-show-mode').checked = Boolean(current.showMode);
      $('#setting-show-pace').checked = Boolean(current.showPace);
      $('#setting-show-group').checked = Boolean(current.showGroup);
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

  let locateMode = 0;
  let lastPoint = marker.getLatLng();
  let routeBearing = 0;
  let compassBearing = null;

  function bearing(a, b) {
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function setMapBearing(mode, degrees = 0) {
    document.body.classList.toggle('map-bearing-route', mode === 'route');
    document.body.classList.toggle('map-bearing-compass', mode === 'compass');
    document.documentElement.style.setProperty('--wander-map-bearing', `${degrees}deg`);
  }

  function updateLocateState() {
    const locate = $('#locate-button');
    if (!locate) return;
    const states = ['center', 'route', 'compass', 'north'];
    locate.dataset.orientation = states[locateMode] || 'center';
    locate.title = locateMode === 0 ? 'Centrado' : locateMode === 1 ? 'Orientado por ruta' : locateMode === 2 ? 'Orientado por brújula' : 'Norte arriba';
  }

  async function ensureCompass() {
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  window.addEventListener('deviceorientationabsolute', (event) => {
    if (Number.isFinite(event.alpha)) compassBearing = event.alpha;
  });
  window.addEventListener('deviceorientation', (event) => {
    if (Number.isFinite(event.webkitCompassHeading)) compassBearing = event.webkitCompassHeading;
    else if (Number.isFinite(event.alpha)) compassBearing = 360 - event.alpha;
  });

  window.setInterval(() => {
    const current = marker.getLatLng();
    if (map.distance(lastPoint, current) > 2) routeBearing = bearing(lastPoint, current);
    lastPoint = L.latLng(current.lat, current.lng);
    if (locateMode === 1) setMapBearing('route', routeBearing);
    if (locateMode === 2 && Number.isFinite(compassBearing)) setMapBearing('compass', compassBearing);
  }, 1000);

  function installLocateCycle() {
    const locate = $('#locate-button');
    if (!locate) return;
    locate.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const current = marker.getLatLng();
      map.panTo(current);
      if (locateMode === 0) {
        setMapBearing('none', 0);
      } else if (locateMode === 1) {
        setMapBearing('route', routeBearing);
      } else if (locateMode === 2) {
        const ok = await ensureCompass();
        if (ok && Number.isFinite(compassBearing)) setMapBearing('compass', compassBearing);
        else {
          tell('Brújula no disponible', 'No pude activar la orientación por brújula en este dispositivo o navegador. Vuelvo a Norte arriba.');
          locateMode = 3;
          setMapBearing('none', 0);
        }
      } else {
        setMapBearing('none', 0);
      }
      updateLocateState();
      locateMode = (locateMode + 1) % 4;
    }, true);
    updateLocateState();
  }

  iconizeButtons();
  createMenu();
  addVisualSettings();
  installLocateCycle();
  window.setTimeout(disableStartupTracking, 120);
  window.setTimeout(disableStartupTracking, 600);
})();
