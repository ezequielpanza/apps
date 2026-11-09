import Navigator from './plugin.svelte';
import { map, seamarks } from './adapters/map.js';
new Navigator({target: document.getElementById('navigator')});
const toggle = document.getElementById('seamarks');
toggle.addEventListener('click', () => {
  const active = map.hasLayer(seamarks);
  if (active) map.removeLayer(seamarks); else seamarks.addTo(map);
  toggle.setAttribute('aria-pressed', String(!active));
});
const installButton = document.getElementById('install-app');
const installHelp = document.getElementById('install-help');
const installInstructions = document.getElementById('install-help-instructions');
let deferredInstallPrompt = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const hideInstallButton = () => { installButton.hidden = true; };

if (isStandalone()) hideInstallButton();
else {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });
  installButton.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === 'accepted') hideInstallButton();
      return;
    }
    const userAgent = navigator.userAgent;
    if (/android/i.test(userAgent)) {
      installInstructions.textContent = 'Toca ⋮ (arriba a la derecha) y elige “Instalar app” o “Añadir a pantalla principal”.';
    } else if (/iphone|ipad|ipod/i.test(userAgent)) {
      installInstructions.textContent = 'Toca Compartir y elige “Añadir a pantalla de inicio”.';
    } else {
      installInstructions.textContent = 'Abre el menú del navegador y elige “Instalar Wind Navigator” o “Instalar app”.';
    }
    installHelp.showModal();
  });
}

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  hideInstallButton();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.error);
