import{ensureResource,uid}from'./project-model.js';

const SCALE_MODES=new Set(['original','fit-width','fit-height','fit-inside','fill','custom']);

export function createRoomEditor({els,getActiveNode,getActiveGameResource,getResources,save,renderWorkspace,assets}){
  let imageUrl=null;
  let editorZoom=100;

  const activeRoomContext=()=>{const node=getActiveNode();if(node?.itemType!=='room')return null;return{node,resource:ensureResource(getResources(),node),game:getActiveGameResource()};};
  const defaultBackground=room=>room?.backgrounds.find(bg=>bg.id===room.defaultBackgroundId)||room?.backgrounds[0]||null;
  const release=()=>{if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl=null;}};

  function viewport(game){return{width:Number(game?.settings?.width)||1920,height:Number(game?.settings?.height)||1080};}
  function normalizeTransform(bg){
    if(!bg)return null;
    if(!SCALE_MODES.has(bg.scaleMode))bg.scaleMode=bg.scaleMode==='fit'?'fit-inside':'custom';
    if(!Number.isFinite(Number(bg.scale))||Number(bg.scale)<=0)bg.scale=Math.max(.01,(Number(bg.zoom)||100)/100);
    if(!Number.isFinite(Number(bg.initialX)))bg.initialX=0;
    if(!Number.isFinite(Number(bg.initialY)))bg.initialY=0;
    delete bg.zoom;
    return bg;
  }
  function automaticScale(bg,game){
    const view=viewport(game),width=Math.max(1,Number(bg.width)||1),height=Math.max(1,Number(bg.height)||1);
    if(bg.scaleMode==='original')return 1;
    if(bg.scaleMode==='fit-width')return view.width/width;
    if(bg.scaleMode==='fit-height')return view.height/height;
    if(bg.scaleMode==='fit-inside')return Math.min(view.width/width,view.height/height);
    if(bg.scaleMode==='fill')return Math.max(view.width/width,view.height/height);
    return Math.max(.01,Number(bg.scale)||1);
  }
  function resolveScale(bg,game){normalizeTransform(bg);const scale=automaticScale(bg,game);if(bg.scaleMode!=='custom')bg.scale=scale;return scale;}
  function syncInspector(bg,game){
    const scale=resolveScale(bg,game),view=viewport(game);
    els.roomScaleMode.value=bg.scaleMode;
    els.roomScaleInput.value=trimNumber(scale*100);
    els.roomScaleInput.disabled=bg.scaleMode!=='custom';
    els.roomInitialXInput.value=trimNumber(bg.initialX);
    els.roomInitialYInput.value=trimNumber(bg.initialY);
    els.roomTransformHelp.textContent=`Game viewport ${view.width} × ${view.height}. Rendered size ${Math.round(bg.width*scale)} × ${Math.round(bg.height*scale)}.`;
  }

  async function render(room){
    const current=activeRoomContext(),bg=defaultBackground(room),game=current?.game;
    els.roomZoomRange.value=editorZoom;
    els.roomZoomOutput.textContent=`${editorZoom}%`;
    els.roomImageName.value=bg?.name||'None';
    els.roomImageWidth.value=bg?.width||'—';
    els.roomImageHeight.value=bg?.height||'—';
    if(!bg){release();els.roomCanvasEmpty.hidden=false;els.roomCanvasStage.hidden=true;els.roomScaleMode.disabled=true;els.roomScaleInput.disabled=true;els.roomInitialXInput.disabled=true;els.roomInitialYInput.disabled=true;els.roomTransformHelp.textContent='Background transform in game coordinates.';return;}
    els.roomScaleMode.disabled=false;els.roomInitialXInput.disabled=false;els.roomInitialYInput.disabled=false;
    normalizeTransform(bg);syncInspector(bg,game);
    const blob=await assets.get(bg.assetKey,bg.sourceUrl,bg.sourceEncoding,bg.type);
    if(!blob){release();els.roomCanvasEmpty.hidden=false;els.roomCanvasStage.hidden=true;return;}
    release();
    imageUrl=URL.createObjectURL(blob);
    const scale=resolveScale(bg,game),editorFactor=editorZoom/100;
    els.roomBackgroundImage.src=imageUrl;
    els.roomBackgroundImage.style.width=`${bg.width*scale*editorFactor}px`;
    els.roomBackgroundImage.style.transform=`translate(${bg.initialX*editorFactor}px,${bg.initialY*editorFactor}px)`;
    els.roomBackgroundImage.style.transformOrigin='top left';
    els.roomCanvasEmpty.hidden=true;
    els.roomCanvasStage.hidden=false;
  }

  async function addDefaultBackground(file){
    const current=activeRoomContext();if(!current||!file)return;
    const dims=await readDimensions(file),id=uid('background'),assetKey=`${current.node.gameId}:${current.node.id}:background:${id}`;
    await assets.put(assetKey,file);
    const bg={id,name:stripExtension(file.name)||'Background',assetKey,width:dims.width,height:dims.height,type:file.type,size:file.size,scaleMode:'original',scale:1,initialX:0,initialY:0};
    current.resource.backgrounds.push(bg);
    if(!current.resource.defaultBackgroundId)current.resource.defaultBackgroundId=id;
    save();await renderWorkspace();
  }

  async function replaceDefault(file){
    const current=activeRoomContext(),bg=defaultBackground(current?.resource);if(!current||!bg||!file)return;
    const dims=await readDimensions(file);
    await assets.put(bg.assetKey,file);
    bg.name=stripExtension(file.name)||bg.name;
    bg.width=dims.width;bg.height=dims.height;bg.type=file.type;bg.size=file.size;
    delete bg.sourceUrl;delete bg.sourceEncoding;
    normalizeTransform(bg);resolveScale(bg,current.game);
    save();await renderWorkspace();
  }

  function setEditorZoom(value){editorZoom=Math.max(10,Math.min(300,Number(value)||100));const current=activeRoomContext();if(current)render(current.resource);}
  function fitEditorView(){const current=activeRoomContext(),bg=defaultBackground(current?.resource);if(!current||!bg)return;const scale=resolveScale(bg,current.game),box=els.roomCanvasShell.getBoundingClientRect(),renderWidth=bg.width*scale,renderHeight=bg.height*scale;const value=Math.min((box.width-80)/Math.max(1,renderWidth),(box.height-80)/Math.max(1,renderHeight))*100;editorZoom=Math.max(10,Math.min(300,Math.round(value/5)*5));render(current.resource);}
  function setScaleMode(mode){const current=activeRoomContext(),bg=defaultBackground(current?.resource);if(!current||!bg||!SCALE_MODES.has(mode))return;normalizeTransform(bg);bg.scaleMode=mode;resolveScale(bg,current.game);save();render(current.resource);}
  function setCustomScale(value){const current=activeRoomContext(),bg=defaultBackground(current?.resource);if(!current||!bg)return;normalizeTransform(bg);bg.scaleMode='custom';bg.scale=Math.max(.01,Math.min(10,(Number(value)||100)/100));save();render(current.resource);}
  function setInitialPosition(axis,value){const current=activeRoomContext(),bg=defaultBackground(current?.resource);if(!current||!bg)return;normalizeTransform(bg);bg[axis]=Number(value)||0;save();render(current.resource);}
  async function removeDefault(){const current=activeRoomContext(),bg=defaultBackground(current?.resource);if(!current||!bg)return;await assets.remove(bg.assetKey);current.resource.backgrounds=current.resource.backgrounds.filter(item=>item.id!==bg.id);current.resource.defaultBackgroundId=current.resource.backgrounds[0]?.id||null;save();renderWorkspace();}

  function bind(){
    els.importBackgroundButton.addEventListener('click',()=>{delete els.backgroundFileInput.dataset.mode;els.backgroundFileInput.click();});
    els.emptyImportBackgroundButton.addEventListener('click',()=>{delete els.backgroundFileInput.dataset.mode;els.backgroundFileInput.click();});
    els.replaceBackgroundButton.addEventListener('click',()=>{els.backgroundFileInput.dataset.mode='replace';els.backgroundFileInput.click();});
    els.backgroundFileInput.addEventListener('change',async()=>{const file=els.backgroundFileInput.files?.[0],mode=els.backgroundFileInput.dataset.mode||'add';els.backgroundFileInput.value='';delete els.backgroundFileInput.dataset.mode;if(!file)return;const current=activeRoomContext(),bg=defaultBackground(current?.resource);if(mode==='replace'&&bg)await replaceDefault(file);else await addDefaultBackground(file);});
    els.roomZoomRange.addEventListener('input',()=>setEditorZoom(els.roomZoomRange.value));
    els.fitRoomButton.addEventListener('click',fitEditorView);
    els.roomScaleMode.addEventListener('change',()=>setScaleMode(els.roomScaleMode.value));
    els.roomScaleInput.addEventListener('change',()=>setCustomScale(els.roomScaleInput.value));
    els.roomInitialXInput.addEventListener('change',()=>setInitialPosition('initialX',els.roomInitialXInput.value));
    els.roomInitialYInput.addEventListener('change',()=>setInitialPosition('initialY',els.roomInitialYInput.value));
    els.removeBackgroundButton.addEventListener('click',removeDefault);
    window.addEventListener('beforeunload',release);
  }

  return{bind,render};
}

function trimNumber(value){return Number(Number(value).toFixed(3));}
function stripExtension(name){return name.replace(/\.[^.]+$/,'');}
function readDimensions(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{resolve({width:img.naturalWidth,height:img.naturalHeight});URL.revokeObjectURL(url);};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Invalid image'));};img.src=url;});}