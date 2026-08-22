(function(){
  function install(){
    if(!window.NativeToolsBridge)return;
    window.BoatStationTools={
      qrDataUrl:payload=>NativeToolsBridge.qrDataUrl(payload),
      exportGpx:gpx=>NativeToolsBridge.exportGpx(gpx),
      importGpx:()=>NativeToolsBridge.importGpx()
    };
    // stations.js currently consumes the QR/file API through this stable facade name.
    window.V200Bridge=window.BoatStationTools;
  }
  install();
  window.addEventListener('boatstation-core-ready',install);
})();
