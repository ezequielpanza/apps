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

  function moveTabs(rightValue) {
    important(tripTab, 'right', rightValue);
    important(devTab, 'right', rightValue);
  }

  function refreshMap() {
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
  }

  function animateTrip(open) {
    tripAnimation?.cancel();
    important(tripPanel, 'display', 'flex');
    const from = open ? 'translateX(100%)' : 'translateX(0)';
    const to = open ? 'translateX(0)' : 'translateX(100%)';
    important(tripPanel, 'transform', from);
    tripPanel.getBoundingClientRect();
    tripAnimation = tripPanel.animate([{ transform: from }, { transform: to }], ANIMATION);
    tripAnimation.onfinish = () => {
      important(tripPanel, 'transform', to);
      tripAnimation = null;
    };
  }

  function animateDeveloper(open) {
    devAnimation?.cancel();
    important(devPanel, 'display', 'block');
    const from = open ? 'translateX(100%)' : 'translateX(0)';
    const to = open ? 'translateX(0)' : 'translateX(100%)';
    important(devPanel, 'transform', from);
    devPanel.getBoundingClientRect();
    devAnimation = devPanel.animate([{ transform: from }, { transform: to }], ANIMATION);
    devAnimation.onfinish = () => {
      important(devPanel, 'transform', to);
      devAnimation = null;
    };
  }

  function closeAll() {
    if (openPanel === 'trip') animateTrip(false);
    else important(tripPanel, 'transform', 'translateX(100%)');

    if (openPanel === 'developer') animateDeveloper(false);
    else important(devPanel, 'transform', 'translateX(100%)');

    shell.classList.add('panel-collapsed');
    devPanel.classList.add('dev-collapsed');
    document.body.classList.remove('dev-panel-open');
    moveTabs('0');
    openPanel = null;
    refreshMap();
  }

  function openTrip() {
    if (openPanel === 'developer') animateDeveloper(false);
    else important(devPanel, 'transform', 'translateX(100%)');

    shell.classList.remove('panel-collapsed');
    devPanel.classList.add('dev-collapsed');
    document.body.classList.remove('dev-panel-open');
    moveTabs(PANEL_WIDTH);
    openPanel = 'trip';
    requestAnimationFrame(() => requestAnimationFrame(() => animateTrip(true)));
    refreshMap();
  }

  function openDeveloper() {
    if (openPanel === 'trip') animateTrip(false);
    else important(tripPanel, 'transform', 'translateX(100%)');

    shell.classList.add('panel-collapsed');
    devPanel.classList.remove('dev-collapsed');
    document.body.classList.add('dev-panel-open');
    moveTabs(PANEL_WIDTH);
    openPanel = 'developer';
    requestAnimationFrame(() => requestAnimationFrame(() => animateDeveloper(true)));
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

  important(tripPanel, 'transform', 'translateX(100%)');
  important(devPanel, 'transform', 'translateX(100%)');
  moveTabs('0');
})();
