(() => {
  const VISIBLE_KEY = 'wander-travel-simulator-overlay-visible';
  const POSITION_KEY = 'wander-travel-simulator-overlay-position';
  const mapStage = document.querySelector('.map-stage');
  const developerPanel = document.querySelector('#developer-panel .developer-panel');
  const movePad = developerPanel?.querySelector('.move-pad');
  const simulatorStatus = developerPanel?.querySelector('#simulator-status');
  const manualLocationButton = developerPanel?.querySelector('#manual-location-button');

  if (!mapStage || !developerPanel || !movePad || !simulatorStatus || !manualLocationButton) return;

  const overlay = document.createElement('section');
  overlay.id = 'movement-simulator-overlay';
  overlay.className = 'movement-overlay is-hidden';
  overlay.setAttribute('aria-label', 'Simulador');
  overlay.innerHTML = `
    <div class="movement-overlay-header" role="button" tabindex="0" aria-label="Mover simulador">
      <div>
        <span>Simulador</span>
        <strong>Movimiento</strong>
      </div>
      <div class="movement-overlay-actions">
        <span class="movement-drag-hint" aria-hidden="true">⋮⋮</span>
        <button id="hide-movement-overlay" type="button" aria-label="Cerrar simulador">×</button>
      </div>
    </div>
  `;

  manualLocationButton.classList.add('overlay-location-button');
  manualLocationButton.textContent = '📍 Fijar posición';
  overlay.appendChild(manualLocationButton);
  overlay.appendChild(movePad);
  overlay.appendChild(simulatorStatus);
  mapStage.appendChild(overlay);

  const toggleCard = document.createElement('section');
  toggleCard.className = 'developer-overlay-setting';
  toggleCard.innerHTML = `
    <div>
      <h3>Simulador</h3>
      <p>Abrir o cerrar el simulador. Al cerrarlo, vuelve al GPS real.</p>
    </div>
    <label class="developer-overlay-switch">
      <input id="toggle-movement-overlay" type="checkbox" />
      <span></span>
    </label>
  `;
  developerPanel.insertBefore(toggleCard, developerPanel.querySelector('.poi-debug-section') || null);

  const toggle = toggleCard.querySelector('#toggle-movement-overlay');
  const hideButton = overlay.querySelector('#hide-movement-overlay');
  const dragHandle = overlay.querySelector('.movement-overlay-header');

  const style = document.createElement('style');
  style.textContent = `
    .movement-overlay{position:absolute;left:18px;top:auto;bottom:18px;z-index:820;display:grid;grid-template-columns:1fr;gap:10px;width:198px;min-width:198px;max-width:198px;box-sizing:border-box;padding:12px;border:1px solid rgba(24,32,27,.14);border-radius:20px;background:rgba(255,255,255,.94);box-shadow:0 18px 45px rgba(20,35,55,.22);backdrop-filter:blur(12px);transition:opacity .18s ease,transform .18s ease;user-select:none}
    .movement-overlay.is-hidden{opacity:0;transform:translateY(16px);pointer-events:none}
    .movement-overlay.is-dragging{transition:none!important;cursor:grabbing!important;box-shadow:0 24px 56px rgba(20,35,55,.28)}
    .movement-overlay-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 2px;cursor:grab;touch-action:none}.movement-overlay-header:active{cursor:grabbing}.movement-overlay-header span{display:block;color:#777;font-size:.63rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.movement-overlay-header strong{display:block;margin-top:2px;color:#342d52;font-size:.9rem}.movement-overlay-actions{display:flex;align-items:center;gap:6px}.movement-drag-hint{font-size:1rem!important;letter-spacing:-.1em!important;color:#8b8497!important}.movement-overlay-header button{display:grid;width:28px;height:28px;place-items:center;border:0;border-radius:9px;background:#efedf5;color:#5b5275;font-size:1.1rem;cursor:pointer}
    .overlay-location-button{display:block!important;width:100%!important;min-width:0!important;height:auto!important;margin:0!important;padding:10px 12px!important;border:0!important;border-radius:11px!important;background:#173f3b!important;color:#fff!important;font-size:.82rem!important;line-height:1.1!important;font-weight:800!important;box-shadow:none!important;text-align:center!important}
    .movement-overlay .move-pad{display:grid!important;grid-template-columns:repeat(3,54px)!important;grid-template-rows:repeat(3,54px)!important;gap:8px!important;margin:0!important;padding:6px!important;width:100%!important;box-sizing:border-box!important;border:0!important;border-radius:16px!important;background:linear-gradient(180deg,rgba(108,90,168,.08),rgba(108,90,168,.03))!important;box-shadow:none!important}
    .movement-overlay .move-button{position:relative!important;display:grid!important;width:54px!important;height:54px!important;min-width:54px!important;min-height:54px!important;place-items:center!important;padding:0!important;border:1px solid rgba(24,32,27,.12)!important;border-radius:15px!important;background:linear-gradient(180deg,#fff,#f4f1fa)!important;color:#342d52!important;box-shadow:0 7px 16px rgba(24,32,27,.10),inset 0 1px 0 rgba(255,255,255,.9)!important;font-size:1.35rem!important;font-weight:800!important;line-height:1!important;cursor:pointer!important;touch-action:manipulation}
    .movement-overlay .move-button.is-active{border-color:#6c5aa8!important;background:linear-gradient(180deg,#eee8ff,#ddd3f7)!important}.movement-overlay .move-button.is-active::after{content:attr(data-speed);position:absolute;left:50%;bottom:-8px;transform:translateX(-50%);padding:3px 6px;border-radius:999px;background:#6c5aa8;color:#fff;font-size:.54rem;font-weight:800;white-space:nowrap}.movement-overlay .stop-button{grid-column:2!important;grid-row:2!important;border-color:rgba(216,91,69,.28)!important;background:linear-gradient(180deg,#fff8f5,#fbe5df)!important;color:#a23f2f!important;font-size:.68rem!important;text-transform:uppercase!important}.movement-overlay .move-nw{grid-column:1!important;grid-row:1!important}.movement-overlay .move-up{grid-column:2!important;grid-row:1!important}.movement-overlay .move-ne{grid-column:3!important;grid-row:1!important}.movement-overlay .move-left{grid-column:1!important;grid-row:2!important}.movement-overlay .move-right{grid-column:3!important;grid-row:2!important}.movement-overlay .move-sw{grid-column:1!important;grid-row:3!important}.movement-overlay .move-down{grid-column:2!important;grid-row:3!important}.movement-overlay .move-se{grid-column:3!important;grid-row:3!important}.movement-overlay .simulator-status{display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important;margin:0!important;padding:8px 10px!important;border-radius:10px!important;background:rgba(108,90,168,.08)!important;color:#5b5275!important;font-size:.72rem!important;font-weight:700!important;line-height:1.25!important;text-align:center!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:break-word!important}
    .developer-overlay-setting{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:16px 0;padding:14px;border:1px solid rgba(24,32,27,.12);border-radius:14px;background:#f8f9fb}.developer-overlay-setting h3{margin:0 0 4px;font-size:.88rem}.developer-overlay-setting p{margin:0;color:#747b74;font-size:.72rem;line-height:1.35}.developer-overlay-switch{position:relative;display:inline-flex;flex:0 0 auto}.developer-overlay-switch input{position:absolute;opacity:0;pointer-events:none}.developer-overlay-switch span{display:block;width:46px;height:27px;border-radius:999px;background:#cdd2d7;cursor:pointer;transition:.2s}.developer-overlay-switch span::after{content:'';display:block;width:21px;height:21px;margin:3px;border-radius:50%;background:#fff;box-shadow:0 2px 7px rgba(0,0,0,.2);transition:.2s}.developer-overlay-switch input:checked+span{background:#6c5aa8}.developer-overlay-switch input:checked+span::after{transform:translateX(19px)}
    @media(max-width:640px){.movement-overlay{width:178px;min-width:178px;max-width:178px;left:10px;bottom:10px;padding:9px}.movement-overlay .move-pad{grid-template-columns:repeat(3,48px)!important;grid-template-rows:repeat(3,48px)!important;gap:7px!important;padding:5px!important}.movement-overlay .move-button{width:48px!important;height:48px!important;min-width:48px!important;min-height:48px!important;font-size:1.2rem!important}}
  `;
  document.head.appendChild(style);

  function setVisible(visible) {
    overlay.classList.toggle('is-hidden', !visible);
    toggle.checked = visible;
    localStorage.setItem(VISIBLE_KEY, String(visible));
    if (visible) {
      window.WanderSimulationActive = true;
      document.dispatchEvent(new CustomEvent('wander:simulation-opened'));
    } else {
      window.WanderSimulationActive = false;
      document.dispatchEvent(new CustomEvent('wander:simulation-closed'));
    }
  }

  function clampPosition(x, y) {
    const stage = mapStage.getBoundingClientRect();
    const box = overlay.getBoundingClientRect();
    const margin = 8;
    return { x: Math.max(margin, Math.min(x, stage.width - box.width - margin)), y: Math.max(margin, Math.min(y, stage.height - box.height - margin)) };
  }

  function applyPosition(x, y, save = true) {
    const next = clampPosition(x, y);
    overlay.style.left = `${next.x}px`;
    overlay.style.top = `${next.y}px`;
    overlay.style.right = 'auto';
    overlay.style.bottom = 'auto';
    if (save) localStorage.setItem(POSITION_KEY, JSON.stringify(next));
  }

  let drag = null;
  dragHandle.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    event.preventDefault();
    const rect = overlay.getBoundingClientRect();
    const stage = mapStage.getBoundingClientRect();
    drag = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, stageLeft: stage.left, stageTop: stage.top };
    overlay.classList.add('is-dragging');
    dragHandle.setPointerCapture(event.pointerId);
  });
  dragHandle.addEventListener('pointermove', (event) => { if (drag) applyPosition(event.clientX - drag.stageLeft - drag.offsetX, event.clientY - drag.stageTop - drag.offsetY, false); });
  function endDrag(event) {
    if (!drag) return;
    drag = null;
    overlay.classList.remove('is-dragging');
    const rect = overlay.getBoundingClientRect();
    const stage = mapStage.getBoundingClientRect();
    applyPosition(rect.left - stage.left, rect.top - stage.top, true);
    if (dragHandle.hasPointerCapture?.(event.pointerId)) dragHandle.releasePointerCapture(event.pointerId);
  }
  dragHandle.addEventListener('pointerup', endDrag);
  dragHandle.addEventListener('pointercancel', endDrag);

  toggle.addEventListener('change', () => setVisible(toggle.checked));
  hideButton.addEventListener('click', () => setVisible(false));
  window.addEventListener('resize', () => {
    const rect = overlay.getBoundingClientRect();
    const stage = mapStage.getBoundingClientRect();
    applyPosition(rect.left - stage.left, rect.top - stage.top, true);
  });

  const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
  requestAnimationFrame(() => { if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) applyPosition(saved.x, saved.y, false); });
  setVisible(false);
})();