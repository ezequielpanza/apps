(function(){
  const style=document.createElement('style');
  style.textContent='.card{scroll-margin-top:76px}';
  document.head.appendChild(style);

  // IMPORTANT: do not observe the live module DOM. Boat Station updates textContent
  // continuously for compass, motion, GPS and battery values; observing childList on
  // the whole document makes those updates recursively schedule more DOM work and can
  // starve click/touch handlers on slower phones.
  function fixPhoneLabel(){
    const el=document.querySelector('[data-pcharge]');
    if(el && el.textContent.trim()==='Batería') el.textContent='Descargando';
  }

  // Run harmless presentation fixes occasionally only. Never force GPS page/view or
  // module height here: that interferes with swipe navigation and user resize state.
  fixPhoneLabel();
  setInterval(fixPhoneLabel,5000);
})();
