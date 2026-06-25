(() => {
  const tripPanel = document.querySelector('.control-panel');
  const devPanel = document.querySelector('#developer-panel');
  if (!tripPanel || !devPanel || typeof map === 'undefined') return;

  let appliedOffset = 0;
  let scheduled = null;

  function isPanelVisible(panel) {
    const style = getComputedStyle(panel);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const transform = style.transform;
    if (!transform || transform === 'none') return true;
    const match = transform.match(/matrix\(([^)]+)\)/);
    if (!match) return true;
    const values = match[1].split(',').map(Number);
    const translateX = values[4] || 0;
    return Math.abs(translateX) < panel.getBoundingClientRect().width * 0.5;
  }

  function visiblePanel() {
    if (isPanelVisible(tripPanel)) return tripPanel;
    if (isPanelVisible(devPanel)) return devPanel;
    return null;
  }

  function desiredOffset() {
    const panel = visiblePanel();
    return panel ? Math.round(panel.getBoundingClientRect().width / 2) : 0;
  }

  function applyOffset() {
    scheduled = null;
    const nextOffset = desiredOffset();
    const delta = nextOffset - appliedOffset;
    if (Math.abs(delta) < 1) return;

    map.panBy([delta, 0], {
      animate: true,
      duration: 0.28,
      easeLinearity: 0.25,
    });
    appliedOffset = nextOffset;
  }

  function scheduleOffset() {
    if (scheduled) cancelAnimationFrame(scheduled);
    scheduled = requestAnimationFrame(() => requestAnimationFrame(applyOffset));
  }

  const observer = new MutationObserver(scheduleOffset);
  observer.observe(tripPanel, { attributes: true, attributeFilter: ['style', 'class'] });
  observer.observe(devPanel, { attributes: true, attributeFilter: ['style', 'class'] });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener('resize', () => {
    const panel = visiblePanel();
    const nextOffset = panel ? Math.round(panel.getBoundingClientRect().width / 2) : 0;
    const delta = nextOffset - appliedOffset;
    if (Math.abs(delta) >= 1) {
      map.panBy([delta, 0], { animate: false });
      appliedOffset = nextOffset;
    }
  });

  scheduleOffset();
})();
