const DEFAULT_MIN_CONTENT_HEIGHT=72;
const PAGER_HEIGHT=28;
const FIT_EPSILON=1;
const LAYOUT_SCHEMA=2;
const DEFAULT_HEIGHT_FACTOR=1.2;
const PAGE_TRANSITION_MS=220;
const MIN_SCAN_STEP=4;

function readJson(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback}catch{return fallback}}
function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function isLocalRuntime(){const params=new URLSearchParams(location.search);return params.get('mode')==='station'||!!window.CoreBridge||!!window.BoatStationCore||!!window.NativeBridge}
function storageBase(){if(isLocalRuntime())return 'bs.pageLayout.local';const station=localStorage.getItem('bs.remote.activeStation')||'default';return `bs.pageLayout.remote.${station}`}
function storageKey(){return `${storageBase()}.v${LAYOUT_SCHEMA}`}
function legacyStorageKey(){return `${storageBase()}.v1`}
function initialState(){const current=readJson(storageKey(),null);if(current&&typeof current==='object')return{pages:current.pages||{},contentHeights:current.contentHeights||{}};const legacy=readJson(legacyStorageKey(),null);return{pages:legacy?.pages&&typeof legacy.pages==='object'?legacy.pages:{},contentHeights:{}}}

export function createPageLayoutEngine(cards){
  let key=storageKey(),state=initialState(),resize=null,validationQueued=false;
  const validationCards=new Set();

  function ensureScope(){const next=storageKey();if(next===key)return;key=next;state=initialState()}
  function persist(){ensureScope();writeJson(key,state)}
  function pageCount(card){return card?.querySelectorAll('.page').length||0}
  function getPage(id,count){ensureScope();const raw=Number(state.pages?.[id])||0;return Math.max(0,Math.min(Math.max(0,count-1),raw))}
  function currentPage(card){const id=card?.dataset?.id;return id?getPage(id,pageCount(card)):0}
  function pageElement(card,page=currentPage(card)){return card?.querySelector(`.page[data-page="${page}"]`)||null}
  function contentElement(card,page=currentPage(card)){return pageElement(card,page)?.querySelector(':scope > .page-content')||null}
  function savedContentHeight(id,page){ensureScope();const value=state.contentHeights?.[id]?.[page];return Number.isFinite(Number(value))?Number(value):null}
  function saveContentHeight(id,page,height){if(!id||!Number.isFinite(height))return;ensureScope();state.contentHeights[id]||(state.contentHeights[id]={});state.contentHeights[id][page]=Math.round(height);persist()}

  function isLeafTextElement(el){if(!(el instanceof HTMLElement))return false;if(el.children.length)return false;return !!String(el.textContent||'').trim()}
  function isOutOfFlow(style){return style.position==='absolute'||style.position==='fixed'}
  function hasVerticalClip(el){if(!(el instanceof HTMLElement)||el===document.body)return false;const style=getComputedStyle(el);if(style.display==='none'||style.visibility==='hidden'||isOutOfFlow(style))return false;if(el.tagName==='CANVAS'||el.tagName==='SVG'||isLeafTextElement(el))return false;const overflowY=style.overflowY;if(!['hidden','clip','auto','scroll'].includes(overflowY))return false;return el.scrollHeight>el.clientHeight+FIT_EPSILON}
  function contentFitsCurrent(content){const root=content.getBoundingClientRect(),topLimit=root.top-FIT_EPSILON,bottomLimit=root.bottom+FIT_EPSILON;if(content.scrollHeight>content.clientHeight+FIT_EPSILON)return false;for(const el of content.querySelectorAll('*')){const style=getComputedStyle(el);if(style.display==='none'||style.visibility==='hidden'||isOutOfFlow(style))continue;const rect=el.getBoundingClientRect();if(rect.width<=0&&rect.height<=0)continue;if(rect.top<topLimit||rect.bottom>bottomLimit)return false;if(hasVerticalClip(el))return false}return true}
  function minimumContentHeight(content){
    if(!content)return DEFAULT_MIN_CONTENT_HEIGHT;
    const pageEl=content.closest('.page');if(!pageEl)return DEFAULT_MIN_CONTENT_HEIGHT;
    const previousVar=pageEl.style.getPropertyValue('--page-content-height'),previousContentHeight=content.style.height,previousOverflow=content.style.overflow;
    content.style.removeProperty('height');content.style.overflow='hidden';
    const ceiling=Math.max(1200,window.innerHeight*1.75);
    let firstFit=null,lastFail=DEFAULT_MIN_CONTENT_HEIGHT-1;
    const test=h=>{pageEl.style.setProperty('--page-content-height',`${Math.round(h)}px`);pageEl.getBoundingClientRect();return contentFitsCurrent(content)};
    for(let h=DEFAULT_MIN_CONTENT_HEIGHT;h<=ceiling;h+=MIN_SCAN_STEP){if(test(h)){firstFit=h;break}lastFail=h}
    if(firstFit===null)firstFit=ceiling;
    let minimum=firstFit;
    for(let h=Math.max(DEFAULT_MIN_CONTENT_HEIGHT,lastFail+1);h<firstFit;h++){if(test(h)){minimum=h;break}}
    if(previousVar)pageEl.style.setProperty('--page-content-height',previousVar);else pageEl.style.removeProperty('--page-content-height');
    content.style.height=previousContentHeight;content.style.overflow=previousOverflow;pageEl.getBoundingClientRect();
    return Math.max(DEFAULT_MIN_CONTENT_HEIGHT,Math.ceil(minimum));
  }
  function defaultContentHeight(content){return Math.ceil(minimumContentHeight(content)*DEFAULT_HEIGHT_FACTOR)}

  function pageHeightValue(card,page){const pageEl=pageElement(card,page);if(!pageEl)return null;const value=parseFloat(pageEl.style.getPropertyValue('--page-content-height'));return Number.isFinite(value)?value:null}
  function syncViewportHeight(card,page=currentPage(card),animate=false){const pageEl=pageElement(card,page),viewport=card?.querySelector('.viewport');if(!pageEl||!viewport)return;const height=Math.ceil(pageEl.getBoundingClientRect().height);if(!height)return;viewport.style.transition=animate?`height ${PAGE_TRANSITION_MS}ms ease`:'none';viewport.style.height=`${height}px`;if(animate)setTimeout(()=>{if(viewport.isConnected)viewport.style.transition='none'},PAGE_TRANSITION_MS+30)}

  function applyContentHeight(card,page=currentPage(card),height=null,{syncViewport=false,animateViewport=false}={}){
    const pageEl=pageElement(card,page),content=contentElement(card,page);if(!pageEl||!content)return null;
    const id=card.dataset.id;let target=height;if(!Number.isFinite(target))target=savedContentHeight(id,page);if(!Number.isFinite(target))target=defaultContentHeight(content);const minimum=minimumContentHeight(content);target=Math.max(minimum,Math.round(target));
    pageEl.style.setProperty('--page-content-height',`${target}px`);if(savedContentHeight(id,page)!==target)saveContentHeight(id,page,target);if(syncViewport)syncViewportHeight(card,page,animateViewport);return target;
  }

  function initializePageHeights(card){if(!card)return;card.style.removeProperty('--page-content-height');for(const pageEl of card.querySelectorAll('.page[data-page]')){const page=Number(pageEl.dataset.page);if(Number.isFinite(page))applyContentHeight(card,page)}}
  function resetModule(card){if(!card?.dataset?.id)return false;const id=card.dataset.id,pages=[...card.querySelectorAll('.page[data-page]')];ensureScope();state.contentHeights[id]={};for(const pageEl of pages){const page=Number(pageEl.dataset.page),content=pageEl.querySelector(':scope > .page-content');if(!Number.isFinite(page)||!content)continue;pageEl.style.removeProperty('--page-content-height');const height=defaultContentHeight(content);state.contentHeights[id][page]=height;pageEl.style.setProperty('--page-content-height',`${height}px`)}persist();syncViewportHeight(card,currentPage(card),false);window.dispatchEvent(new CustomEvent('boatstation-module-size-reset',{detail:{id,card}}));return true}

  function updatePager(card,page=currentPage(card)){card?.querySelectorAll('.pager').forEach(pager=>pager.querySelectorAll('span').forEach((dot,i)=>dot.classList.toggle('on',i===page)))}
  function validateCard(card){if(!card||!card.isConnected||card.classList.contains('collapsed')||(resize&&resize.card===card))return;const page=currentPage(card),content=contentElement(card,page);if(!content)return;const wanted=pageHeightValue(card,page)??savedContentHeight(card.dataset.id,page);applyContentHeight(card,page,wanted,{syncViewport:true})}
  function queueValidation(card=null){if(card)validationCards.add(card);else cards?.querySelectorAll('.card').forEach(c=>validationCards.add(c));if(validationQueued)return;validationQueued=true;requestAnimationFrame(()=>{validationQueued=false;const list=[...validationCards];validationCards.clear();list.forEach(validateCard)})}
  function mountCard(card){if(!card)return;initializePageHeights(card);const page=currentPage(card),track=card.querySelector('.track');if(track){track.style.transition='none';track.style.transform=`translate3d(-${page*100}%,0,0)`;track.getBoundingClientRect();track.style.transition=''}updatePager(card,page);syncViewportHeight(card,page,false)}
  function mountAll(){cards?.querySelectorAll('.card').forEach(mountCard)}
  function setPage(card,page,{animate=true}={}){if(!card)return 0;const id=card.dataset.id,count=pageCount(card);if(!id||!count)return 0;page=Math.max(0,Math.min(count-1,Number(page)||0));ensureScope();state.pages[id]=page;persist();applyContentHeight(card,page,savedContentHeight(id,page));const track=card.querySelector('.track');if(track){track.style.transition=animate?'':'none';track.style.transform=`translate3d(-${page*100}%,0,0)`;if(!animate){track.getBoundingClientRect();track.style.transition=''}}updatePager(card,page);syncViewportHeight(card,page,animate);window.dispatchEvent(new CustomEvent('boatstation-page-change',{detail:{id,page,card}}));return page}
  function refreshPage(card,page=currentPage(card)){if(!card)return;updatePager(card,page);const live=pageHeightValue(card,page);applyContentHeight(card,page,live??savedContentHeight(card.dataset.id,page),{syncViewport:page===currentPage(card)})}
  function maxContentHeight(){return Math.max(1200,window.innerHeight*1.75)}

  function normalizeResize(current){
    const content=contentElement(current.card,current.page),pageEl=pageElement(current.card,current.page);if(!content||!pageEl)return pageHeightValue(current.card,current.page);
    const requested=Math.max(DEFAULT_MIN_CONTENT_HEIGHT,Math.round(pageHeightValue(current.card,current.page)||current.startH));
    const minimum=minimumContentHeight(content),height=Math.max(requested,minimum);
    pageEl.style.setProperty('--page-content-height',`${height}px`);syncViewportHeight(current.card,current.page,false);return height;
  }
  function finishResize(event){if(!resize||event.pointerId!==resize.pointerId)return false;const current=resize;resize=null;const height=normalizeResize(current);current.card.classList.remove('resizing');if(Number.isFinite(height))saveContentHeight(current.id,current.page,height);queueValidation(current.card);window.dispatchEvent(new CustomEvent('boatstation-page-resize-end',{detail:{id:current.id,page:current.page,height,card:current.card}}));return true}

  cards?.addEventListener('pointerdown',event=>{const handle=event.target.closest('.resize-handle');if(!handle||event.isPrimary===false||(event.pointerType==='mouse'&&event.button!==0))return;const card=handle.closest('.card');if(!card||card.classList.contains('collapsed'))return;const page=currentPage(card),content=contentElement(card,page);if(!content)return;event.preventDefault();event.stopImmediatePropagation();card.classList.add('resizing');const startH=pageHeightValue(card,page)??savedContentHeight(card.dataset.id,page)??defaultContentHeight(content);resize={pointerId:event.pointerId,card,id:card.dataset.id,page,startY:event.clientY,startH};window.dispatchEvent(new CustomEvent('boatstation-page-resize-start',{detail:{id:resize.id,page,card}}));try{handle.setPointerCapture(event.pointerId)}catch{}},{capture:true});
  cards?.addEventListener('pointermove',event=>{if(!resize||event.pointerId!==resize.pointerId)return;event.preventDefault();event.stopImmediatePropagation();const next=Math.max(DEFAULT_MIN_CONTENT_HEIGHT,Math.min(maxContentHeight(),resize.startH+(event.clientY-resize.startY))),pageEl=pageElement(resize.card,resize.page);if(pageEl){pageEl.style.setProperty('--page-content-height',`${Math.round(next)}px`);syncViewportHeight(resize.card,resize.page,false)}},{capture:true,passive:false});
  cards?.addEventListener('pointerup',event=>{if(finishResize(event)){event.preventDefault();event.stopImmediatePropagation()}},{capture:true});
  cards?.addEventListener('pointercancel',event=>{if(finishResize(event))event.stopImmediatePropagation()},{capture:true});

  const mutationObserver=new MutationObserver(records=>{for(const record of records){const card=(record.target instanceof Element?record.target:record.target.parentElement)?.closest?.('.card');if(card)validationCards.add(card)}if(validationCards.size)queueValidation()});if(cards)mutationObserver.observe(cards,{subtree:true,childList:true});
  window.addEventListener('resize',()=>queueValidation());document.fonts?.ready?.then(()=>queueValidation()).catch?.(()=>{});

  const api={mountCard,mountAll,currentPage,getPage,setPage,refreshPage,contentElement,savedContentHeight,saveContentHeight,defaultContentHeight,minimumContentHeight,resetModule,validateCard,validateAll:()=>queueValidation(),isResizing:()=>!!resize,pagerHeight:PAGER_HEIGHT};window.BoatStationPageLayout=api;return api;
}
