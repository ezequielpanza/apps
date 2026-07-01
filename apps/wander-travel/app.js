const INITIAL_CENTER = [0, 0];
const stoppedIcon = L.divIcon({
  className: '',
  html: '<div class="wander-user-dot" style="width:18px;height:18px;border-radius:50%;background:#173f3b;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const map = L.map('wander-map', { zoomControl: false }).setView(INITIAL_CENTER, 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap',
}).addTo(map);

const marker = L.marker(INITIAL_CENTER, {
  draggable: true,
  icon: stoppedIcon,
  opacity: 0,
}).addTo(map);

const route = L.polyline([], { weight: 5, opacity: 0.8 }).addTo(map);

window.WanderBase = {
  map,
  marker,
  route,
  revealMarker() {
    try { marker.setOpacity(1); } catch {}
  },
};
window.WanderRevealMarker = window.WanderBase.revealMarker;

const $ = (selector) => document.querySelector(selector);
function say(title, text) {
  const panel = $('.companion-panel');
  const titleEl = $('#wander-title');
  const textEl = $('#wander-message');
  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = text;
  panel?.classList.remove('is-hidden');
}

$('#zoom-in-button')?.addEventListener('click', () => map.zoomIn());
$('#zoom-out-button')?.addEventListener('click', () => map.zoomOut());
$('#hide-companion')?.addEventListener('click', () => $('.companion-panel')?.classList.add('is-hidden'));
$('#show-companion')?.addEventListener('click', () => $('.companion-panel')?.classList.toggle('is-hidden'));
$('#collapse-panel')?.addEventListener('click', () => $('.app-shell')?.classList.add('panel-collapsed'));
$('[data-message="details"]')?.addEventListener('click', () => say('Detalle', 'Wander combina tu posición, tus intereses y datos públicos del lugar.'));
$('[data-message="route"]')?.addEventListener('click', () => say('Ruta', 'La navegación automática está desactivada mientras reconstruimos esta función.'));
$('[data-message="skip"]')?.addEventListener('click', () => say('Otra opción', 'Busca POIs reales para descubrir una alternativa cercana.'));
$('#ask-wander-button')?.addEventListener('click', () => say('Consulta', 'La conexión con IA todavía no está configurada en esta app.'));

setTimeout(() => map.invalidateSize(), 100);