(() => {
  const shell = document.querySelector('.app-shell');
  const tripPanel = document.querySelector('.control-panel');
  const devPanel = document.querySelector('#developer-panel');
  const tripTab = document.querySelector('#show-panel');
  const devTab = document.querySelector('#show-dev-panel');
  const collapseTrip = document.querySelector('#collapse-panel');

  if (!shell || !tripPanel || !devPanel || !tripTab || !devTab) return;

  const PANEL_WIDTH = 'min(380px, 90vw)';
  let openPanel = null;

  function important(element, property, value) {
    element.style.setProperty(property, value, 'important');
  }

  function preparePanel(element, displayValue) {
    important(element, 'position', 'fixed');
    important(element, 'top', '0');
    important(element, 'right', '0');
    important(element, 'left', 'auto');
    important(element, 'bottom', '0');
    important(element, 'width', PANEL_WIDTH);
    important(element, 'height', '100vh');
    important(element, 'z-index', '950');
    important(element, 'display', displayValue);
    important(element, 'transition', 'transform 220ms ease');
    important(element, 'overflow-y', 'auto');
    important(element, 'background', '#fff');
    important(element, 'box-shadow', '-15px 0 40px rgba(20,35,55,.18)');
  }

  preparePanel(tripPanel, 'flex');
  preparePanel(devPanel, 'block');
  important(tripPanel, 'flex-direction', 'column');

  [tripTab, devTab].forEach((tab, index) => {
    important(tab, 'display', 'grid');
    important(tab, 'position', 'fixed');
    important(tab, 'right', '0');
    important(tab, 'left', 'auto');
    important(tab, 'top', index === 0 ? 'calc(50% - 82px)' : 'calc(50% + 56px)');
    important(tab, 'min-width', '44px');
    important(tab, 'min-height', index === 0 ? '112px' : '138px');
    important(tab, 'z-index', '1000');
    important(tab, 'place-items', 'center');
    important(tab, 'cursor', 'pointer');
    important(tab, 'color', '#fff');
    important(tab, 'background', index === 0 ? '#173f3b' : '#6c5aa8');
    important(tab, 'border-radius', '10px 0 0 10px');
    important(tab, 'box-shadow', '0 12px 30px rgba(20,35,55,.22)');
    const span = tab.querySelector('span');
    if (span) {
      important(span, 'writing-mode', 'vertical-rl');
      important(span, 'transform', 'rotate(180deg)');
    }
  });

  function moveTabs(rightValue) {
    important(tripTab, 'right', rightValue);
    important(devTab, 'right', rightValue);
  }

  function refreshMap() {
    window.setTimeout(() => {
      const mapElement = document.querySelector('#wander-map');
      if (mapElement && mapElement._leaflet_map) mapElement._leaflet_map.invalidateSize();
      window.dispatchEvent(new Event('resize'));
    }, 240);
  }

  function hideTrip() {
    important(tripPanel, 'display', 'flex');
    important(tripPanel, 'transform', 'translateX(100%)');
  }

  function hideDeveloper() {
    important(devPanel, 'display', 'block');
    important(devPanel, 'transform', 'translateX(100%)');
    devPanel.classList.add('dev-collapsed');
    document.body.classList.remove('dev-panel-open');
  }

  function closeAll() {
    hideTrip();
    hideDeveloper();
    shell.classList.add('panel-collapsed');
    moveTabs('0');
    openPanel = null;
    refreshMap();
  }

  function openTrip() {
    hideDeveloper();
    shell.classList.remove('panel-collapsed');
    important(tripPanel, 'display', 'flex');
    important(tripPanel, 'transform', 'translateX(0)');
    moveTabs(PANEL_WIDTH);
    openPanel = 'trip';
    refreshMap();
  }

  function openDeveloper() {
    hideTrip();
    shell.classList.add('panel-collapsed');
    devPanel.classList.remove('dev-collapsed');
    document.body.classList.add('dev-panel-open');
    important(devPanel, 'display', 'block');
    important(devPanel, 'transform', 'translateX(0)');
    moveTabs(PANEL_WIDTH);
    openPanel = 'developer';
    refreshMap();
  }

  tripTab.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (openPanel === 'trip') closeAll();
    else openTrip();
  }, true);

  devTab.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (openPanel === 'developer') closeAll();
    else openDeveloper();
  }, true);

  collapseTrip?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeAll();
  }, true);

  closeAll();
})();
