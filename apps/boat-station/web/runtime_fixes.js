(function(){
  const style=document.createElement('style');
  style.textContent=`
    /* GPS coordinates stay side-by-side on the primary GPS page. */
    .card[data-kind="gps"] .view:first-child{display:none!important}
    .card[data-kind="gps"] .view:nth-child(2){display:block!important}
    .card[data-kind="gps"] .pager{display:none!important}
    /* Avoid sticky header covering the first visible module while scrolling. */
    .card{scroll-margin-top:76px}
  `;
  document.head.appendChild(style);

  function fixGps(){
    const c=document.querySelector('.card[data-kind="gps"]');
    if(!c)return;
    const views=c.querySelectorAll('.view');
    if(views.length>1){
      views.forEach((v,i)=>v.classList.toggle('active',i===1));
      try{const id=c.getAttribute('data-id'); const saved=JSON.parse(localStorage.getItem('bs.views')||'{}'); saved[id]=1; localStorage.setItem('bs.views',JSON.stringify(saved));}catch(e){}
    }
  }
  function fixPhoneLabel(){
    const el=document.querySelector('[data-pcharge]');
    if(el && el.textContent.trim()==='Batería') el.textContent='Descargando';
  }
  fixGps();fixPhoneLabel();
  new MutationObserver(()=>{fixGps();fixPhoneLabel()}).observe(document.body,{childList:true,subtree:true,characterData:true});
})();
