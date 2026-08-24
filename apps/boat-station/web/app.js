import {createGpsModule} from './modules/gps.js';
import {createBatteriesModule} from './modules/batteries.js';
import {createPhoneModule} from './modules/phone.js';
import {createSeaStateModule} from './modules/seastate.js';
import {createCompassModule} from './modules/compass.js';
import {createPageLayoutEngine} from './page-layout.js';

const cards=document.getElementById('cards');
const menu=document.getElementById('menuSheet');
const add=document.getElementById('addSheet');
const ALL_MODULE_IDS=['gps','batteries','phone','seastate','compass'];
const readJson=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback}catch{return fallback}};
const savedOrder=readJson('bs.ui.order',readJson('bs.clean.order',null));
const ui={order:Array.isArray(savedOrder)?savedOrder.filter(id=>ALL_MODULE_IDS.includes(id)):[...ALL_MODULE_IDS],collapsed:{}};
const modules={};
let lockedScrollY=0,sheetDrag=null,moduleMenuId=null,reorder=null,tapCandidate=null,refreshGesture=null;
let scanDevices=[];

const pendingRenders=new Set();
let renderTimer=0,lastRenderAt=0;
const ACTIVE_RENDER_MS=200,HIDDEN_RENDER_MS=750;
function flushRenders(){
  renderTimer=0;lastRenderAt=performance.now();
  const ids=[...pendingRenders];pendingRenders.clear();
  for(const id of ids){
    const render=()=>renderModule(id,true);
    if(!window.BoatStationPageInteractions?.requestRender?.(id,render))render();
  }
  if(pendingRenders.size)scheduleRenderFlush();
}
function scheduleRenderFlush(){if(renderTimer)return;const interval=document.hidden?HIDDEN_RENDER_MS:ACTIVE_RENDER_MS;const wait=Math.max(0,interval-(performance.now()-lastRenderAt));renderTimer=setTimeout(flushRenders,wait)}
function requestRender(id){if(!modules[id])return;pendingRenders.add(id);scheduleRenderFlush()}
function openBatteryManager(){renderBatteryManager();openSheet(batteryManager)}
modules.gps=createGpsModule(requestRender);
modules.batteries=createBatteriesModule(requestRender,openBatteryManager);
modules.phone=createPhoneModule(requestRender);
modules.seastate=createSeaStateModule(requestRender);
modules.compass=createCompassModule(requestRender);

document.addEventListener('visibilitychange',()=>{if(!document.hidden&&pendingRenders.size){if(renderTimer){clearTimeout(renderTimer);renderTimer=0}flushRenders()}});

function pager(count,current){return `<div class="pager">${Array.from({length:count},(_,i)=>`<span class="${i===current?'on':''}">●</span>`).join('')}</div>`}
function dragHandle(){return '<button class="drag-handle" type="button" aria-label="Mover módulo"><i></i><i></i><i></i><i></i><i></i><i></i></button>'}
function resizeHandle(){return '<button class="resize-handle" type="button" aria-label="Cambiar tamaño del contenido"><i></i><i></i><i></i></button>'}
function pageHtml(module,index,current){return `<div class="page" data-page="${index}"><div class="page-content">${module.page(index)}</div>${pager(module.pages,current)}</div>`}
function moduleHtml(id){const module=modules[id],current=layout.getPage(id,module.pages);const pages=Array.from({length:module.pages},(_,i)=>pageHtml(module,i,current)).join('');return `<section class="card${ui.collapsed[id]?' collapsed':''}" data-id="${id}"><header class="card-head">${dragHandle()}<span class="dot"></span><span class="title">${module.name}</span><span class="summary">${module.summary()}</span><button class="more" type="button">⋮</button></header><div class="card-body"><div class="viewport"><div class="track">${pages}</div></div></div>${resizeHandle()}</section>`}
function saveOrder(){localStorage.setItem('bs.ui.order',JSON.stringify(ui.order))}

const layout=createPageLayoutEngine(cards);
function hydrate(card){if(!card)return;const id=card.dataset.id;modules[id]?.afterRender?.(card);layout.mountCard(card)}
function renderAll(){cards.innerHTML=ui.order.map(moduleHtml).join('');cards.querySelectorAll('.card').forEach(hydrate)}
function renderPageContent(card,id,page){const module=modules[id],content=card?.querySelector(`.page[data-page="${page}"] > .page-content`);if(!module||!content)return;content.innerHTML=module.page(page);module.afterRender?.(card);layout.refreshPage(card,page)}
function renderModule(id,preserveLayout=false){
  const card=cards.querySelector(`.card[data-id="${id}"]`);if(!card)return;
  const module=modules[id],page=layout.currentPage(card),summary=card.querySelector('.summary');if(summary)summary.textContent=module.summary();
  if(preserveLayout){renderPageContent(card,id,page);return}
  const holder=document.createElement('div');holder.innerHTML=moduleHtml(id);const next=holder.firstElementChild;card.replaceWith(next);hydrate(next);
}
window.addEventListener('boatstation-page-change',event=>{const {id,page,card}=event.detail||{};if(id&&card)renderPageContent(card,id,page)});

