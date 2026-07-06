export function createGameSettingsEditor({els,getSettings,save,renderWorkspace}){
  function render(){
    const settings=getSettings();
    els.gameSettingsWidthInput.value=settings.width;
    els.gameSettingsHeightInput.value=settings.height;
    els.gameSettingsResolutionPreview.textContent=`${settings.width} × ${settings.height}`;
    els.gameSettingsInspectorWidth.value=settings.width;
    els.gameSettingsInspectorHeight.value=settings.height;
  }

  function updateDimension(key,value){
    const settings=getSettings();
    const fallback=key==='width'?1280:720;
    const min=key==='width'?160:120;
    const max=key==='width'?7680:4320;
    settings[key]=Math.max(min,Math.min(max,Number(value)||fallback));
    save();
    renderWorkspace();
  }

  function bind(){
    els.gameSettingsWidthInput.addEventListener('change',()=>updateDimension('width',els.gameSettingsWidthInput.value));
    els.gameSettingsHeightInput.addEventListener('change',()=>updateDimension('height',els.gameSettingsHeightInput.value));
  }

  return{bind,render};
}
