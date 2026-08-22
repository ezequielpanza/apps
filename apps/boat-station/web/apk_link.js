(function(){
  async function updateApkLinks(){
    let version='';
    try{
      const r=await fetch('/APK_VERSION',{cache:'no-store'});
      if(r.ok) version=(await r.text()).trim();
    }catch(e){}
    if(!version)return;
    document.querySelectorAll('a[href="/BoatStation.apk"],a[href$="/BoatStation.apk"]').forEach(a=>{
      a.textContent='Descargar versión '+version;
      a.setAttribute('download','BoatStation-'+version+'.apk');
      a.title='Boat Station '+version;
    });
  }
  updateApkLinks();
  new MutationObserver(updateApkLinks).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('boatstation-core-ready',updateApkLinks);
})();
