const CACHE='travelmap-v43';
const CORE=['./','./index.html','./app-maplibre.js','./style.css','./manifest.webmanifest','./icon.svg','./mp4-muxer.mjs'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('travelmap-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{ if(e.request.method==='GET') e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))); });
