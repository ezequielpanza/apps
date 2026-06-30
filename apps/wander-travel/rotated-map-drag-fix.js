(() => {
  if (window.__wanderRotatedMapDragFix) return;
  window.__wanderRotatedMapDragFix = true;
  if (typeof map === 'undefined') return;

  const target = document.querySelector('#wander-map');
  if (!target) return;

  let dragging = false;
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;

  function isRotatedMode() {
    return document.body.classList.contains('wander-map-heading');
  }

  function currentRotationDeg() {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--wander-map-rotation') || '0deg';
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function rotateDelta(dx, dy) {
    const radians = -currentRotationDeg() * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos,
    };
  }

  function syncDragging() {
    try {
      if (!map.dragging) return;
      if (isRotatedMode()) map.dragging.disable();
      else map.dragging.enable();
    } catch {}
  }

  function down(event) {
    if (!isRotatedMode()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragging = true;
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    syncDragging();
    target.setPointerCapture?.(pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function move(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (Math.abs(dx) + Math.abs(dy) < 1) return;
    const adjusted = rotateDelta(dx, dy);
    try {
      map.panBy([-adjusted.x, -adjusted.y], { animate: false });
    } catch {}
    event.preventDefault();
    event.stopPropagation();
  }

  function up(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    target.releasePointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  target.addEventListener('pointerdown', down, { capture: true });
  target.addEventListener('pointermove', move, { capture: true });
  target.addEventListener('pointerup', up, { capture: true });
  target.addEventListener('pointercancel', up, { capture: true });
  window.setInterval(syncDragging, 400);
  syncDragging();
})();