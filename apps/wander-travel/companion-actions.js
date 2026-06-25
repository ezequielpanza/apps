(() => {
  const message = document.querySelector('#wander-message');
  const title = document.querySelector('#wander-title');
  const routeButton = document.querySelector('[data-message="route"]');
  const detailsButton = document.querySelector('[data-message="details"]');
  const skipButton = document.querySelector('[data-message="skip"]');
  const askButton = document.querySelector('#ask-wander-button');

  [detailsButton, skipButton, askButton].forEach((button) => {
    if (!button) return;
    button.hidden = true;
    button.style.display = 'none';
  });

  function findDestinationByName(name) {
    if (!name || typeof map === 'undefined') return null;
    const normalized = name.trim().toLowerCase();
    for (const layer of Object.values(map._layers || {})) {
      if (typeof layer?.getLatLng !== 'function' || typeof layer?.getPopup !== 'function') continue;
      const popup = layer.getPopup();
      const content = popup?.getContent?.();
      if (typeof content !== 'string') continue;
      const plain = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!plain.includes(normalized)) continue;
      const point = layer.getLatLng();
      return { name, lat: point.lat, lng: point.lng };
    }
    return null;
  }

  function detectDestination() {
    if (!message || !routeButton) return;
    const text = message.textContent?.toLowerCase() || '';
    const currentTitle = title?.textContent?.trim().toLowerCase() || '';
    const explicit = window.wanderGuideDestination;

    if (explicit && currentTitle && explicit.name?.toLowerCase() === currentTitle) {
      routeButton.hidden = false;
      routeButton.style.display = '';
      document.dispatchEvent(new CustomEvent('wander:guide-destination', { detail: explicit }));
      return;
    }

    const items = [...document.querySelectorAll('#poi-debug-list .poi-debug-item strong')];
    let destination = null;

    for (const item of items) {
      const name = item.textContent?.trim();
      if (!name || !text.includes(name.toLowerCase())) continue;
      destination = findDestinationByName(name);
      if (destination) break;
    }

    if (!destination && explicit && text.includes(String(explicit.name || '').toLowerCase())) destination = explicit;

    window.wanderGuideDestination = destination;
    routeButton.hidden = !destination;
    routeButton.style.display = destination ? '' : 'none';
    document.dispatchEvent(new CustomEvent('wander:guide-destination', { detail: destination }));
  }

  const observer = new MutationObserver(detectDestination);
  if (message) observer.observe(message, { childList: true, characterData: true, subtree: true });
  document.addEventListener('wander:interests-changed', () => setTimeout(detectDestination, 50));
  document.addEventListener('wander:guide-destination', () => setTimeout(detectDestination, 0));
  window.setTimeout(detectDestination, 1500);
})();
