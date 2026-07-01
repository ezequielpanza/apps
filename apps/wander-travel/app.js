const center=[0,0];
const stoppedIcon=L.divIcon({className:'',html:'<div class="wander-user-dot" style="width:18px;height:18px;border-radius:50%;background:#173f3b;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)"></div>',iconSize:[18,18],iconAnchor:[9,9]});
const map=L.map('wander-map',{zoomControl:false}).setView(center,2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
let marker=L.marker(center,{draggable:true,icon:stoppedIcon,opacity:0}).addTo(map);
let route=L.polyline([], {weight:5,opacity:.8}).addTo(map);
let tracking=false,manual=false,points=[];
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const readout=$('#location-readout');
const panel=$('.companion-panel');
const title=$('#wander-title');
const message=$('#wander-message');

function revealMarker(){try{marker.setOpacity(1)}catch{}}
function setPosition(latlng,label='Ubicación actual'){
  revealMarker();
  marker.setLatLng(latlng);
  if(readout){
    readout.querySelector('strong').textContent=`${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
    readout.querySelector('small').textContent=label;
  }
  if(tracking){points.push([latlng.lat,latlng.lng]);route.setLatLngs(points);updateTrack();}
}
function updateTrack(){
  const km=points.length<2?0:points.slice(1).reduce((n,p,i)=>n+map.distance(points[i],p),0)/1000;
  const summary=$('#track-summary');
  const badge=$('#track-status-badge');
  if(summary) summary.textContent=`${points.length} puntos · ${km.toFixed(2)} km`;
  if(badge) badge.textContent=tracking?'ON':'OFF';
}
function tell(t,m){
  if(title) title.textContent=t;
  if(message) message.textContent=m;
  panel?.classList.remove('is-hidden');
  $('#show-companion')?.classList.remove('has-unread');
}

window.WanderRevealMarker=revealMarker;
marker.on('dragend',e=>setPosition(e.target.getLatLng(),'Posición ajustada'));
map.on('click',e=>{if(manual){manual=false;const hint=$('#manual-location-hint');if(hint) hint.hidden=true;setPosition(e.latlng,'Posición de prueba');}});
$('#zoom-in-button')?.addEventListener('click',()=>map.zoomIn());
$('#zoom-out-button')?.addEventListener('click',()=>map.zoomOut());
$('#manual-location-button')?.addEventListener('click',()=>{manual=true;const hint=$('#manual-location-hint');if(hint) hint.hidden=false;});
$('#track-route-button')?.addEventListener('click',e=>{tracking=!tracking;e.currentTarget.classList.toggle('active',tracking);if(tracking&&points.length===0)points.push([marker.getLatLng().lat,marker.getLatLng().lng]);updateTrack();});
$('#save-route-button')?.addEventListener('click',()=>{
  const data={type:'Feature',geometry:{type:'LineString',coordinates:points.map(p=>[p[1],p[0]])},properties:{name:'Wander Travel'}};
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/geo+json'}));
  a.download='wander-route.geojson';
  a.click();
  URL.revokeObjectURL(a.href);
});
$('#share-route-button')?.addEventListener('click',async()=>{
  const text=`Ruta Wander Travel con ${points.length} puntos.`;
  if(navigator.share) await navigator.share({title:'Wander Travel',text});
  else await navigator.clipboard.writeText(text);
});
$('#hide-companion')?.addEventListener('click',()=>panel?.classList.add('is-hidden'));
$('#show-companion')?.addEventListener('click',()=>panel?.classList.toggle('is-hidden'));
$$('[data-message]').forEach(b=>b.addEventListener('click',()=>{
  const k=b.dataset.message;
  if(k==='details') tell('Detalle','Wander combina tu posición, tus intereses y datos públicos del lugar.');
  if(k==='route') tell('Ruta','La navegación automática está desactivada mientras reconstruimos esta función.');
  if(k==='skip') tell('Otra opción','Busca POIs reales para descubrir una alternativa cercana.');
}));
$('#ask-wander-button')?.addEventListener('click',()=>{const q=prompt('Qué querés preguntarle a Wander?');if(q)tell('Consulta recibida',`Todavía no hay una clave de IA configurada. Tu consulta fue: ${q}`);});
$('#collapse-panel')?.addEventListener('click',()=>$('.app-shell')?.classList.add('panel-collapsed'));
$('#show-panel')?.addEventListener('click',()=>$('.app-shell')?.classList.toggle('panel-collapsed'));
function renderTags(){const tags=$('#interest-input')?.value.split(',').map(x=>x.trim()).filter(Boolean)||[];const box=$('#interest-tags');if(box) box.innerHTML=tags.map(x=>`<span>${x}</span>`).join('');}
$('#apply-interests')?.addEventListener('click',renderTags);
const feed=['Wander listo.','GPS pendiente.'];
const activeFeed=$('#active-feed');
if(activeFeed) activeFeed.innerHTML=feed.map(x=>`<div class="message-card">${x}</div>`).join('');
const activeCount=$('#active-count');
if(activeCount) activeCount.textContent=feed.length;
renderTags();
setTimeout(()=>map.invalidateSize(),100);