(() => {
  const STORAGE_KEY = 'wander-travel-simulator-overlay-visible';
  const mapStage = document.querySelector('.map-stage');
  const developerPanel = document.querySelector('#developer-panel .developer-panel');
  const movePad = developerPanel?.querySelector('.move-pad');
  const simulatorStatus = developerPanel?.querySelector('#simulator-status');

  if (!mapStage || !developerPanel || !movePad || !simulatorStatus) return;

  const overlay = document.createElement('section');
  overlay.id = 'movement-simulator-overlay';
  overlay.className = 'movement-overlay';
  overlay.setAttribute('aria-label', 'Control de movimiento simulado');
  overlay.innerHTML = `
    <div class="movement-overlay-header">
      <div>
        <span>Simulación</span>
        <strong>Movimiento</strong>
      </div>
      <button id="hide-movement-overlay" type="button" aria-label="Ocultar control de movimiento">×</button>
    </div>
  `;
  overlay.appendChild(movePad);
  overlay.appendChild(simulatorStatus);
  mapStage.appendChild(overlay);

  const toggleCard = document.createElement('section');
  toggleCard.className = 'developer-overlay-setting';
  toggleCard.innerHTML = `
    <div>
      <h3>Control sobre el mapa</h3>
      <p>Muestra u oculta el pad de movimiento simulado sin detener la simulación.</p>
    </div>
    <label class="developer-overlay-switch">
      <input id="toggle-movement-overlay" type="checkbox" checked />
      <span></span>
    </label>
  `;
  developerPanel.insertBefore(toggleCard, developerPanel.querySelector('.poi-debug-section') || null);

  const toggle = toggleCard.querySelector('#toggle-movement-overlay');
  const hideButton = overlay.querySelector('#hide-movement-overlay');

  const style = document.createElement('style');
  style.textContent = `
    .movement-overlay{position:absolute;left:18px;bottom:18px;z-index:820;display:grid;gap:10px;padding:12px;border:1px solid rgba(24,32,27,.14);border-radius:20px;background:rgba(255,255,255,.94);box-shadow:0 18px 45px rgba(20,35,55,.22);backdrop-filter:blur(12px);transition:opacity .18s ease,transform .18s ease;max-width:calc(100vw - 36px)}
    .movement-overlay.is-hidden{opacity:0;transform:translateY(16px);pointer-events:none}
    .movement-overlay-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 2px}.movement-overlay-header span{display:block;color:#777;font-size:.63rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.movement-overlay-header strong{display:block;margin-top:2px;color:#342d52;font-size:.9rem}.movement-overlay-header button{display:grid;width:28px;height:28px;place-items:center;border:0;border-radius:9px;background:#efedf5;color:#5b5275;font-size:1.1rem;cursor:pointer}
    .movement-overlay .move-pad{display:grid!important;grid-template-columns:repeat(3,54px)!important;grid-template-rows:repeat(3,54px)!important;gap:8px!important;margin:0!important;padding:10px!important;width:max-content!important;border:0!important;border-radius:16px!important;background:linear-gradient(180deg,rgba(108,90,168,.08),rgba(108,90,168,.03))!important;box-shadow:none!important}
    .movement-overlay .move-button{position:relative!important;display:grid!important;width:54px!important;height:54px!important;min-width:54px!important;min-height:54px!important;place-items:center!important;padding:0!important;border:1px solid rgba(24,32,27,.12)!important;border-radius:15px!important;background:linear-gradient(180deg,#fff,#f4f1fa)!important;color:#342d52!important;box-shadow:0 7px 16px rgba(24,32,27,.10),inset 0 1px 0 rgba(255,255,255,.9)!important;font-size:1.35rem!important;font-weight:800!important;line-height:1!important;cursor:pointer!important}
    .movement-overlay .move-button.is-active{border-color:#6c5aa8!important;background:linear-gradient(180deg,#eee8ff,#ddd3f7)!important}.movement-overlay .move-button.is-active::after{content:attr(data-speed);position:absolute;left:50%;bottom:-8px;transform:translateX(-50%);padding:3px 6px;border-radius:999px;background:#6c5aa8;color:#fff;font-size:.54rem;font-weight:800;white-space:nowrap}.movement-overlay .stop-button{grid-column:2!important;grid-row:2!important;border-color:rgba(216,91,69,.28)!important;background:linear-gradient(180deg,#fff8f5,#fbe5df)!important;color:#a23f2f!important;font-size:.68rem!important;text-transform:uppercase!important}.movement-overlay .move-nw{grid-column:1!important;grid-row:1!important}.movement-overlay .move-up{grid-column:2!important;grid-row:1!important}.movement-overlay .move-ne{grid-column:3!important;grid-row:1!important}.movement-overlay .move-left{grid-column:1!important;grid-row:2!important}.movement-overlay .move-right{grid-column:3!important;grid-row:2!important}.movement-overlay .move-sw{grid-column:1!important;grid-row:3!important}.movement-overlay .move-down{grid-column:2!important;grid-row:3!important}.movement-overlay .move-se{grid-column:3!important;grid-row:3!important}.movement-overlay .simulator-status{margin:0!important;padding:8px 10px!important;border-radius:10px!important;background:rgba(108,90,168,.08)!important;color:#5b5275!important;font-size:.72rem!important;font-weight:700!important;text-align:center!important}
    .developer-overlay-setting{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:16px 0;padding:14px;border:1px solid rgba(24,32,27,.12);border-radius:14px;background:#f8f9fb}.developer-overlay-setting h3{margin:0 0 4px;font-size:.88rem}.developer-overlay-setting p{margin:0;color:#747b74;font-size:.72rem;line-height:1.35}.developer-overlay-switch{position:relative;display:inline-flex;flex:0 0 auto}.developer-overlay-switch input{position:absolute;opacity:0;pointer-events:none}.developer-overlay-switch span{display:block;width:46px;height:27px;border-radius:999px;background:#cdd2d7;cursor:pointer;transition:.2s}.developer-overlay-switch span::after{content:'';display:block;width:21px;height:21px;margin:3px;border-radius:50%;background:#fff;box-shadow:0 2px 7px rgba(0,0,0,.2);transition:.2s}.developer-overlay-switch input:checked+span{background:#6c5aa8}.developer-overlay-switch input:checked+span::after{transform:translateX(19px)}
    @media(max-width:640px){.movement-overlay{left:10px;bottom:10px;padding:9px}.movement-overlay .move-pad{grid-template-columns:repeat(3,48px)!important;grid-template-rows:repeat(3,48px)!important}.movement-overlay .move-button{width:48px!important;height:48px!important;min-width:48px!important;min-height:48px!important;font-size:1.2rem!important}}
  `;
  document.head.appendChild(style);

  function readVisible() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  }

  function setVisible(visible) {
    overlay.classList.toggle('is-hidden', !visible);
    toggle.checked = visible;
    toggle.setAttribute('aria-checked', String(visible));
    localStorage.setItem(STORAGE_KEY, String(visible));
  }

  toggle.addEventListener('change', () => setVisible(toggle.checked));
  hideButton.addEventListener('click', () => setVisible(false));
  setVisible(readVisible());
})();
