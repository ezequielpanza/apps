(function(){
  let activeModuleId='';

  function activeCard(){return activeModuleId?document.querySelector(`#cards .card[data-id="${CSS.escape(activeModuleId)}"]`):null}
  function moduleTitle(){return activeCard()?.querySelector('.title')?.textContent?.trim()||''}
  function findModuleMenu(){
    const title=moduleTitle();if(!title)return null;
    return [...document.querySelectorAll('.sheet .sheet-inner.compact-sheet')].find(inner=>inner.querySelector('h3')?.textContent?.trim()===title)||null;
  }
  function injectReset(){
    const inner=findModuleMenu();if(!inner||inner.querySelector('[data-reset-module-size]'))return;
    const button=document.createElement('button');
    button.type='button';button.className='option sheet-option';button.dataset.resetModuleSize='1';button.textContent='Restaurar tamaño del módulo';
    const danger=inner.querySelector('[data-module-delete]');
    if(danger)inner.insertBefore(button,danger);else inner.appendChild(button);
  }

  document.addEventListener('click',event=>{
    const more=event.target.closest?.('.more');
    if(more){activeModuleId=more.closest('.card')?.dataset?.id||'';queueMicrotask(injectReset);return}
    const reset=event.target.closest?.('[data-reset-module-size]');
    if(!reset)return;
    event.preventDefault();event.stopPropagation();
    const card=activeCard();
    if(!card||!window.BoatStationPageLayout?.resetModule)return;
    window.BoatStationPageLayout.resetModule(card);
    const original=reset.textContent;reset.textContent='Tamaño restaurado';reset.disabled=true;
    setTimeout(()=>{if(reset.isConnected){reset.textContent=original;reset.disabled=false}},900);
  },true);

  const observer=new MutationObserver(()=>{if(activeModuleId)queueMicrotask(injectReset)});
  observer.observe(document.body,{subtree:true,childList:true});
})();
