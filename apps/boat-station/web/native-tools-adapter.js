(function(){
  function install(){
    if(!window.NativeToolsBridge)return;
    window.BoatStationTools={
      qrDataUrl:payload=>NativeToolsBridge.qrDataUrl(payload),
      appVersion:()=>NativeToolsBridge.appVersion?.()||'',
      exportGpx:gpx=>NativeToolsBridge.exportGpx(gpx),
      exportBatteryDiagnosticsCsv:filename=>NativeToolsBridge.exportBatteryDiagnosticsCsv?.(filename),
      exportCsvText:(filename,csv)=>NativeToolsBridge.exportCsvText?.(filename,csv),
      importGpx:()=>NativeToolsBridge.importGpx()
    };
  }
  install();
  window.addEventListener('boatstation-core-ready',install);
})();