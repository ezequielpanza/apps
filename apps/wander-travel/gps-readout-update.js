(() => {
  function fmt(value) {
    return Number(value).toFixed(5);
  }

  function update(detail) {
    const box = document.querySelector('#location-readout');
    if (!box || !detail?.location) return;
    const title = box.querySelector('strong');
    const sub = box.querySelector('small');
    const speed = Number(detail.speed_knots || 0);
    title.textContent = `${fmt(detail.location.lat)}, ${fmt(detail.location.lng)}`;
    sub.textContent = detail.likely_boat ? `GPS activo · ${speed.toFixed(1)} kn` : 'GPS activo';
  }

  document.addEventListener('wander:motion-context', (event) => update(event.detail));
  if (window.wanderMotionContext) update(window.wanderMotionContext);
})();