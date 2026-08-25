const CACHE='boat-station-v29';
const APP_SHELL=['./','./index.html','./styles.css','./battery-overview.css','./stations.css','./remote-client-ui.css','./page-interactions.css','./adaptive-pages.css','./responsive-components.css','./stable-resize-observer.js','./app.js','./page-layout.js','./page-interactions.js','./module-layout-settings.js','./battery-flow-status.js','./battery-manager-status.js','./battery-chart-labels.js','./battery-chart-grid.js','./battery-individual-history.js','./battery-stat-settings.js','./data-sync.js','./apk-update.js','./manifest.webmanifest','./icon.png','./remote_landing.js','./remote-client-ui-v2.js','./stations.js','./native-tools-adapter.js','./native-bluetooth.js','./modules/gps.js','./modules/batteries.js','./modules/phone.js','./modules/seastate.js','./modules/compass.js'];

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
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{
    if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
    return response;
  }).catch(async()=>{
    const hit=await caches.match(event.request);
    if(hit)return hit;
    if(event.request.mode==='navigate')return caches.match('./index.html');
    return Response.error();
  }));
});