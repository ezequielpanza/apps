(function(){
  const style=document.createElement('style');
  style.textContent=`
    /* Keep GPS layout compact without observing every live text update. */
    .card{scroll-margin-top:76px}
  `;
  document.head.appendChild(style);

  function fixGps(){
    const c=document.querySelector('.card[data-kind="gps"]');
    if(!c)return;
    const body=c.querySelector('.card-body');
    if(body && !c.classList.contains('collapsed')){
      const active=c.querySelector('.view.active');
      if(active){
        const min=Math.max(120,active.scrollHeight+26);
        if(!body.dataset.userResized && body.getBoundingClientRect().height>min+120) body.style.height=min+'px';
      }
    }
  }

  function fixPhoneLabel(){
    const el=document.querySelector('[data-pcharge]');
    if(el && el.textContent.trim()==='Batería') el.textContent='Descargando';
  }

  let timer=0;
  function schedule(){
    clearTimeout(timer);
    timer=setTimeout(function(){fixGps();fixPhoneLabel()},120);
  }

  fixGps();fixPhoneLabel();
  // Only react to structural DOM changes. Watching characterData caused this
  // observer to run on every compass/motion update and could starve live rendering.
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  setInterval(fixPhoneLabel,2000);
})();
