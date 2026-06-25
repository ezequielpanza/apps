const fallbackLocation = [20.95, -73.666667];
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

if (!window.L) throw new Error("Leaflet failed to load");

const map = L.map("wander-map", { zoomControl: false, scrollWheelZoom: true }).setView(fallbackLocation, 15);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap",
  crossOrigin: true,
  keepBuffer: 5,
}).addTo(map);

const userIcon = L.divIcon({
  className: "",
  html: '<div class="user-map-marker"><span></span></div>',
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});

let currentLocation = fallbackLocation;
let manualLocationMode = false;
let tracking = false;
let trackedPoints = [];
let trackedDistance = 0;
let lastTrackedPoint = null;
let realPoiMarkers = [];
let movementTimer = null;
let movementSpeedIndex = 0;
const speeds = [
  { label: "Caminando", step: 2.8 },
  { label: "Bici", step: 8.9 },
  { label: "Auto urbano", step: 23.3 },
  { label: "Ruta / tren", step: 50 },
];

const marker = L.marker(currentLocation, { icon: userIcon }).addTo(map).bindPopup("Ubicacion de Wander");
const routeLine = L.polyline([], { color: "#147d78", weight: 6, opacity: 0.86 }).addTo(map);
const trackedLine = L.polyline([], { color: "#d85b45", weight: 4, opacity: 0.92, dashArray: "8 8" }).addTo(map);

const title = $("#wander-title");
const message = $("#wander-message");
const companion = $(".companion-panel");
const activeFeed = $("#active-feed");
const activeCount = $("#active-count");
const locationReadout = $("#location-readout");
const trackStatus = $("#track-status-badge");
const trackSummary = $("#track-summary");
const interestInput = $("#interest-input");
const interestTags = $("#interest-tags");
let feedItems = [];

function showMessage(nextTitle, body, options = {}) {
  title.textContent = nextTitle;
  message.textContent = body;
  companion.classList.remove("is-hidden");
  $("#show-companion").hidden = true;
  if (options.feed !== false) addFeed(nextTitle, body);
}

function addFeed(nextTitle, body) {
  feedItems.unshift({ id: Date.now() + Math.random(), title: nextTitle, body });
  feedItems = feedItems.slice(0, 5);
  renderFeed();
}

function renderFeed() {
  activeCount.textContent = String(feedItems.length);
  activeFeed.innerHTML = feedItems.length
    ? feedItems.map((item) => `<article class="active-message"><button class="active-message-button" type="button"><strong>${item.title}</strong><span>${item.body}</span></button></article>`).join("")
    : '<p class="empty-feed">Todavia no hay mensajes activos.</p>';
}

function updateReadout(label = "Ubicacion actual") {
  locationReadout.querySelector("strong").textContent = `${currentLocation[0].toFixed(5)}, ${currentLocation[1].toFixed(5)}`;
  locationReadout.querySelector("small").textContent = label;
}

function updateTrackingUi() {
  trackStatus.textContent = tracking ? "REC" : "OFF";
  trackStatus.style.background = tracking ? "#d85b45" : "#6c5aa8";
  const distance = trackedDistance < 1000 ? `${Math.round(trackedDistance)} m` : `${(trackedDistance / 1000).toFixed(2)} km`;
  trackSummary.textContent = trackedPoints.length > 1 ? `Puntos: ${trackedPoints.length} · Distancia: ${distance}` : "Sin recorrido grabado.";
  const hasTrack = trackedPoints.length > 1;
  $("#save-route-button").disabled = !hasTrack;
  $("#share-route-button").disabled = !hasTrack;
}

function addTrackPoint() {
  if (!tracking) return;
  if (lastTrackedPoint) {
    const delta = map.distance(lastTrackedPoint, currentLocation);
    if (delta < 8) return;
    trackedDistance += delta;
  }
  trackedPoints.push([...currentLocation]);
  lastTrackedPoint = [...currentLocation];
  trackedLine.setLatLngs(trackedPoints);
  updateTrackingUi();
}

