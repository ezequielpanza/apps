(function(){
  // PWA-owned compatibility layer for the stable Core 1.1.x native bridges.
  function install(){
    if(window.NativeToolsBridge && !window.V200Bridge){
      window.V200Bridge={
        qrDataUrl:function(payload){return NativeToolsBridge.qrDataUrl(payload)},
        exportGpx:function(gpx){return NativeToolsBridge.exportGpx(gpx)},
        importGpx:function(){return NativeToolsBridge.importGpx()},
        exportZip:function(json){return window.StorageBridge&&StorageBridge.exportZip?StorageBridge.exportZip(json):false}
      };
    }
  }
  install();
  window.addEventListener('boatstation-core-ready',install);
  window.addEventListener('boatstation-gpx-imported',function(e){
    var gpx=e&&e.detail&&e.detail.gpx;
    if(gpx&&window.BoatStationV200&&BoatStationV200.onGpxImported)BoatStationV200.onGpxImported(gpx);
  });
  window.addEventListener('boatstation-gpx-exported',function(e){
    if(e&&e.detail&&e.detail.ok===false)alert('No se pudo exportar el GPX');
  });
})();