function anySheetOpen(){return [...document.querySelectorAll('.sheet')].some(s=>s.classList.contains('open'))}
function lockModuleScroll(){if(document.body.classList.contains('menu-open'))return;lockedScrollY=window.scrollY||document.documentElement.scrollTop||0;document.body.classList.add('menu-open');document.body.style.top=`-${lockedScrollY}px`}
function unlockModuleScroll(){if(anySheetOpen()||!document.body.classList.contains('menu-open'))return;document.body.classList.remove('menu-open');document.body.style.top='';window.scrollTo(0,lockedScrollY)}
function openSheet(sheet){const inner=sheet.querySelector('.sheet-inner');if(inner){inner.style.transform='';inner.style.transition=''}sheet.classList.add('open');lockModuleScroll()}
function closeSheet(sheet){const inner=sheet.querySelector('.sheet-inner');if(inner){inner.style.transform='';inner.style.transition=''}sheet.classList.remove('open');unlockModuleScroll()}
function bindSheetHandle(sheet){const handle=sheet.querySelector('.handle'),inner=sheet.querySelector('.sheet-inner');if(!handle||!inner||handle.dataset.bound)return;handle.dataset.bound='1';handle.addEventListener('pointerdown',e=>{if(!sheet.classList.contains('open')||sheet.classList.contains('fullscreen-sheet'))return;e.preventDefault();e.stopPropagation();sheetDrag={sheet,inner,startY:e.clientY,pointerId:e.pointerId};inner.style.transition='none';try{handle.setPointerCapture(e.pointerId)}catch{}})}
function makeSheet(full=false){const sheet=document.createElement('div');sheet.className='sheet'+(full?' fullscreen-sheet':'');document.body.appendChild(sheet);return sheet}
function fullHeader(title,backAttr='data-full-back'){return `<div class="fullscreen-head"><button class="fullscreen-back" type="button" ${backAttr}>‹</button><h3>${title}</h3></div>`}

