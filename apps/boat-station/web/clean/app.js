import {createGpsModule} from './modules/gps.js';

const cards=document.getElementById('cards');
const modules={};
const savedHeights=(()=>{try{return JSON.parse(localStorage.getItem('bs.clean.heights')||'{}')}catch(_){return {}}})();
const ui={order:['gps','phone','seastate','compass'],collapsed:{},page:{},heights:savedHeights};

function requestRender(id){renderModule(id)}
modules.gps=createGpsModule(requestRender);
modules.phone={id:'phone',name:'Estado del teléfono',pages:2,summary:()=> 'Pendiente',page:i=>`<div class="placeholder">Estado del teléfono · página ${i+1}</div>`};
modules.seastate={id:'seastate',name:'Sea State',pages:2,summary:()=> 'Pendiente',page:i=>`<div class="placeholder">Sea State · página ${i+1}</div>`};
modules.compass={id:'compass',name:'Brújula',pages:2,summary:()=> 'Pendiente',page:i=>`<div class="placeholder">Brújula · página ${i+1}</div>`};

function pager(count,current){let h='<div class="pager">';for(let i=0;i<count;i++)h+=`<span class="${i===current?'on':''}">●</span>`;return h+'</div>'}
function dragHandle(){return `<button class="drag-handle" type="button" aria-label="Mover módulo"><i></i><i></i><i></i><i></i><i></i><i></i></button>`}
function resizeHandle(){return `<button class="resize-handle" type="button" aria-label="Cambiar tamaño del módulo"><i></i><i></i><i></i></button>`}
function moduleHtml(id){const m=modules[id],p=Math.min(ui.page[id]||0,m.pages-1);let pages='';for(let i=0;i<m.pages;i++)pages+=`<div class="page" data-page="${i}">${m.page(i)}${pager(m.pages,p)}</div>`;return `<section class="card${ui.collapsed[id]?' collapsed':''}" data-id="${id}"><header class="card-head">${dragHandle()}<span class="dot"></span><span class="title">${m.name}</span><span class="summary">${m.summary()}</span><button class="more" type="button">⋮</button></header><div class="card-body"><div class="viewport"><div class="track" style="transform:translateX(-${p*100}%)">${pages}</div></div></div>${resizeHandle()}</section>`}

function saveHeights(){localStorage.setItem('bs.clean.heights',JSON.stringify(ui.heights))}
function pageHeight(id,page){const stored=ui.heights[id];if(stored&&typeof stored==='object'&&Number.isFinite(Number(stored[page])))return Number(stored[page]);if(Number.isFinite(Number(stored))&&page===0)return Number(stored);return null}
function setPageHeight(id,page,height){const current=(ui.heights[id]&&typeof ui.heights[id]==='object')?ui.heights[id]:{};ui.heights[id]={...current,[page]:Math.round(height)}}
function measure(card){if(!card||card.classList.contains('collapsed'))return;const id=card.dataset.id,body=card.querySelector('.card-body');if(!body)return;const m=modules[id],p=Math.min(ui.page[id]||0,m.pages-1),fixed=pageHeight(id,p);if(fixed!==null){body.style.height=`${fixed}px`;return}const page=card.querySelector(`.page[data-page="${p}"]`);if(page)body.style.height=page.scrollHeight+'px'}
function hydrate(card){const m=modules[card.dataset.id];m.afterRender?.(card);requestAnimationFrame(()=>measure(card))}
function renderAll(){cards.innerHTML=ui.order.map(moduleHtml).join('');cards.querySelectorAll('.card').forEach(hydrate)}
function renderModule(id){const old=cards.querySelector(`.card[data-id="${id}"]`);if(!old)return;const holder=document.createElement('div');holder.innerHTML=moduleHtml(id);const fresh=holder.firstElementChild;old.replaceWith(fresh);hydrate(fresh)}
renderAll();

