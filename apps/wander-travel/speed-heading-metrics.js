(() => {
  if (window.__wanderSpeedHeadingMetrics) return;
  window.__wanderSpeedHeadingMetrics = true;

  const STORAGE_KEY = 'wander.travel.heading_display';
  let headingDisplay = localStorage.getItem(STORAGE_KEY) || 'degrees';
  let lastMotion = null;

  function metricByLabel(label) {
    return [...document.querySelectorAll('.status-rail .metric')].find((metric) => {
      const text = metric.querySelector('span')?.textContent?.trim().toLowerCase();
      return text === label.toLowerCase();
    });
  }

  function metrics() {
    return [...document.querySelectorAll('.status-rail .metric')];
  }

  function formatSpeed(ctx = {}) {
    const mps = Number(ctx.speed_mps) || 0;
    const kmh = mps * 3.6;
    if (ctx.likely_boat || ctx.transport_mode === 'boat' || ctx.on_water_hint) {
      const kn = Number(ctx.speed_knots) || mps * 1.943844;
      return `${kn.toFixed(kn < 10 ? 1 : 0)} kn`;
    }
    return `${kmh.toFixed(kmh < 10 ? 1 : 0)} km/h`;
  }

  function cardinal(deg) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    return dirs[Math.round((((Number(deg) || 0) % 360 + 360) % 360) / 45) % 8];
  }

  function formatHeading(ctx = {}) {
    const deg = ((Number(ctx.heading_degrees) || 0) % 360 + 360) % 360;
    if (!(ctx.moving || Number(ctx.speed_mps) > 0.4)) return '—';
    if (headingDisplay === 'cardinal') return cardinal(deg);
    return `${Math.round(deg)}°`;
  }

  function writeMetric(metric, labelText, valueText) {
    if (!metric) return;
    const label = metric.querySelector('span');
    const value = metric.querySelector('strong');
    if (label) label.textContent = labelText;
    if (value) value.textContent = valueText;
  }

  function update(ctx = lastMotion || window.wanderMotionContext || {}) {
    lastMotion = ctx;
    const list = metrics();
    const speedMetric = metricByLabel('Ritmo') || metricByLabel('Velocidad') || list[1];
    const headingMetric = metricByLabel('Grupo') || metricByLabel('Rumbo') || list[2];
    writeMetric(speedMetric, 'Velocidad', formatSpeed(ctx));
    writeMetric(headingMetric, 'Rumbo', formatHeading(ctx));
  }

  function ensureTravelSetting() {
    const panel = document.querySelector('.control-panel');
    if (!panel || document.querySelector('#wander-heading-display-setting')) return;
    const section = document.createElement('section');
    section.id = 'wander-heading-display-setting';
    section.className = 'control-section';
    section.innerHTML = `
      <div class="section-title"><h2>Travel</h2><span>Rumbo</span></div>
      <label class="setting-row">
        <span>Mostrar rumbo como</span>
        <select id="wander-heading-display-select">
          <option value="degrees">Grados: 0°–359°</option>
          <option value="cardinal">Cardinal: N, NE, S, SO</option>
        </select>
      </label>
    `;
    panel.appendChild(section);
    const select = section.querySelector('#wander-heading-display-select');
    select.value = headingDisplay;
    select.addEventListener('change', () => {
      headingDisplay = select.value;
      localStorage.setItem(STORAGE_KEY, headingDisplay);
      update();
    });
  }

  document.addEventListener('wander:motion-context', (event) => update(event.detail));
  update();
  ensureTravelSetting();
  window.setInterval(() => {
    update();
    ensureTravelSetting();
  }, 1000);
})();