const moduleMenu=makeSheet(false),unitsMenu=makeSheet(true),coordMenu=makeSheet(true),batteryManager=makeSheet(true),bluetoothScanner=makeSheet(true);
function renderModuleMenu(id){const isGps=id==='gps',isBat=id==='batteries';moduleMenu.innerHTML=`<div class="sheet-inner compact-sheet"><div class="handle"></div><h3>${modules[id].name}</h3>${isGps?'<button class="option sheet-option" type="button" data-gps-units>Cambiar unidades</button><button class="option sheet-option" type="button" data-gps-coords>Formato de coordenadas</button>':''}${isBat?'<button class="option sheet-option" type="button" data-battery-manage-open>Administrar Banco de Baterías</button>':''}<button class="option sheet-option danger" type="button" data-module-delete>Eliminar</button></div>`;bindSheetHandle(moduleMenu)}
function openModuleMenu(id){moduleMenuId=id;renderModuleMenu(id);openSheet(moduleMenu)}
function renderUnitsMenu(){const gps=modules.gps,current=gps.getUnits();unitsMenu.innerHTML=`<div class="sheet-inner fullscreen-inner">${fullHeader('Unidades GPS','data-units-back')}${gps.getUnitOptions().map(o=>`<button class="add-module-row" type="button" data-unit="${o.id}"><span>${o.label}</span><span class="add-module-state ${o.id===current?'present':''}">${o.id===current?'✓':''}</span></button>`).join('')}</div>`}
function openUnitsMenu(){closeSheet(moduleMenu);renderUnitsMenu();openSheet(unitsMenu)}
function renderCoordMenu(){const gps=modules.gps,current=gps.getCoordFormat();coordMenu.innerHTML=`<div class="sheet-inner fullscreen-inner">${fullHeader('Formato de coordenadas','data-coord-back')}${gps.getCoordFormatOptions().map(o=>`<button class="add-module-row" type="button" data-coord-format="${o.id}"><span>${o.label}</span><span class="add-module-state ${o.id===current?'present':''}">${o.id===current?'✓':''}</span></button>`).join('')}</div>`}
function openCoordMenu(){closeSheet(moduleMenu);renderCoordMenu();openSheet(coordMenu)}
function deleteModule(id){if(!id)return;ui.order=ui.order.filter(x=>x!==id);delete ui.collapsed[id];saveOrder();closeSheet(moduleMenu);moduleMenuId=null;renderAll()}
function renderAddSheet(){const inner=add.querySelector('.sheet-inner');if(!inner)return;inner.innerHTML='<div class="handle"></div><h3>Agregar módulo</h3>'+ALL_MODULE_IDS.map(id=>{const present=ui.order.includes(id);return `<button class="add-module-row" type="button" data-add-module="${id}" ${present?'disabled':''}><span>${modules[id].name}</span><span class="add-module-state ${present?'present':''}">${present?'✓':'+'}</span></button>`}).join('');bindSheetHandle(add)}
function renderBatteryManager(){const b=modules.batteries.state,s=modules.batteries.stats();batteryManager.innerHTML=`<div class="sheet-inner fullscreen-inner">${fullHeader('Banco de baterías','data-battery-manager-back')}<div class="full-section"><label class="full-label">Nombre del banco</label><input class="full-input" data-bank-name value="${String(b.bankName||'').replace(/"/g,'&quot;')}"><div class="full-label">Capacidad del banco</div><div class="full-readonly"><strong>${Math.round(s.cap)} Ah</strong><small>Calculada automáticamente según las baterías vinculadas</small></div></div><div class="full-section"><div class="full-section-title">Baterías vinculadas</div>${b.batteries.length?b.batteries.map(x=>`<div class="battery-manage-row"><div><strong>${x.name||x.deviceName||'Batería'}</strong><small>${Number(x.capacityAh)||0} Ah${x.address||x.id?` · ${x.address||x.id}`:''}</small></div><button class="mini-danger" type="button" data-remove-battery="${x.id}">Eliminar</button></div>`).join(''):'<div class="subtle">No hay baterías vinculadas.</div>'}<button class="primary-full-button" type="button" data-open-scanner>Vincular batería</button></div></div>`}
function renderBluetoothScanner(status='Escaneando dispositivos Bluetooth…'){bluetoothScanner.innerHTML=`<div class="sheet-inner fullscreen-inner">${fullHeader('Bluetooth','data-scanner-back')}<div class="scanner-status">${status}</div><div class="scanner-list">${scanDevices.length?scanDevices.map((d,i)=>`<button class="scanner-device" type="button" data-scan-device="${i}"><span><strong>${d.name||d.deviceName||'Dispositivo Bluetooth'}</strong><small>${d.address||d.id||d.mac||''}</small></span><span class="add-module-state">+</span></button>`).join(''):'<div class="scanner-empty">Los dispositivos aparecerán acá cuando el Core los detecte.</div>'}</div></div>`}
function requestBluetoothScan(){scanDevices=[];renderBluetoothScanner();openSheet(bluetoothScanner);let called=false;try{if(window.BoatStationCore?.openBluetoothScanner){window.BoatStationCore.openBluetoothScanner();called=true}else if(window.NativeBridge?.startBatteryScan){window.NativeBridge.startBatteryScan();called=true}}catch{}if(!called)renderBluetoothScanner('Esperando acceso Bluetooth del Core…')}

