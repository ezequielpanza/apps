const DEFAULT_MIN_CONTENT_HEIGHT=72;
const PAGER_HEIGHT=28;

function readJson(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback}catch{return fallback}}
function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function isLocalRuntime(){const params=new URLSearchParams(location.search);return params.get('mode')==='station'||!!window.CoreBridge||!!window.BoatStationCore||!!window.NativeBridge}
function storageKey(){if(isLocalRuntime())return 'bs.pageLayout.local.v1';const station=localStorage.getItem('bs.remote.activeStation')||'default';return `bs.pageLayout.remote.${station}.v1`}

export function createPageLayoutEngine(cards){
  let key=storageKey();
  let state=readJson(key,{pages:{},contentHeights:{}});
  let resize=null;

  function ensureScope(){const next=storageKey();if(next===key)return;key=next;state=readJson(key,{pages:{},contentHeights:{}})}
  function persist(){ensureScope();writeJson(key,state)}
  function pageCount(card){return card?.querySelectorAll('.page').length||0}
  function getPage(id,count){ensureScope();const raw=Number(state.pages?.[id])||0;return Math.max(0,Math.min(Math.max(0,count-1),raw))}
  function currentPage(card){const id=card?.dataset?.id;return id?getPage(id,pageCount(card)):0}
  function pageElement(card,page=currentPage(card)){return card?.querySelector(`.page[data-page="${page}"]`)||null}
  function contentElement(card,page=currentPage(card)){return pageElement(card,page)?.querySelector(':scope > .page-content')||null}
  function savedContentHeight(id,page){ensureScope();const value=state.contentHeights?.[id]?.[page];return Number.isFinite(Number(value))?Number(value):null}
  function saveContentHeight(id,page,height){if(!id||!Number.isFinite(height))return;ensureScope();state.contentHeights[id]||(state.contentHeights[id]={});state.contentHeights[id][page]=Math.round(height);persist()}

  function naturalContentHeight(content){
    if(!content)return DEFAULT_MIN_CONTENT_HEIGHT;
    const previous=content.style.height;
    content.style.height='auto';
    const height=Math.max(DEFAULT_MIN_CONTENT_HEIGHT,Math.ceil(content.scrollHeight));
    content.style.height=previous;
    return height;
  }

  function minimumContentHeight(content){
    if(!content)return DEFAULT_MIN_CONTENT_HEIGHT;
    const previousHeight=content.style.height,previousOverflow=content.style.overflow;
    content.style.height='1px';
    content.style.overflow='hidden';
    const minimum=Math.max(DEFAULT_MIN_CONTENT_HEIGHT,Math.ceil(content.scrollHeight));
    content.style.height=previousHeight;
    content.style.overflow=previousOverflow;
    return minimum;
  }

  function applyContentHeight(card,page=currentPage(card),height=null){
    const content=contentElement(card,page);if(!content)return null;
    const id=card.dataset.id;
    let target=height;
    if(!Number.isFinite(target))target=savedContentHeight(id,page);
    if(!Number.isFinite(target)){
      target=naturalContentHeight(content);
      saveContentHeight(id,page,target);
    }
    target=Math.max(minimumContentHeight(content),Math.round(target));
    card.style.setProperty('--page-content-height',`${target}px`);
    return target;
  }

  function updatePager(card,page=currentPage(card)){
    card?.querySelectorAll('.pager').forEach(pager=>pager.querySelectorAll('span').forEach((dot,i)=>dot.classList.toggle('on',i===page)));
  }

  function mountCard(card){
    if(!card)return;
    const page=currentPage(card),track=card.querySelector('.track');
    if(track){track.style.transition='none';track.style.transform=`translate3d(-${page*100}%,0,0)`;track.getBoundingClientRect();track.style.transition=''}
    updatePager(card,page);
    applyContentHeight(card,page);
  }
  function mountAll(){cards?.querySelectorAll('.card').forEach(mountCard)}

  function setPage(card,page,{animate=true}={}){
    if(!card)return 0;
    const id=card.dataset.id,count=pageCount(card);if(!id||!count)return 0;
    page=Math.max(0,Math.min(count-1,Number(page)||0));
    ensureScope();state.pages[id]=page;persist();
    const track=card.querySelector('.track');
    if(track){track.style.transition=animate?'':'none';track.style.transform=`translate3d(-${page*100}%,0,0)`;if(!animate){track.getBoundingClientRect();track.style.transition=''}}
    updatePager(card,page);
    applyContentHeight(card,page);
    return page;
  }

  function refreshPage(card,page=currentPage(card)){
    if(!card)return;
    updatePager(card,page);
    applyContentHeight(card,page,savedContentHeight(card.dataset.id,page));
  }

  function maxContentHeight(){return Math.max(900,window.innerHeight*1.5)}
  function finishResize(event){
    if(!resize||event.pointerId!==resize.pointerId)return false;
    const current=resize;resize=null;current.card.classList.remove('resizing');
    const height=parseFloat(current.card.style.getPropertyValue('--page-content-height'));
    if(Number.isFinite(height))saveContentHeight(current.id,current.page,height);
    window.dispatchEvent(new CustomEvent('boatstation-page-resize-end',{detail:{id:current.id,page:current.page,height}}));
    return true;
  }

  cards?.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('.resize-handle');if(!handle||event.isPrimary===false||(event.pointerType==='mouse'&&event.button!==0))return;
    const card=handle.closest('.card');if(!card||card.classList.contains('collapsed'))return;
    const page=currentPage(card),content=contentElement(card,page);if(!content)return;
    event.preventDefault();event.stopImmediatePropagation();
    const startH=applyContentHeight(card,page);
    resize={pointerId:event.pointerId,card,id:card.dataset.id,page,startY:event.clientY,startH,minH:minimumContentHeight(content)};
    card.classList.add('resizing');
    window.dispatchEvent(new CustomEvent('boatstation-page-resize-start',{detail:{id:resize.id,page}}));
    try{handle.setPointerCapture(event.pointerId)}catch{}
  },{capture:true});
  cards?.addEventListener('pointermove',event=>{
    if(!resize||event.pointerId!==resize.pointerId)return;
    event.preventDefault();event.stopImmediatePropagation();
    const next=Math.max(resize.minH,Math.min(maxContentHeight(),resize.startH+(event.clientY-resize.startY)));
    resize.card.style.setProperty('--page-content-height',`${Math.round(next)}px`);
  },{capture:true,passive:false});
  cards?.addEventListener('pointerup',event=>{if(finishResize(event)){event.preventDefault();event.stopImmediatePropagation()}},{capture:true});
  cards?.addEventListener('pointercancel',event=>{if(finishResize(event))event.stopImmediatePropagation()},{capture:true});

  window.addEventListener('resize',()=>requestAnimationFrame(mountAll));

  const api={mountCard,mountAll,currentPage,getPage,setPage,refreshPage,contentElement,savedContentHeight,saveContentHeight,isResizing:()=>!!resize,pagerHeight:PAGER_HEIGHT};
  window.BoatStationPageLayout=api;
  return api;
}
