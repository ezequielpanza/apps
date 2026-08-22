(function(){
  const params=new URLSearchParams(location.search);
  const isCore=params.get('mode')==='station'||!!window.CoreBridge||!!window.BoatStationCore;
  if(!isCore)return;

  const last={gps:0,phone:0,compass:0,motion:0};
  let installed=false,restartAt=0,startedAt=Date.now(),installTimer=0;

  function wrapImmediate(name,key){
    const bs=window.BoatStation;if(!bs||typeof bs[name]!=='function'||bs[name].__bsLocalWrapped)return false;
    const original=bs[name];
    function wrapped(){last[key]=Date.now();return original.apply(this,arguments)}
    wrapped.__bsLocalWrapped=true;wrapped.__bsOriginal=original;bs[name]=wrapped;return true;
  }

  function wrapThrottled(name,key,interval){
    const bs=window.BoatStation;if(!bs||typeof bs[name]!=='function'||bs[name].__bsLocalWrapped)return false;
    const original=bs[name];let latest=null,timer=0,lastRun=0;
    function flush(){timer=0;if(latest===null)return;const v=latest;latest=null;lastRun=performance.now();last[key]=Date.now();original.call(bs,v)}
    function wrapped(v){last[key]=Date.now();latest=v;const now=performance.now(),wait=Math.max(0,interval-(now-lastRun));if(!timer)timer=setTimeout(flush,wait)}
    wrapped.__bsLocalWrapped=true;wrapped.__bsOriginal=original;bs[name]=wrapped;return true;
  }

  function install(){
    const bs=window.BoatStation;if(!bs)return false;
    wrapImmediate('updateGPS','gps');wrapImmediate('updatePhone','phone');
    wrapThrottled('updateCompass','compass',100); // max 10 Hz UI
    wrapThrottled('updateMotion','motion',200);   // max 5 Hz UI
    installed=!!(bs.updateGPS&&bs.updateCompass&&bs.updateMotion);
    if(installed&&installTimer){clearInterval(installTimer);installTimer=0}
    return installed;
  }

  function restartSensors(reason){const now=Date.now();if(now-restartAt<5000)return;restartAt=now;try{if(window.CoreBridge&&typeof CoreBridge.restartSensors==='function'){CoreBridge.restartSensors();window.__bsLastLocalRecovery={time:now,reason}}}catch(e){}}
  function watchdog(){if(!installed)install();if(document.visibilityState==='hidden')return;const now=Date.now();if(now-startedAt<6000)return;const ca=last.compass?now-last.compass:Infinity,ma=last.motion?now-last.motion:Infinity;if(ca>3000&&ma>3000)restartSensors('sensor-stream-stale')}
  function foreground(){startedAt=Date.now();install();setTimeout(()=>restartSensors('foreground'),300);try{if(window.NativeBridge&&typeof NativeBridge.reconnectBatteries==='function')NativeBridge.reconnectBatteries()}catch(e){}}

  install();
  if(!installed)installTimer=setInterval(install,100);
  window.addEventListener('boatstation-core-ready',foreground,{once:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')foreground()});
  setInterval(watchdog,1000);
})();