renderAll();
document.getElementById('menuBtn').onclick=()=>openSheet(menu);document.getElementById('addBtn').onclick=()=>{renderAddSheet();openSheet(add)};
[menu,add,moduleMenu].forEach(sheet=>sheet.addEventListener('click',e=>{if(e.target===sheet)closeSheet(sheet)}));
moduleMenu.addEventListener('click',e=>{if(e.target.closest('[data-module-delete]')){e.preventDefault();deleteModule(moduleMenuId)}else if(e.target.closest('[data-gps-units]')){e.preventDefault();openUnitsMenu()}else if(e.target.closest('[data-gps-coords]')){e.preventDefault();openCoordMenu()}else if(e.target.closest('[data-battery-manage-open]')){e.preventDefault();closeSheet(moduleMenu);openBatteryManager()}});
unitsMenu.addEventListener('click',e=>{if(e.target.closest('[data-units-back]')){closeSheet(unitsMenu);openModuleMenu('gps');return}const btn=e.target.closest('[data-unit]');if(btn){modules.gps.setUnits(btn.dataset.unit);renderUnitsMenu()}});
coordMenu.addEventListener('click',e=>{if(e.target.closest('[data-coord-back]')){closeSheet(coordMenu);openModuleMenu('gps');return}const btn=e.target.closest('[data-coord-format]');if(btn){modules.gps.setCoordFormat(btn.dataset.coordFormat);renderCoordMenu()}});
add.addEventListener('click',e=>{const btn=e.target.closest('[data-add-module]');if(!btn||btn.disabled)return;const id=btn.dataset.addModule;if(!ui.order.includes(id)){ui.order.push(id);saveOrder();renderAll();renderAddSheet()}});
batteryManager.addEventListener('click',e=>{if(e.target.closest('[data-battery-manager-back]')){closeSheet(batteryManager);return}if(e.target.closest('[data-open-scanner]')){closeSheet(batteryManager);requestBluetoothScan();return}const rm=e.target.closest('[data-remove-battery]');if(rm){modules.batteries.removeBattery(rm.dataset.removeBattery);renderBatteryManager()}});
batteryManager.addEventListener('change',e=>{if(e.target.matches('[data-bank-name]'))modules.batteries.renameBank(e.target.value)});
bluetoothScanner.addEventListener('click',e=>{if(e.target.closest('[data-scanner-back]')){closeSheet(bluetoothScanner);openBatteryManager();return}const btn=e.target.closest('[data-scan-device]');if(btn){const device=scanDevices[Number(btn.dataset.scanDevice)];if(device){modules.batteries.addBattery(device);closeSheet(bluetoothScanner);openBatteryManager()}}});
[menu,add,moduleMenu].forEach(bindSheetHandle);

document.addEventListener('pointermove',e=>{if(!sheetDrag||e.pointerId!==sheetDrag.pointerId)return;e.preventDefault();sheetDrag.inner.style.transform=`translateY(${Math.max(0,e.clientY-sheetDrag.startY)}px)`},{passive:false});
document.addEventListener('pointerup',e=>{if(!sheetDrag||e.pointerId!==sheetDrag.pointerId)return;const drag=sheetDrag,dy=Math.max(0,e.clientY-drag.startY);sheetDrag=null;drag.inner.style.transition='transform .16s ease';if(dy>=72){drag.inner.style.transform='translateY(110%)';setTimeout(()=>closeSheet(drag.sheet),160)}else{drag.inner.style.transform='translateY(0)';setTimeout(()=>{drag.inner.style.transition='';drag.inner.style.transform=''},160)}});
document.addEventListener('pointercancel',()=>{if(!sheetDrag)return;const drag=sheetDrag;sheetDrag=null;drag.inner.style.transition='transform .16s ease';drag.inner.style.transform='translateY(0)';setTimeout(()=>{drag.inner.style.transition='';drag.inner.style.transform=''},160)});

function finishReorder(){if(!reorder)return;reorder.card.classList.remove('reordering');ui.order=[...cards.querySelectorAll('.card')].map(card=>card.dataset.id);saveOrder();reorder=null}
cards.addEventListener('pointerdown',e=>{if(document.body.classList.contains('menu-open')||e.target.closest('.resize-handle'))return;const card=e.target.closest('.card');if(!card)return;const drag=e.target.closest('.drag-handle');if(drag){e.preventDefault();reorder={card,pointerId:e.pointerId};card.classList.add('reordering');try{drag.setPointerCapture(e.pointerId)}catch{};return}if(e.target.closest('button,input'))return;if(!e.target.closest('.card-head'))return;tapCandidate={id:card.dataset.id,card,x:e.clientX,y:e.clientY,t:Date.now()}},false);
cards.addEventListener('pointermove',e=>{if(reorder){e.preventDefault();const moving=reorder.card,others=[...cards.querySelectorAll('.card')].filter(card=>card!==moving);let before=null;for(const card of others){const r=card.getBoundingClientRect();if(e.clientY<r.top+r.height/2){before=card;break}}if(before)cards.insertBefore(moving,before);else cards.appendChild(moving);return}if(tapCandidate&&(Math.abs(e.clientX-tapCandidate.x)>10||Math.abs(e.clientY-tapCandidate.y)>10))tapCandidate=null});
cards.addEventListener('pointerup',e=>{if(reorder){finishReorder();return}if(!tapCandidate)return;const candidate=tapCandidate;tapCandidate=null;if(Math.abs(e.clientX-candidate.x)<8&&Math.abs(e.clientY-candidate.y)<8&&Date.now()-candidate.t<350){ui.collapsed[candidate.id]=!ui.collapsed[candidate.id];candidate.card.classList.toggle('collapsed',ui.collapsed[candidate.id]);if(!ui.collapsed[candidate.id])layout.mountCard(candidate.card)}});
cards.addEventListener('pointercancel',()=>{tapCandidate=null;finishReorder()});
cards.addEventListener('click',e=>{const more=e.target.closest('.more');if(more){e.stopPropagation();openModuleMenu(more.closest('.card').dataset.id)}});