const menu=document.getElementById('menuSheet'),add=document.getElementById('addSheet');
let lockedScrollY=0;
function anySheetOpen(){return [...document.querySelectorAll('.sheet')].some(s=>s.classList.contains('open'))}
function lockModuleScroll(){if(document.body.classList.contains('menu-open'))return;lockedScrollY=window.scrollY||document.documentElement.scrollTop||0;document.body.classList.add('menu-open');document.body.style.top=`-${lockedScrollY}px`}
function unlockModuleScroll(){if(anySheetOpen())return;if(!document.body.classList.contains('menu-open'))return;document.body.classList.remove('menu-open');document.body.style.top='';window.scrollTo(0,lockedScrollY)}
function openSheet(sheet){sheet.classList.add('open');lockModuleScroll()}
function closeSheet(sheet){sheet.classList.remove('open');unlockModuleScroll()}
document.getElementById('menuBtn').onclick=()=>openSheet(menu);
document.getElementById('addBtn').onclick=()=>openSheet(add);
[menu,add].forEach(s=>s.addEventListener('click',e=>{if(e.target===s)closeSheet(s)}));

let swipe=null,reorder=null,resize=null;
function finishReorder(){if(!reorder)return;reorder.card.classList.remove('reordering');ui.order=[...cards.querySelectorAll('.card')].map(c=>c.dataset.id);reorder=null;cards.querySelectorAll('.card').forEach(measure)}
function finishResize(){if(!resize)return;resize.card.classList.remove('resizing');saveHeights();resize=null}
cards.addEventListener('pointerdown',e=>{if(document.body.classList.contains('menu-open'))return;const card=e.target.closest('.card');if(!card)return;const resizeGrip=e.target.closest('.resize-handle');if(resizeGrip){e.preventDefault();e.stopPropagation();const body=card.querySelector('.card-body'),id=card.dataset.id,page=Math.min(ui.page[id]||0,modules[id].pages-1);resize={card,body,id,page,startY:e.clientY,startH:body.getBoundingClientRect().height,pointerId:e.pointerId};card.classList.add('resizing');try{resizeGrip.setPointerCapture(e.pointerId)}catch(_){};return}const drag=e.target.closest('.drag-handle');if(drag){e.preventDefault();reorder={card,pointerId:e.pointerId};card.classList.add('reordering');try{drag.setPointerCapture(e.pointerId)}catch(_){};return}if(e.target.closest('button,input'))return;swipe={id:card.dataset.id,card,x:e.clientX,y:e.clientY,t:Date.now()}});
cards.addEventListener('pointermove',e=>{if(resize){e.preventDefault();const max=Math.max(120,window.innerHeight*.78),next=Math.max(70,Math.min(max,resize.startH+(e.clientY-resize.startY)));resize.body.style.height=`${next}px`;setPageHeight(resize.id,resize.page,next);return}if(!reorder)return;e.preventDefault();const moving=reorder.card,others=[...cards.querySelectorAll('.card')].filter(c=>c!==moving);let before=null;for(const c of others){const r=c.getBoundingClientRect();if(e.clientY<r.top+r.height/2){before=c;break}}if(before)cards.insertBefore(moving,before);else cards.appendChild(moving)});
cards.addEventListener('pointerup',e=>{if(resize){finishResize();return}if(reorder){finishReorder();return}if(!swipe)return;const g=swipe;swipe=null;const dx=e.clientX-g.x,dy=e.clientY-g.y,m=modules[g.id];if(Math.abs(dx)>42&&Math.abs(dx)>Math.abs(dy)*1.2&&m.pages>1){const cur=ui.page[g.id]||0;ui.page[g.id]=dx<0?Math.min(m.pages-1,cur+1):Math.max(0,cur-1);const track=g.card.querySelector('.track');track.style.transform=`translateX(-${ui.page[g.id]*100}%)`;setTimeout(()=>{measure(g.card);m.afterRender?.(g.card)},190);return}if(Math.abs(dx)<8&&Math.abs(dy)<8&&Date.now()-g.t<350){ui.collapsed[g.id]=!ui.collapsed[g.id];g.card.classList.toggle('collapsed',ui.collapsed[g.id]);if(!ui.collapsed[g.id])measure(g.card)}});
cards.addEventListener('pointercancel',()=>{swipe=null;finishResize();finishReorder()});
cards.addEventListener('click',e=>{const more=e.target.closest('.more');if(more){e.stopPropagation();const card=more.closest('.card');alert('Configurar '+modules[card.dataset.id].name)}});
window.addEventListener('resize',()=>cards.querySelectorAll('.card').forEach(c=>{measure(c);modules[c.dataset.id].afterRender?.(c)}));

