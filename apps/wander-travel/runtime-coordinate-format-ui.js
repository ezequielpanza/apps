(() => {
  const context = window.WanderContext;
  if (!context) return;

  const STYLE_ID = 'wander-coordinate-format-style';
  const STORAGE_KEY = 'wander.coordinates.format.v1';

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #context-list .context-row {
        grid-template-columns: minmax(0, 1fr) !important;
        align-items: start !important;
        gap: 7px !important;
      }
      #context-list .context-row-value {
        width: 100%;
        min-width: 0;
        padding-left: 27px;
        text-align: left !important;
      }
      #context-list .context-row-value b {
        display: block;
        max-width: 100%;
        font-size: .82rem;
        line-height: 1.4;
        white-space: normal;
        overflow-wrap: anywhere;
      }
      .coordinate-format-button {
        display: block;
        width: 100%;
        min-width: 0;
        margin: 0;
        padding: 4px 0;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
        touch-action: manipulation;
      }
      .coordinate-format-button b {
        display: block;
        max-width: 100%;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: .79rem;
        line-height: 1.45;
        white-space: normal;
        overflow-wrap: anywhere;
      }
      .coordinate-format-button:active,
      .coordinate-format-button:focus-visible {
        outline: none;
        background: rgba(1,224,203,.12);
      }
    `;
    document.head.appendChild(style);
  }

  function format() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return ['dd', 'dm', 'dms'].includes(value) ? value : 'dd';
    } catch { return 'dd'; }
  }

  function part(value, positive, negative, selected) {
    const hemisphere = value >= 0 ? positive : negative;
    const absolute = Math.abs(value);
    if (selected === 'dd') return absolute.toFixed(6) + '° ' + hemisphere;
    const degrees = Math.floor(absolute);
    const minutesFull = (absolute - degrees) * 60;
    if (selected === 'dm') return degrees + '° ' + minutesFull.toFixed(3) + '′ ' + hemisphere;
    const minutes = Math.floor(minutesFull);
    const seconds = (minutesFull - minutes) * 60;
    return degrees + '° ' + minutes + '′ ' + seconds.toFixed(1) + '″ ' + hemisphere;
  }

  function value() {
    const effective = context.getEffectiveLocation?.();
    const lat = Number(effective?.lat ?? context.value('location.effective.lat'));
    const lng = Number(effective?.lng ?? context.value('location.effective.lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'Pendiente';
    const selected = format();
    if (selected === 'dd') return lat.toFixed(6) + ', ' + lng.toFixed(6);
    return part(lat, 'N', 'S', selected) + ' · ' + part(lng, 'E', 'W', selected);
  }

  function renderDashboardCoordinate() {
    const metric = document.querySelector('#metric-coordinates');
    if (metric) metric.textContent = value();
  }

  function scheduleRender() {
    requestAnimationFrame(renderDashboardCoordinate);
  }

  context.subscribe((key) => {
    if (!key || key.startsWith('location.effective')) scheduleRender();
  });
  window.addEventListener('wander:coordinate-format-change', scheduleRender);
  scheduleRender();
})();