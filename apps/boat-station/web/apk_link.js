(function(){
  async function updateApkLinks(){
    let version='';
    try{
      const r=await fetch('/APK_VERSION',{cache:'no-store'});
      if(r.ok) version=(await r.text()).trim();
    }catch(e){}
    if(!version)return;
    const file='BoatStation-'+version+'.apk';
    document.querySelectorAll('a[href="/BoatStation.apk"],a[href$="/BoatStation.apk"],a[data-boatstation-apk]').forEach(a=>{
      a.href='/'+file;
      a.textContent='Descargar versión '+version;
      a.setAttribute('download',file);
      a.title='Boat Station '+version;
      a.setAttribute('data-boatstation-apk','1');
    });
  }
  updateApkLinks();
  new MutationObserver(updateApkLinks).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('boatstation-core-ready',updateApkLinks);
})();
