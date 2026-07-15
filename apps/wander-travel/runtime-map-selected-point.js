(() => {
  const base = window.WanderBase;
  const ctx = window.WanderContext;
  const pois = window.WanderPersonalPOIs;
  if (!base?.map || !ctx || !pois) return;
  const map = base.map;
  const root = map.getContainer();
  let timer = null, down = null, marker = null, point = null;

  const sheet = document.createElement('section');
  sheet.className = 'map-point-sheet';
  sheet.hidden = true;
  sheet.innerHTML = '<div class="map-point-handle"></div><div class="map-point-head"><div><span>PUNTO SELECCIONADO</span><input id="map-point-name" value="Punto seleccionado" aria-label="Nombre del punto"></div><button id="map-point-close" aria-label="Cerrar"><svg class="ui-icon"><use href="wander-icons.svg#close"></use></svg></button></div><div class="map-point-data"><div><span>Distancia</span><strong id="map-point-distance">—</strong></div><div><span>Rumbo</span><strong id="map-point-bearing">—</strong></div><div class="wide"><span>Coordenadas</span><strong id="map-point-coordinates">—</strong></div></div><div class="map-point-actions"><button id="map-point-route"><svg class="button-icon"><use href="wander-icons.svg#route"></use></svg>Ruta hasta</button><button id="map-point-save"><svg class="button-icon"><use href="wander-icons.svg#pin"></use></svg>Guardar</button></div>';
  document.body.appendChild(sheet);

  const name = sheet.querySelector('#map-point-name');
  const distance = sheet.querySelector('#map-point-distance');
  const bearing = sheet.querySelector('#map-point-bearing');
  const coordinates = sheet.querySelector('#map-point-coordinates');

  const current = () => base.getPosition?.() || window.WanderMapPosition?.getPosition?.() || null;
  const distanceLabel = (m) => !Number.isFinite(m) ? '—' : m >= 1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`;
  function bearingTo(a,b){
    const p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180,d=(b.lng-a.lng)*Math.PI/180;
    const y=Math.sin(d)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(d);
    return (Math.atan2(y,x)*180/Math.PI+360)%360;
  }
  function update(){
    if(!point)return;
    const here=current(), target=L.latLng(point.lat,point.lng);
    point.name=name.value.trim()||'Punto seleccionado';
    point.distanceM=here?map.distance(here,target):null;
    point.bearingDeg=here?bearingTo(here,target):null;
    distance.textContent=distanceLabel(point.distanceM);
    bearing.textContent=Number.isFinite(point.bearingDeg)?`${Math.round(point.bearingDeg)}°`:'—';
    coordinates.textContent=`${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
    ctx.set('map.selectedPoint',{...point},{source:'map-long-press',kind:'selected',confidence:1});
  }
  function icon(){return L.divIcon({className:'',html:'<div class="map-point-marker"><span></span></div>',iconSize:[34,42],iconAnchor:[17,42]});}
  function select(latlng){
    const p=L.latLng(latlng);
    point={lat:p.lat,lng:p.lng,name:'Punto seleccionado',selectedAt:Date.now(),saved:false};
    if(!marker)marker=L.marker(p,{icon:icon(),zIndexOffset:1200}).addTo(map);else marker.setLatLng(p).addTo(map);
    name.value=point.name;
    sheet.hidden=false;
    sheet.style.display='block';
    sheet.style.visibility='visible';
    sheet.style.pointerEvents='auto';
    sheet.setAttribute('aria-hidden','false');
    update();
    navigator.vibrate?.(35);
  }
  function clear(){
    if(marker)map.removeLayer(marker);marker=null;point=null;sheet.hidden=true;sheet.style.removeProperty('display');sheet.style.removeProperty('visibility');sheet.style.removeProperty('pointer-events');sheet.setAttribute('aria-hidden','true');ctx.remove?.('map.selectedPoint');
  }
  function excluded(t){return Boolean(t?.closest?.('.leaflet-control,.leaflet-marker-icon,.wander-top-controls,.wander-card,#context-dashboard,.simulation-map-controls,.personal-poi-sheet,.map-point-sheet'));}
  function cancel(){if(timer)clearTimeout(timer);timer=null;}

  root.addEventListener('pointerdown',(e)=>{
    if(e.isPrimary===false||e.button>0||excluded(e.target))return;
    down={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
    cancel();timer=setTimeout(()=>{
      if(!down||down.moved)return;
      const r=root.getBoundingClientRect();
      select(map.containerPointToLatLng(L.point(down.x-r.left,down.y-r.top)));
      down=null;
    },600);
  },true);
  root.addEventListener('pointermove',(e)=>{
    if(!down||e.pointerId!==down.id)return;
    if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>14){down.moved=true;cancel();}
  },true);
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>root.addEventListener(type,()=>{cancel();down=null;},true));

  name.addEventListener('input',update);
  sheet.querySelector('#map-point-close').addEventListener('click',clear);
  sheet.querySelector('#map-point-route').addEventListener('click',()=>{
    if(!point)return;const here=current();
    if(!here)return window.WanderUI?.showWander('Sin ubicación','Wander necesita tu posición para calcular la ruta.');
    const line=[[here.lat,here.lng],[point.lat,point.lng]];
    base.route?.setLatLngs?.(line);map.fitBounds(line,{padding:[54,54],maxZoom:16});
    ctx.set('navigation.destination',{...point},{source:'selected-point',kind:'selected',confidence:1});
  });
  sheet.querySelector('#map-point-save').addEventListener('click',()=>{
    if(!point)return;
    const before=new Set(pois.list().map(p=>p.id));
    if(!pois.createAt({lat:point.lat,lng:point.lng}))return;
    const added=pois.list().find(p=>!before.has(p.id));
    const custom=name.value.trim();
    if(added&&custom&&custom!=='Punto seleccionado')pois.update?.(added.id,{name:custom});
    clear();
  });
  ctx.subscribe(key=>{if(point&&(key==='location.effective'||key.startsWith('location.effective.')))update();});
  window.WanderMapSelectedPoint=Object.freeze({getCurrent:()=>point?{...point}:null,select,clear});
})();