function setLocation(latLng, label = "Ubicacion actual", center = true) {
  currentLocation = [latLng[0], latLng[1]];
  marker.setLatLng(currentLocation);
  if (center) map.setView(currentLocation, Math.max(map.getZoom(), 15));
  updateReadout(label);
  addTrackPoint();
}

function parseInterests() {
  return (interestInput?.dataset.tags || interestInput?.value || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function setInterests(values) {
  interestInput.dataset.tags = values.join(", ");
  renderInterests();
}

function renderInterests() {
  const tags = parseInterests();
  interestTags.innerHTML = tags.map((tag) => `<span class="interest-tag">${tag}<button type="button" data-remove-interest="${tag}">x</button></span>`).join("");
  $$('[data-remove-interest]').forEach((button) => button.addEventListener("click", () => setInterests(tags.filter((tag) => tag !== button.dataset.removeInterest))));
}

function classify(tags = {}) {
  if (tags.amenity === "cafe") return { icon: "C", label: "Cafe", tone: "cafe" };
  if (["restaurant", "bar", "pub", "fast_food"].includes(tags.amenity)) return { icon: "B", label: "Comida", tone: "bodegon" };
  if (tags.tourism === "museum" || tags.amenity === "museum") return { icon: "M", label: "Museo", tone: "murales" };
  if (tags.historic) return { icon: "H", label: "Historico", tone: "info" };
  if (["artwork", "gallery"].includes(tags.tourism) || tags.amenity === "arts_centre") return { icon: "A", label: "Arte", tone: "murales" };
  if (tags.tourism === "viewpoint") return { icon: "V", label: "Mirador", tone: "" };
  if (["park", "garden"].includes(tags.leisure)) return { icon: "P", label: "Parque", tone: "" };
  return { icon: "!", label: "Lugar", tone: "info" };
}

async function fetchPois() {
  const [lat, lng] = currentLocation;
  const query = `[out:json][timeout:22];(node(around:1500,${lat},${lng})[amenity~"cafe|restaurant|bar|pub|fast_food|museum|library|arts_centre"];node(around:1500,${lat},${lng})[tourism~"attraction|museum|viewpoint|gallery|artwork"];node(around:1500,${lat},${lng})[historic];node(around:1500,${lat},${lng})[leisure~"park|garden"];way(around:1500,${lat},${lng})[tourism];way(around:1500,${lat},${lng})[historic];);out center 70;`;
  const response = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: new URLSearchParams({ data: query }) });
  if (!response.ok) throw new Error("Overpass no respondio correctamente");
  const data = await response.json();
  return data.elements.map((item) => {
    const point = [item.lat || item.center?.lat, item.lon || item.center?.lon];
    if (!point[0] || !point[1]) return null;
    const tags = item.tags || {};
    const kind = classify(tags);
    const distance = map.distance(currentLocation, point);
    return { id: item.id, title: tags.name || tags.brand || kind.label, point, distance, ...kind };
  }).filter(Boolean).sort((a, b) => a.distance - b.distance).slice(0, 12);
}

function displayPois(pois) {
  realPoiMarkers.forEach((item) => item.remove());
  realPoiMarkers = pois.map((poi) => {
    const icon = L.divIcon({ className: "", html: `<div class="map-marker marker-${poi.tone}"><span></span></div>`, iconSize: [36, 36], iconAnchor: [18, 32] });
    return L.marker(poi.point, { icon }).addTo(map).bindPopup(`<strong>${poi.title}</strong><br>${poi.label}<br>${Math.round(poi.distance)} m`);
  });
  if (realPoiMarkers.length) map.fitBounds(L.featureGroup(realPoiMarkers).getBounds().pad(0.2));
}

