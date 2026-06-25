(() => {
  const shell = document.querySelector('.app-shell');
  const tripPanel = document.querySelector('.control-panel');
  const devPanel = document.querySelector('#developer-panel');
  const tripTab = document.querySelector('#show-panel');
  const devTab = document.querySelector('#show-dev-panel');
  const collapseTrip = document.querySelector('#collapse-panel');

  if (!shell || !tripPanel || !devPanel || !tripTab || !devTab) return;

  const PANEL_WIDTH = 'min(380px, 90vw)';
  const ANIMATION = { duration: 280, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' };
  let openPanel = null;
  let tripAnimation = null;
  let devAnimation = null;

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
    important(element, 'overflow-y', 'auto');
    important(element, 'background', '#fff');
    important(element, 'box-shadow', '-15px 0 40px rgba(20,35,55,.18)');
    important(element, 'will-change', 'transform');
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
    important(tab, 'transition', 'right 280ms cubic-bezier(.22,.61,.36,1)');
    const span = tab.querySelector('span');
    if (span) {
      important(span, 'writing-mode', 'vertical-rl');
      important(span, 'transform', 'rotate(180deg)');
    }
  });

  function panelEdge(panel) {
    const width = Math.round(panel.getBoundingClientRect().width);
    return `${width}px`;
  }

  function moveTabsToPanel(panel) {
    const right = panelEdge(panel);
    important(tripTab, 'right', right);
    important(devTab, 'right', right);
  }

  function moveTabsClosed() {
    important(tripTab, 'right', '0');
    important(devTab, 'right', '0');
  }

  function refreshMap() {
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
  }

  function animatePanel(panel, open, animationRefSetter) {
    animationRefSetter('cancel');
    const from = open ? 'translateX(100%)' : 'translateX(0)';
    const to = open ? 'translateX(0)' : 'translateX(100%)';
    important(panel, 'transform', from);
    panel.getBoundingClientRect();
    const animation = panel.animate([{ transform: from }, { transform: to }], ANIMATION);
    animationRefSetter(animation);
    animation.onfinish = () => {
      important(panel, 'transform', to);
      animationRefSetter(null);
    };
  }

  function setTripAnimation(value) {
    if (value === 'cancel') {
      tripAnimation?.cancel();
      tripAnimation = null;
    } else tripAnimation = value;
  }

  function setDevAnimation(value) {
    if (value === 'cancel') {
      devAnimation?.cancel();
      devAnimation = null;
    } else devAnimation = value;
  }

  function closeAll() {
    if (openPanel === 'trip') animatePanel(tripPanel, false, setTripAnimation);
    else important(tripPanel, 'transform', 'translateX(100%)');

    if (openPanel === 'developer') animatePanel(devPanel, false, setDevAnimation);
    else important(devPanel, 'transform', 'translateX(100%)');

    shell.classList.add('panel-collapsed');
    devPanel.classList.add('dev-collapsed');
    document.body.classList.remove('dev-panel-open');
    moveTabsClosed();
    openPanel = null;
    refreshMap();
  }

  function openTrip() {
    if (openPanel === 'developer') animatePanel(devPanel, false, setDevAnimation);
    else important(devPanel, 'transform', 'translateX(100%)');

    shell.classList.remove('panel-collapsed');
    devPanel.classList.add('dev-collapsed');
    document.body.classList.remove('dev-panel-open');
    openPanel = 'trip';

    requestAnimationFrame(() => {
      important(tripPanel, 'display', 'flex');
      moveTabsToPanel(tripPanel);
      requestAnimationFrame(() => animatePanel(tripPanel, true, setTripAnimation));
    });
    refreshMap();
  }

  function openDeveloper() {
    if (openPanel === 'trip') animatePanel(tripPanel, false, setTripAnimation);
    else important(tripPanel, 'transform', 'translateX(100%)');

    shell.classList.add('panel-collapsed');
    devPanel.classList.remove('dev-collapsed');
    document.body.classList.add('dev-panel-open');
    openPanel = 'developer';

    requestAnimationFrame(() => {
      important(devPanel, 'display', 'block');
      moveTabsToPanel(devPanel);
      requestAnimationFrame(() => animatePanel(devPanel, true, setDevAnimation));
    });
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

  window.addEventListener('resize', () => {
    if (openPanel === 'trip') moveTabsToPanel(tripPanel);
    if (openPanel === 'developer') moveTabsToPanel(devPanel);
  });

  important(tripPanel, 'transform', 'translateX(100%)');
  important(devPanel, 'transform', 'translateX(100%)');
  moveTabsClosed();
})();
