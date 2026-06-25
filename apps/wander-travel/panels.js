(() => {
  const shell = document.querySelector('.app-shell');
  const tripPanel = document.querySelector('.control-panel');
  const devPanel = document.querySelector('#developer-panel');
  const tripTab = document.querySelector('#show-panel');
  const devTab = document.querySelector('#show-dev-panel');
  const collapseTrip = document.querySelector('#collapse-panel');

  if (!shell || !tripPanel || !devPanel || !tripTab || !devTab) return;

  const PANEL_WIDTH = 'min(380px, 90vw)';

  Object.assign(tripPanel.style, {
    position: 'fixed',
    top: '0',
    right: '0',
    bottom: '0',
    width: PANEL_WIDTH,
    zIndex: '950',
    display: 'flex',
    transform: 'translateX(100%)',
    transition: 'transform 220ms ease',
    boxShadow: '-15px 0 40px rgba(20,35,55,.18)'
  });

  Object.assign(devPanel.style, {
    position: 'fixed',
    top: '0',
    right: '0',
    left: 'auto',
    bottom: '0',
    width: PANEL_WIDTH,
    height: '100vh',
    zIndex: '950',
    display: 'block',
    transform: 'translateX(100%)',
    transition: 'transform 220ms ease',
    background: '#fff',
    overflowY: 'auto',
    boxShadow: '-15px 0 40px rgba(20,35,55,.18)'
  });

  [tripTab, devTab].forEach((tab, index) => {
    Object.assign(tab.style, {
      display: 'grid',
      position: 'fixed',
      right: '0',
      left: 'auto',
      top: index === 0 ? 'calc(50% - 82px)' : 'calc(50% + 56px)',
      minWidth: '44px',
      minHeight: index === 0 ? '112px' : '138px',
      zIndex: '1000',
      placeItems: 'center',
      cursor: 'pointer',
      color: '#fff',
      background: index === 0 ? '#173f3b' : '#6c5aa8',
      borderRadius: '10px 0 0 10px',
      boxShadow: '0 12px 30px rgba(20,35,55,.22)'
    });
    const span = tab.querySelector('span');
    if (span) Object.assign(span.style, { writingMode: 'vertical-rl', transform: 'rotate(180deg)' });
  });

  let openPanel = null;

  function refreshMap() {
    window.setTimeout(() => window.map?.invalidateSize?.(), 240);
  }

  function closeAll() {
    tripPanel.style.transform = 'translateX(100%)';
    devPanel.style.transform = 'translateX(100%)';
    tripTab.style.right = '0';
    devTab.style.right = '0';
    shell.classList.add('panel-collapsed');
    devPanel.classList.add('dev-collapsed');
    document.body.classList.remove('dev-panel-open');
    openPanel = null;
    refreshMap();
  }

  function openTrip() {
    devPanel.style.transform = 'translateX(100%)';
    tripPanel.style.transform = 'translateX(0)';
    tripTab.style.right = PANEL_WIDTH;
    devTab.style.right = PANEL_WIDTH;
    shell.classList.remove('panel-collapsed');
    devPanel.classList.add('dev-collapsed');
    document.body.classList.remove('dev-panel-open');
    openPanel = 'trip';
    refreshMap();
  }

  function openDeveloper() {
    tripPanel.style.transform = 'translateX(100%)';
    devPanel.style.transform = 'translateX(0)';
    tripTab.style.right = PANEL_WIDTH;
    devTab.style.right = PANEL_WIDTH;
    shell.classList.add('panel-collapsed');
    devPanel.classList.remove('dev-collapsed');
    document.body.classList.add('dev-panel-open');
    openPanel = 'developer';
    refreshMap();
  }

  tripTab.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    openPanel === 'trip' ? closeAll() : openTrip();
  }, true);

  devTab.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    openPanel === 'developer' ? closeAll() : openDeveloper();
  }, true);

  collapseTrip?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeAll();
  }, true);

  closeAll();
})();
