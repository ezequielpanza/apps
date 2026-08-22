(function(){
  function install(){
    if(!window.NativeToolsBridge)return;
    window.BoatStationTools={
      qrDataUrl:payload=>NativeToolsBridge.qrDataUrl(payload),
      exportGpx:gpx=>NativeToolsBridge.exportGpx(gpx),
      importGpx:()=>NativeToolsBridge.importGpx()
    };
  }
  install();
  window.addEventListener('boatstation-core-ready',install);
})();