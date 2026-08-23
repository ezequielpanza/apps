(function(){
  const cards=document.getElementById('cards');
  if(!cards)return;

  const THRESHOLD=38;
  const LOCK=10;
  let swipe=null;

  function adapter(){return window.BoatStationPageAdapter||null}
  function pageCount(card){return card?.querySelectorAll('.page').length||0}
  function currentPage(card){
    const a=adapter();
    const external=a?.getPage?.(card);
    if(Number.isFinite(Number(external)))return Math.max(0,Math.min(pageCount(card)-1,Number(external)));
    const dots=[...card.querySelectorAll('.pager span')];
    const active=dots.findIndex(x=>x.classList.contains('on'));
    return Math.max(0,active>=0?active:0);
  }
  function renderPage(card,page,animate=true){
    const count=pageCount(card);if(!count)return;
    page=Math.max(0,Math.min(count-1,page));
    const track=card.querySelector('.track');
    if(track){track.style.transition=animate?'':'none';track.style.transform=`translateX(-${page*100}%)`;if(!animate){track.getBoundingClientRect();track.style.transition=''}}
    card.querySelectorAll('.pager').forEach(p=>p.querySelectorAll('span').forEach((dot,i)=>dot.classList.toggle('on',i===page)));
  }
  function commit(card,page){
    const a=adapter();
    if(a?.setPage){a.setPage(card,page);return true}
    // Core keeps its existing page-state commit on touchend. The shared engine owns
    // only gesture physics here, so we render the snap immediately and let that
    // existing state path persist the exact same target a moment later.
    renderPage(card,page,true);
    return false;
  }
  function blocked(target){return !!target.closest('.card-head,.drag-handle,.resize-handle,button,input,textarea,select,a,.sheet,.station-manager')}
  function primary(e){return e.isPrimary!==false&&(e.pointerType!=='mouse'||e.button===0)}

  cards.addEventListener('pointerdown',e=>{
    if(!primary(e)||document.body.classList.contains('menu-open')||blocked(e.target))return;
    const card=e.target.closest('.card');if(!card||pageCount(card)<2)return;
    const page=currentPage(card);
    swipe={pointerId:e.pointerId,pointerType:e.pointerType,card,page,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastT:performance.now(),vx:0,mode:'pending'};
    adapter()?.begin?.(card,page);
  },{capture:true});

  cards.addEventListener('pointermove',e=>{
    if(!swipe||e.pointerId!==swipe.pointerId)return;
    const dx=e.clientX-swipe.startX,dy=e.clientY-swipe.startY;
    if(swipe.mode==='pending'){
      if(Math.abs(dx)<LOCK&&Math.abs(dy)<LOCK)return;
      if(Math.abs(dx)<=Math.abs(dy)*1.15){adapter()?.cancel?.(swipe.card,swipe.page);swipe=null;return}
      swipe.mode='horizontal';
      try{swipe.card.setPointerCapture(e.pointerId)}catch{}
    }
    if(swipe.mode!=='horizontal')return;
    e.preventDefault();e.stopPropagation();
    const now=performance.now(),dt=Math.max(1,now-swipe.lastT);swipe.vx=(e.clientX-swipe.lastX)/dt;swipe.lastX=e.clientX;swipe.lastT=now;
    const track=swipe.card.querySelector('.track');if(!track)return;
    const width=Math.max(1,swipe.card.querySelector('.viewport')?.clientWidth||swipe.card.clientWidth);
    let pct=(-swipe.page*100)+(dx/width*100);
    const min=-(pageCount(swipe.card)-1)*100;
    if(pct>0)pct=Math.min(18,pct*.32);
    if(pct<min)pct=Math.max(min-18,min+(pct-min)*.32);
    track.style.transition='none';track.style.transform=`translateX(${pct}%)`;
  },{capture:true,passive:false});

  function finish(e,cancel=false){
    if(!swipe||e.pointerId!==swipe.pointerId)return;
    const g=swipe;swipe=null;
    const dx=e.clientX-g.startX,dy=e.clientY-g.startY;
    let target=g.page;
    if(!cancel&&g.mode==='horizontal'){
      const decisive=Math.abs(dx)>=THRESHOLD&&Math.abs(dx)>Math.abs(dy)*1.1;
      const flick=Math.abs(g.vx)>.45&&Math.abs(dx)>18;
      if(decisive||flick)target=g.page+(dx<0?1:-1);
    }
    target=Math.max(0,Math.min(pageCount(g.card)-1,target));
    commit(g.card,target);
    adapter()?.end?.(g.card,target);
  }
  cards.addEventListener('pointerup',e=>finish(e,false),{capture:true});
  cards.addEventListener('pointercancel',e=>finish(e,true),{capture:true});

  window.BoatStationPageInteractions={renderPage,currentPage};
})();
