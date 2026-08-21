(function(){
  const params=new URLSearchParams(location.search);
  const isCore=params.get('mode')==='station'||!!window.CoreBridge||!!window.BoatStationCore;
  if(!isCore)return;

  const last={gps:0,phone:0,compass:0,motion:0};
  let installed=false;
  let restartAt=0;
  let startedAt=Date.now();

  function wrap(name,key){
    const bs=window.BoatStation;
    if(!bs||typeof bs[name]!=='function'||bs[name].__bsLocalWrapped)return false;
    const original=bs[name];
    function wrapped(){
      last[key]=Date.now();
      return original.apply(this,arguments);
    }
    wrapped.__bsLocalWrapped=true;
    wrapped.__bsOriginal=original;
    bs[name]=wrapped;
    return true;
  }

  function install(){
    const bs=window.BoatStation;
    if(!bs)return false;
    const ok=[
      wrap('updateGPS','gps'),
      wrap('updatePhone','phone'),
      wrap('updateCompass','compass'),
      wrap('updateMotion','motion')
    ].some(Boolean);
    installed=installed||ok;
    return installed;
  }

  function restartSensors(reason){
    const now=Date.now();
    if(now-restartAt<4000)return;
    restartAt=now;
    try{
      if(window.CoreBridge&&typeof CoreBridge.restartSensors==='function'){
        CoreBridge.restartSensors();
        window.__bsLastLocalRecovery={time:now,reason:reason};
      }
    }catch(e){}
  }

  function watchdog(){
    install();
    if(document.visibilityState==='hidden')return;
    const now=Date.now();
    if(now-startedAt<5000)return;

    // Rotation and accelerometer should continuously emit while the Station is
    // foreground. If both streams stop, recover the native listeners without
    // reloading the PWA or touching the network.
    const compassAge=last.compass?now-last.compass:Infinity;
    const motionAge=last.motion?now-last.motion:Infinity;
    if(compassAge>2500&&motionAge>2500)restartSensors('sensor-stream-stale');
  }

  function foreground(){
    startedAt=Date.now();
    install();
    setTimeout(function(){restartSensors('foreground')},250);
    try{
      if(window.NativeBridge&&typeof NativeBridge.reconnectBatteries==='function')NativeBridge.reconnectBatteries();
    }catch(e){}
  }

  install();
  const mo=new MutationObserver(function(){install()});
  mo.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('boatstation-core-ready',foreground);
  window.addEventListener('pageshow',foreground);
  window.addEventListener('focus',foreground);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')foreground()});
  setInterval(watchdog,1000);
})();