const deck=document.createElement('div');deck.className='module-deck';cards.parentNode.insertBefore(deck,cards);deck.appendChild(cards);const refreshTab=document.createElement('div');refreshTab.className='hidden-refresh-module';refreshTab.textContent='Actualizar';deck.insertBefore(refreshTab,cards);
const REFRESH_DISTANCE=72,REFRESH_REVEAL=50,DIRECTION_LOCK=12;
function touchById(list,id){for(const touch of list)if(touch.identifier===id)return touch;return null}
function atTop(){const root=document.scrollingElement||document.documentElement;return root.scrollTop<=1}
function canStartRefresh(target){if(document.body.classList.contains('menu-open')||!atTop())return false;return !target.closest('.sheet,.drag-handle,.resize-handle,button,input,textarea,select,a')}
function revealRefresh(distance){const progress=Math.min(1,distance/REFRESH_DISTANCE),armed=distance>=REFRESH_DISTANCE;deck.style.setProperty('--deck-pull',`${progress*REFRESH_REVEAL}px`);refreshTab.classList.toggle('armed',armed);deck.classList.add('pulling');return armed}
function hideRefresh(){deck.classList.remove('pulling','refreshing');deck.style.removeProperty('--deck-pull');refreshTab.classList.remove('armed');refreshTab.textContent='Actualizar'}
function beginRefreshGesture(touch,target){if(canStartRefresh(target))refreshGesture={id:touch.identifier,startX:touch.clientX,startY:touch.clientY,armed:false,mode:'pending'}}
function moveRefreshGesture(touch,event){if(!refreshGesture||touch.identifier!==refreshGesture.id)return;const dx=touch.clientX-refreshGesture.startX,dy=touch.clientY-refreshGesture.startY;if(refreshGesture.mode==='pending'){if(Math.abs(dx)<DIRECTION_LOCK&&Math.abs(dy)<DIRECTION_LOCK)return;if(Math.abs(dx)>=Math.abs(dy)*1.15||dy<=0){refreshGesture.mode='cancelled';return}refreshGesture.mode='refresh'}if(refreshGesture.mode!=='refresh')return;if(!atTop()){refreshGesture=null;hideRefresh();return}refreshGesture.armed=revealRefresh(Math.max(0,dy));event.preventDefault()}
function endRefreshGesture(touch){if(!refreshGesture||touch.identifier!==refreshGesture.id)return;const armed=refreshGesture.mode==='refresh'&&refreshGesture.armed;refreshGesture=null;if(!armed){hideRefresh();return}deck.classList.add('refreshing');deck.style.setProperty('--deck-pull',`${REFRESH_REVEAL}px`);refreshTab.textContent='Actualizando…';setTimeout(()=>{const url=new URL(window.location.href);url.searchParams.set('_refresh',Date.now().toString());window.location.replace(url.toString())},120)}
document.addEventListener('touchstart',e=>{if(e.touches.length===1)beginRefreshGesture(e.touches[0],e.target)},{capture:true,passive:true});
document.addEventListener('touchmove',e=>{if(!refreshGesture)return;const touch=touchById(e.touches,refreshGesture.id);if(touch)moveRefreshGesture(touch,e)},{capture:true,passive:false});
document.addEventListener('touchend',e=>{if(!refreshGesture)return;const touch=touchById(e.changedTouches,refreshGesture.id);if(touch)endRefreshGesture(touch)},{capture:true,passive:true});
document.addEventListener('touchcancel',()=>{refreshGesture=null;hideRefresh()},{capture:true,passive:true});

window.BoatStation={
  updateGPS:data=>modules.gps.update(data),
  updatePhone:data=>modules.phone.update(data),
  updateCompass:value=>modules.compass.update(value),
  updateMotion:value=>modules.seastate.update(value),
  updateBattery:data=>modules.batteries.updateBattery(data),
  bluetoothDevices:list=>{scanDevices=Array.isArray(list)?list:[];if(bluetoothScanner.classList.contains('open'))renderBluetoothScanner(scanDevices.length?`${scanDevices.length} dispositivo${scanDevices.length===1?'':'s'} encontrado${scanDevices.length===1?'':'s'}`:'Escaneando dispositivos Bluetooth…')}
};
