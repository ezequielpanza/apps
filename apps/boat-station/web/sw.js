const CACHE='boat-station-v2';
const APP_SHELL=['./','./index.html','./styles.css','./battery-overview.css','./stations.css','./app.js','./manifest.webmanifest','./icon.png','./remote_landing.js','./stations.js','./native-tools-adapter.js','./native-bluetooth.js','./modules/gps.js','./modules/batteries.js','./modules/phone.js','./modules/seastate.js','./modules/compass.js'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
    return response;
  }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
});