function offsetLocation(direction, meters) {
  const [lat, lng] = currentLocation;
  const latStep = meters / 111320;
  const lngStep = meters / (111320 * Math.cos((lat * Math.PI) / 180));
  const changes = {
    north: [latStep, 0], south: [-latStep, 0], east: [0, lngStep], west: [0, -lngStep],
    northeast: [latStep, lngStep], northwest: [latStep, -lngStep], southeast: [-latStep, lngStep], southwest: [-latStep, -lngStep],
  };
  const [dLat, dLng] = changes[direction] || [0, 0];
  setLocation([lat + dLat, lng + dLng], "Movimiento simulado", true);
}

$("#zoom-in-button")?.addEventListener("click", () => map.zoomIn());
$("#zoom-out-button")?.addEventListener("click", () => map.zoomOut());

$("#locate-button")?.addEventListener("click", () => {
  if (!navigator.geolocation) return showMessage("GPS no disponible", "Fija una posicion manualmente desde el panel Desarrollador.");
  navigator.geolocation.getCurrentPosition(
    (position) => setLocation([position.coords.latitude, position.coords.longitude], "GPS del dispositivo"),
    () => showMessage("No pude obtener tu ubicacion", "Permite el acceso al GPS o usa Fijar posicion."),
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

$("#manual-location-button")?.addEventListener("click", () => {
  manualLocationMode = true;
  $("#manual-location-hint").hidden = false;
});

map.on("click", (event) => {
  if (!manualLocationMode) return;
  manualLocationMode = false;
  $("#manual-location-hint").hidden = true;
  setLocation([event.latlng.lat, event.latlng.lng], "Posicion fijada manualmente");
});

$("#real-poi-button")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.classList.add("is-loading");
  showMessage("Buscando lugares reales", "Consultando OpenStreetMap alrededor de tu ubicacion...", { feed: false });
  try {
    const pois = await fetchPois();
    displayPois(pois);
    showMessage(pois.length ? "Lugares cercanos" : "Sin resultados", pois.length ? pois.slice(0, 5).map((poi) => poi.title).join(" · ") : "No encontre lugares con nombre en la zona.");
  } catch (error) {
    showMessage("Busqueda no disponible", "No pude consultar los lugares reales. Intenta nuevamente en unos minutos.");
  } finally {
    button.classList.remove("is-loading");
  }
});

$("#route-button")?.addEventListener("click", () => {
  const destination = realPoiMarkers[0]?.getLatLng();
  if (!destination) return showMessage("Ruta pendiente", "Busca POIs reales para elegir un destino.");
  routeLine.setLatLngs([currentLocation, destination]);
  map.fitBounds(routeLine.getBounds().pad(0.25));
  showMessage("Ruta preparada", "Mostrando una linea directa al primer lugar cercano encontrado.");
});

$("#track-route-button")?.addEventListener("click", () => {
  tracking = !tracking;
  if (tracking && !trackedPoints.length) addTrackPoint();
  updateTrackingUi();
  showMessage(tracking ? "Grabacion iniciada" : "Grabacion detenida", tracking ? "Wander guardara los puntos mientras te muevas." : "El recorrido queda disponible para guardar o compartir.");
});

$("#save-route-button")?.addEventListener("click", () => {
  const geojson = { type: "FeatureCollection", features: [{ type: "Feature", properties: { app: "Wander Travel", recordedAt: new Date().toISOString(), distanceMeters: Math.round(trackedDistance) }, geometry: { type: "LineString", coordinates: trackedPoints.map(([lat, lng]) => [lng, lat]) } }] };
  const url = URL.createObjectURL(new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `wander-route-${new Date().toISOString().replace(/[:.]/g, "-")}.geojson`;
  link.click();
  URL.revokeObjectURL(url);
});

$("#share-route-button")?.addEventListener("click", async () => {
  const text = JSON.stringify({ route: trackedPoints, distanceMeters: Math.round(trackedDistance) });
  if (navigator.share) await navigator.share({ title: "Ruta Wander Travel", text });
  else if (navigator.clipboard) await navigator.clipboard.writeText(text);
  showMessage("Ruta compartida", navigator.share ? "Se abrio el menu para compartir." : "El recorrido se copio al portapapeles.");
});

$("#hide-companion")?.addEventListener("click", () => { companion.classList.add("is-hidden"); $("#show-companion").hidden = false; });
$("#show-companion")?.addEventListener("click", () => { companion.classList.remove("is-hidden"); $("#show-companion").hidden = true; });
$("#collapse-panel")?.addEventListener("click", () => appShell.classList.add("panel-collapsed"));
$("#show-panel")?.addEventListener("click", () => { document.body.classList.remove("dev-panel-open"); appShell.classList.toggle("panel-collapsed"); });
$("#show-dev-panel")?.addEventListener("click", () => { appShell.classList.add("panel-collapsed"); document.body.classList.toggle("dev-panel-open"); developerPanel.classList.toggle("dev-collapsed", !document.body.classList.contains("dev-panel-open")); });

$("#toggle-guide-settings")?.addEventListener("click", () => { $("#guide-settings").hidden = !$("#guide-settings").hidden; });
$("#apply-interests")?.addEventListener("click", () => { setInterests([...parseInterests(), ...interestInput.value.split(",").map((value) => value.trim()).filter(Boolean)]); interestInput.value = ""; showMessage("Intereses actualizados", "Wander usara estas preferencias para priorizar lugares."); });
$$('[data-suggest-tag]').forEach((button) => button.addEventListener("click", () => setInterests([...parseInterests(), button.dataset.suggestTag])));

$$('[data-message]').forEach((button) => button.addEventListener("click", () => {
  const key = button.dataset.message;
  const data = {
    details: ["Mas detalles", "Wander combina ubicacion, intereses y datos reales de OpenStreetMap."],
    route: ["Ruta", "Busca POIs reales para preparar una ruta."],
    skip: ["Otra opcion", "Vuelve a buscar lugares o cambia tus intereses para obtener alternativas."],
  }[key];
  if (data) showMessage(data[0], data[1]);
}));

$$('[data-move]').forEach((button) => button.addEventListener("click", () => {
  clearInterval(movementTimer);
  const direction = button.dataset.move;
  movementTimer = setInterval(() => offsetLocation(direction, speeds[movementSpeedIndex].step), 1000);
  $("#simulator-status").textContent = `${speeds[movementSpeedIndex].label} hacia ${direction}`;
}));

$("[data-stop-move]")?.addEventListener("click", () => {
  clearInterval(movementTimer);
  movementTimer = null;
  movementSpeedIndex = (movementSpeedIndex + 1) % speeds.length;
  $("#simulator-status").textContent = `Movimiento detenido · Proxima velocidad: ${speeds[movementSpeedIndex].label}`;
});

$("#guide-toggle")?.addEventListener("change", (event) => showMessage(event.target.checked ? "Guia personal activa" : "Guia personal apagada", event.target.checked ? "Wander priorizara tus intereses." : "Las sugerencias personalizadas quedaron pausadas."));
$("#talk-toggle")?.addEventListener("click", () => showMessage("Comando de voz", "La interfaz de voz queda preparada para una futura integracion segura mediante backend."));
$("#pause-toggle")?.addEventListener("click", (event) => { event.currentTarget.classList.toggle("is-active"); event.currentTarget.textContent = event.currentTarget.classList.contains("is-active") ? "Reanudar Wander" : "Pausar Wander"; });

marker.on("dragend", (event) => setLocation([event.target.getLatLng().lat, event.target.getLatLng().lng], "Posicion ajustada"));
setInterests(["historia local", "cafes antiguos", "arquitectura rara"]);
addFeed("Wander listo", "Fija tu ubicacion o usa el GPS para empezar.");
updateReadout("Great Inagua");
updateTrackingUi();
setTimeout(() => map.invalidateSize(), 100);
