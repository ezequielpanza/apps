const CACHE='boat-station-web-0.2.8';
const ASSETS=['./','./index.html','./patch_v101.js','./patch_v200.js','./core_bridge_compat.js','./local_runtime.js','./runtime_fixes.js','./ui_probe.js','./remote_gate.js','./remote_sync.js','./apk_link.js','./backend_url.js','./icon.png','./manifest.webmanifest','./VERSION'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('boat-station-web-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.pathname.endsWith('/boat_station_logo.png')){
    event.respondWith(caches.match('./icon.png').then(r=>r||fetch('./icon.png')));
    return;
  }
  event.respondWith(fetch(event.request).then(response=>{
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,copy));
    return response;
  }).catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html'))));
});