// Hidden refresh module above the deck. It is outside normal layout and only
// appears after a deliberate vertical overscroll. Horizontal card swipes keep priority.
const deck=document.createElement('div');
deck.className='module-deck';
cards.parentNode.insertBefore(deck,cards);
deck.appendChild(cards);
const refreshTab=document.createElement('div');
refreshTab.className='hidden-refresh-module';
refreshTab.textContent='Actualizar';
deck.insertBefore(refreshTab,cards);
const REFRESH_DISTANCE=72;
const REFRESH_REVEAL=50;
const DIRECTION_LOCK=12;
let refreshGesture=null;
function atTop(){const root=document.scrollingElement||document.documentElement;return root.scrollTop<=1}
function canStartRefresh(target){if(document.body.classList.contains('menu-open')||!atTop())return false;if(target.closest('.sheet,.drag-handle,.resize-handle,button,input,textarea,select,a'))return false;return true}
function revealRefresh(distance){const progress=Math.min(1,distance/REFRESH_DISTANCE),armed=distance>=REFRESH_DISTANCE,reveal=progress*REFRESH_REVEAL;deck.style.setProperty('--deck-pull',`${reveal}px`);refreshTab.classList.toggle('armed',armed);deck.classList.add('pulling');return armed}
function hideRefresh(){deck.classList.remove('pulling','refreshing');deck.style.removeProperty('--deck-pull');refreshTab.classList.remove('armed');refreshTab.textContent='Actualizar'}
function beginRefreshGesture(touch,target){if(!canStartRefresh(target))return;refreshGesture={id:touch.identifier,startX:touch.clientX,startY:touch.clientY,armed:false,mode:'pending'}}
function moveRefreshGesture(touch,event){
  if(!refreshGesture||touch.identifier!==refreshGesture.id)return;
  const dx=touch.clientX-refreshGesture.startX,dy=touch.clientY-refreshGesture.startY;
  if(refreshGesture.mode==='pending'){
    if(Math.abs(dx)<DIRECTION_LOCK&&Math.abs(dy)<DIRECTION_LOCK)return;
    if(Math.abs(dx)>=Math.abs(dy)*1.15||dy<=0){refreshGesture.mode='cancelled';return;}
    refreshGesture.mode='refresh';
  }
  if(refreshGesture.mode!=='refresh')return;
  if(!atTop()){refreshGesture=null;hideRefresh();return;}
  const distance=Math.max(0,dy);
  refreshGesture.armed=revealRefresh(distance);
  event.preventDefault();
  swipe=null;
}
function endRefreshGesture(touch){if(!refreshGesture||touch.identifier!==refreshGesture.id)return;const armed=refreshGesture.mode==='refresh'&&refreshGesture.armed;refreshGesture=null;if(!armed){hideRefresh();return}deck.classList.add('refreshing');deck.style.setProperty('--deck-pull',`${REFRESH_REVEAL}px`);refreshTab.textContent='Actualizando…';setTimeout(()=>{const url=new URL(window.location.href);url.searchParams.set('_refresh',Date.now().toString());window.location.replace(url.toString())},120)}
function touchById(list,id){for(const t of list)if(t.identifier===id)return t;return null}
document.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;beginRefreshGesture(e.touches[0],e.target)},{capture:true,passive:true});
document.addEventListener('touchmove',e=>{if(!refreshGesture)return;const t=touchById(e.touches,refreshGesture.id);if(t)moveRefreshGesture(t,e)},{capture:true,passive:false});
document.addEventListener('touchend',e=>{if(!refreshGesture)return;const t=touchById(e.changedTouches,refreshGesture.id);if(t)endRefreshGesture(t)},{capture:true,passive:true});
document.addEventListener('touchcancel',()=>{refreshGesture=null;hideRefresh()},{capture:true,passive:true});

window.BoatStation={updateGPS:data=>modules.gps.update(data)};
