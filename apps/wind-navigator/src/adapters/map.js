export const map = L.map('map', { zoomControl:false }).setView([18.1, -66.5], 6);
const osmCredit = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
const baseMaps = {
  standard: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:osmCredit}),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom:19, attribution:'Tiles &copy; Esri &mdash; Esri, DigitalGlobe, GeoEye, Earthstar Geographics, and the GIS User Community'}),
  topographic: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {maxZoom:19, maxNativeZoom:17, attribution:`Map data: ${osmCredit}, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)`}),
};
let activeBase = 'standard';
let nauticalMarksEnabled = true;
try {
  const savedType = localStorage.getItem('wind-navigator-map-type');
  if (savedType === 'nautical') {
    nauticalMarksEnabled = true;
  } else if (savedType && Object.hasOwn(baseMaps, savedType)) {
    activeBase = savedType;
    nauticalMarksEnabled = false;
  } else {
    const savedBase = localStorage.getItem('wind-navigator-base-map');
    if (savedBase && Object.hasOwn(baseMaps, savedBase)) activeBase = savedBase;
  }
} catch {}
baseMaps[activeBase].addTo(map);
export function getBaseMap() { return activeBase; }
export function setBaseMap(name) {
  if (!Object.hasOwn(baseMaps, name) || name === activeBase) return;
  map.removeLayer(baseMaps[activeBase]);
  activeBase = name;
  baseMaps[activeBase].addTo(map).bringToBack();
  try { localStorage.setItem('wind-navigator-base-map', name); } catch {}
}
export const seamarks = L.tileLayer('https://t1.openseamap.org/seamark/{z}/{x}/{y}.png', {maxZoom:18, attribution:'&copy; <a href="https://www.openseamap.org/">OpenSeaMap</a> contributors'});
if (nauticalMarksEnabled) seamarks.addTo(map);

export function getMapType() {
  return activeBase === 'standard' && nauticalMarksEnabled ? 'nautical' : activeBase;
}

export function setMapType(name) {
  if (name === 'nautical') {
    setBaseMap('standard');
    if (!nauticalMarksEnabled) {
      seamarks.addTo(map);
      nauticalMarksEnabled = true;
    }
  } else if (Object.hasOwn(baseMaps, name)) {
    setBaseMap(name);
    if (nauticalMarksEnabled) {
      map.removeLayer(seamarks);
      nauticalMarksEnabled = false;
    }
  } else return;
  try { localStorage.setItem('wind-navigator-map-type', name); } catch {}
}
