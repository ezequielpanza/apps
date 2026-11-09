import Navigator from './plugin.svelte';
import { map, seamarks } from './adapters/map.js';
new Navigator({target: document.getElementById('navigator')});
const toggle = document.getElementById('seamarks');
toggle.addEventListener('click', () => {
  const active = map.hasLayer(seamarks);
  if (active) map.removeLayer(seamarks); else seamarks.addTo(map);
  toggle.setAttribute('aria-pressed', String(!active));
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.error);
