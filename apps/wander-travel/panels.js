(() => {
  const movementStyles = document.createElement('link');
  movementStyles.rel = 'stylesheet';
  movementStyles.href = 'movement-controls.css?v=20260625-1';
  document.head.appendChild(movementStyles);

  const shell = document.querySelector('.app-shell');
  const panels = {
    trip: document.querySelector('.control-panel'),
    guide: document.querySelector('#guide-panel'),
    developer: document.querySelector('#developer-panel'),
    settings: document.querySelector('#settings-panel'),
  };
  const tabs = {
    trip: document.querySelector('#show-panel'),
    guide: document.querySelector('#show-guide-panel'),
    developer: document.querySelector('#show-dev-panel'),
    settings: document.querySelector('#show-settings-panel'),
  };
  const collapseTrip = document.querySelector('#collapse-panel');
  const collapseGuide = document.querySelector('#collapse-guide-panel');
  const collapseSettings = document.querySelector('#collapse-settings-panel');
  let collapseDeveloper = document.querySelector('#collapse-dev-panel');

  if (!shell || Object.values(panels).some((panel) => !panel) || Object.values(tabs).some((tab) => !tab)) return;

  if (!collapseDeveloper) {
    const devTitle = panels.developer.querySelector('.section-title');
    collapseDeveloper = document.createElement('button');
    collapseDeveloper.id = 'collapse-dev-panel';
    collapseDeveloper.className = 'icon-button';
    collapseDeveloper.type = 'button';
    collapseDeveloper.setAttribute('aria-label', 'Cerrar desarrollador');
    collapseDeveloper.textContent = '×';
    devTitle?.appendChild(collapseDeveloper);
  }

  const PANEL_WIDTH = 'min(380px, 90vw)';
  const ANIMATION = { duration: 280, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' };
  const animations = new Map();
  let openPanel = null;

  function important(element, property, value) {
    element.style.setProperty(property, value, 'important');
  }

  Object.values(panels).forEach((panel) => {
    important(panel, 'position', 'fixed');
    important(panel, 'top', '0');
    important(panel, 'right', '0');
    important(panel, 'left', 'auto');
    important(panel, 'bottom', '0');
    important(panel, 'width', PANEL_WIDTH);
    important(panel, 'height', '100vh');
    important(panel, 'z-index', '950');
    important(panel, 'display', panel === panels.trip ? 'flex' : 'block');
    important(panel, 'overflow-y', 'auto');
    important(panel, 'background', '#fff');
    important(panel, 'box-shadow', '-15px 0 40px rgba(20,35,55,.18)');
    important(panel, 'will-change', 'transform');
    important(panel, 'transform', 'translateX(100%)');
  });
  important(panels.trip, 'flex-direction', 'column');

  const tabStyle = {
    trip: { top: 'calc(50% - 205px)', height: '90px', color: '#173f3b' },
    guide: { top: 'calc(50% - 105px)', height: '110px', color: '#b06f32' },
    developer: { top: 'calc(50% + 15px)', height: '126px', color: '#6c5aa8' },
    settings: { top: 'calc(50% + 151px)', height: '118px', color: '#4a6b8a' },
  };

  Object.entries(tabs).forEach(([key, tab]) => {
    important(tab, 'display', 'grid');
    important(tab, 'position', 'fixed');
    important(tab, 'right', '0');
    important(tab, 'left', 'auto');
    important(tab, 'top', tabStyle[key].top);
    important(tab, 'min-width', '44px');
    important(tab, 'min-height', tabStyle[key].height);
    important(tab, 'z-index', '1000');
    important(tab, 'place-items', 'center');
    important(tab, 'cursor', 'pointer');
    important(tab, 'color', '#fff');
    important(tab, 'background', tabStyle[key].color);
    important(tab, 'border-radius', '10px 0 0 10px');
    important(tab, 'box-shadow', '0 12px 30px rgba(20,35,55,.22)');
    important(tab, 'transition', 'right 280ms cubic-bezier(.22,.61,.36,1)');
    const span = tab.querySelector('span');
    if (span) {
      important(span, 'writing-mode', 'vertical-rl');
      important(span, 'transform', 'rotate(180deg)');
    }
  });

  function moveTabs(rightValue) {
    Object.values(tabs).forEach((tab) => important(tab, 'right', rightValue));
  }

  function refreshMap() {
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
  }

  function animatePanel(panel, open) {
    animations.get(panel)?.cancel();
    const from = open ? 'translateX(100%)' : 'translateX(0)';
    const to = open ? 'translateX(0)' : 'translateX(100%)';
    important(panel, 'transform', from);
    panel.getBoundingClientRect();
    const animation = panel.animate([{ transform: from }, { transform: to }], ANIMATION);
    animations.set(panel, animation);
    animation.onfinish = () => {
      important(panel, 'transform', to);
      animations.delete(panel);
    };
  }

  function closeAll() {
    Object.entries(panels).forEach(([key, panel]) => {
      if (openPanel === key) animatePanel(panel, false);
      else important(panel, 'transform', 'translateX(100%)');
    });
    shell.classList.add('panel-collapsed');
    document.body.classList.remove('dev-panel-open', 'settings-panel-open', 'guide-panel-open');
    panels.developer.classList.add('dev-collapsed');
    panels.settings.classList.add('settings-collapsed');
    panels.guide.classList.add('guide-collapsed');
    moveTabs('0');
    openPanel = null;
    refreshMap();
  }

  function open(key) {
    if (openPanel === key) return closeAll();
    Object.entries(panels).forEach(([otherKey, panel]) => {
      if (otherKey !== key) important(panel, 'transform', 'translateX(100%)');
    });
    shell.classList.toggle('panel-collapsed', key !== 'trip');
    document.body.classList.toggle('dev-panel-open', key === 'developer');
    document.body.classList.toggle('settings-panel-open', key === 'settings');
    document.body.classList.toggle('guide-panel-open', key === 'guide');
    panels.developer.classList.toggle('dev-collapsed', key !== 'developer');
    panels.settings.classList.toggle('settings-collapsed', key !== 'settings');
    panels.guide.classList.toggle('guide-collapsed', key !== 'guide');
    openPanel = key;
    moveTabs(`${Math.round(panels[key].getBoundingClientRect().width)}px`);
    requestAnimationFrame(() => requestAnimationFrame(() => animatePanel(panels[key], true)));
    refreshMap();
  }

  Object.entries(tabs).forEach(([key, tab]) => {
    tab.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      open(key);
    }, true);
  });

  [collapseTrip, collapseGuide, collapseSettings, collapseDeveloper].forEach((button) => button?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeAll();
  }, true));

  window.addEventListener('resize', () => {
    if (openPanel) moveTabs(`${Math.round(panels[openPanel].getBoundingClientRect().width)}px`);
  });

  moveTabs('0');
})();