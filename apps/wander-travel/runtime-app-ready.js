(() => {
  let dispatched = false;

  function dispatchReady() {
    if (dispatched) return;
    dispatched = true;
    window.WanderAppReady = true;
    window.dispatchEvent(new CustomEvent('wander:app-ready', {
      detail: { at: Date.now() },
    }));
  }

  function afterLayout() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(dispatchReady);
    });
  }

  if (document.readyState === 'complete') afterLayout();
  else window.addEventListener('load', afterLayout, { once: true });
})();
