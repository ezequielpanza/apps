import{ensureResource,uid}from'./project-model.js';

const SCALE_MODES=new Set(['original','fit-width','fit-height','fit-inside','fill','custom']);

export function createRoomEditor({els,getActiveNode,getActiveGameResource,getResources,save,renderWorkspace,assets}){
  let imageUrl=null;
  let editorZoom=100;
  let centerViewportPending=true;
  let dragState=null;

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
  function setGuideVisibility(){
    const showViewport=els.showViewportToggle.checked;
    const showImageBounds=els.showImageBoundsToggle.checked;
    els.roomViewportFrame.hidden=!showViewport;
    els.roomViewportMask.hidden=!showViewport;
    els.roomOriginMarker.hidden=!showViewport;
    els.roomBackgroundBounds.classList.toggle('hide-bounds',!showImageBounds);
  }
  function layoutScene(bg,game){
    const view=viewport(game),scale=resolveScale(bg,game),factor=editorZoom/100;
    const viewportWidth=view.width*factor,viewportHeight=view.height*factor;
    const imageWidth=bg.width*scale*factor,imageHeight=bg.height*scale*factor;
    const imageX=bg.initialX*factor,imageY=bg.initialY*factor;
    const minX=Math.min(0,imageX),minY=Math.min(0,imageY);
    const maxX=Math.max(viewportWidth,imageX+imageWidth),maxY=Math.max(viewportHeight,imageY+imageHeight);
    const pad=56;
    const sceneWidth=maxX-minX+pad*2,sceneHeight=maxY-minY+pad*2;
    const originX=pad-minX,originY=pad-minY;

    els.roomScene.style.width=`${sceneWidth}px`;
    els.roomScene.style.height=`${sceneHeight}px`;
    els.roomViewportFrame.style.left=`${originX}px`;
    els.roomViewportFrame.style.top=`${originY}px`;
    els.roomViewportFrame.style.width=`${viewportWidth}px`;
    els.roomViewportFrame.style.height=`${viewportHeight}px`;
    els.roomViewportLabel.textContent=`Viewport ${view.width} × ${view.height}`;

    els.roomViewportMask.style.left=`${originX}px`;
    els.roomViewportMask.style.top=`${originY}px`;
    els.roomViewportMask.style.width=`${viewportWidth}px`;
    els.roomViewportMask.style.height=`${viewportHeight}px`;
    els.roomViewportMask.style.boxShadow='0 0 0 99999px rgba(3,5,8,.58)';

    els.roomOriginMarker.style.left=`${originX}px`;
    els.roomOriginMarker.style.top=`${originY}px`;

    els.roomBackgroundBounds.style.left=`${originX+imageX}px`;
    els.roomBackgroundBounds.style.top=`${originY+imageY}px`;
    els.roomBackgroundBounds.style.width=`${imageWidth}px`;
    els.roomBackgroundBounds.style.height=`${imageHeight}px`;
    els.roomBackgroundBoundsLabel.textContent=`Background ${bg.width} × ${bg.height}`;

    els.roomBackgroundImage.style.width='100%';
    els.roomBackgroundImage.style.height='100%';
    els.roomBackgroundImage.style.transform='none';
    setGuideVisibility();
  }
  function centerViewportInEditor(){
    const shell=els.roomCanvasShell,frame=els.roomViewportFrame;
    if(!shell||!frame||frame.hidden)return;
    const left=frame.offsetLeft+frame.offsetWidth/2-shell.clientWidth/2;
    const top=frame.offsetTop+frame.offsetHeight/2-shell.clientHeight/2;
    shell.scrollTo({left:Math.max(0,left),top:Math.max(0,top),behavior:'auto'});
  }
  function scheduleViewportCenter(){requestAnimationFrame(()=>requestAnimationFrame(centerViewportInEditor));}

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
    els.roomBackgroundImage.src=imageUrl;
    layoutScene(bg,game);
    els.roomCanvasEmpty.hidden=true;
    els.roomCanvasStage.hidden=false;
    if(centerViewportPending){centerViewportPending=false;scheduleViewportCenter();}
  }

  async function addDefaultBackground(file){
    const current=activeRoomContext();if(!current||!file)return;
    const dims=await readDimensions(file),id=uid('background'),assetKey=`${current.node.gameId}:${current.node.id}:background:${id}`;
    await assets.put(assetKey,file);
    const bg={id,name:stripExtension(file.name)||'Background',assetKey,width:dims.width,height:dims.height,type:file.type,size:file.size,scaleMode:'original',scale:1,initialX:0,initialY:0};
    current.resource.backgrounds.push(bg);
    if(!current.resource.defaultBackgroundId)current.resource.defaultBackgroundId=id;
    centerViewportPending=true;
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
    centerViewportPending=true;
    save();await renderWorkspace();
  }

  function setEditorZoom(value){editorZoom=Math.max(10,Math.min(300,Number(value)||100));const current=activeRoomContext();if(current)render(current.resource);}
  function fitEditorView(){const current=activeRoomContext(),bg=defaultBackground(current?.resource);if(!current||!bg)return;const view=viewport(current.game),scale=resolveScale(bg,current.game),box=els.roomCanvasShell.getBoundingClientRect();const minX=Math.min(0,bg.initialX),minY=Math.min(0,bg.initialY),maxX=Math.max(view.width,bg.initialX+bg.width*scale),maxY=Math.max(view.height,bg.initialY+bg.height*scale);const sceneWidth=maxX-minX,sceneHeight=maxY-minY;const value=Math.min((box.width-112)/Math.max(1,sceneWidth),(box.height-112)/Math.max(1,sceneHeight))*100;editorZoom=Math.max(10,Math.min(300,Math.floor(value/5)*5));centerViewportPending=true;render(current.resource);}
  function setScaleMode(mode){const current=activeRoomContext(),bg=defaultBackground(current?.resource);if(!current||!bg||!SCALE_MODES.has(mode))return;normalizeTransform(bg);bg.scaleMode=mode;resolveScale(bg,current.game);save();render(current.resource);}
  function setCustomScale(value){const current=activeRoomContext(),bg=defaultBackground(current?.resource);if(!current||!bg)return;normalizeTransform(bg);bg.scaleMode='custom';bg.scale=Math.max(.01,Math.min(10,(Number(value)||100)/100));save();render(current.resource);}
  function setInitialPosition(axis,value){const current=activeRoomContext(),bg=defaultBackground(current?.resource);if(!current||!bg)return;normalizeTransform(bg);bg[axis]=Number(value)||0;save();render(current.resource);}
  async function removeDefault(){const current=activeRoomContext(),bg=defaultBackground(current?.resource);if(!current||!bg)return;await assets.remove(bg.assetKey);current.resource.backgrounds=current.resource.backgrounds.filter(item=>item.id!==bg.id);current.resource.defaultBackgroundId=current.resource.backgrounds[0]?.id||null;centerViewportPending=true;save();renderWorkspace();}

  function beginBackgroundDrag(event){
    if(event.button!==0)return;
    const current=activeRoomContext(),bg=defaultBackground(current?.resource);if(!current||!bg)return;
    event.preventDefault();
    const factor=editorZoom/100;
    dragState={pointerId:event.pointerId,current,bg,factor,startClientX:event.clientX,startClientY:event.clientY,startInitialX:Number(bg.initialX)||0,startInitialY:Number(bg.initialY)||0,startLeft:parseFloat(els.roomBackgroundBounds.style.left)||0,startTop:parseFloat(els.roomBackgroundBounds.style.top)||0};
    els.roomBackgroundBounds.classList.add('dragging');
    els.roomBackgroundBounds.setPointerCapture?.(event.pointerId);
  }
  function moveBackgroundDrag(event){
    if(!dragState||event.pointerId!==dragState.pointerId)return;
    const dx=event.clientX-dragState.startClientX,dy=event.clientY-dragState.startClientY;
    els.roomBackgroundBounds.style.left=`${dragState.startLeft+dx}px`;
    els.roomBackgroundBounds.style.top=`${dragState.startTop+dy}px`;
    els.roomInitialXInput.value=trimNumber(dragState.startInitialX+dx/dragState.factor);
    els.roomInitialYInput.value=trimNumber(dragState.startInitialY+dy/dragState.factor);
  }
  function endBackgroundDrag(event){
    if(!dragState||event.pointerId!==dragState.pointerId)return;
    const state=dragState,dx=event.clientX-state.startClientX,dy=event.clientY-state.startClientY;
    dragState=null;
    state.bg.initialX=trimNumber(state.startInitialX+dx/state.factor);
    state.bg.initialY=trimNumber(state.startInitialY+dy/state.factor);
    els.roomBackgroundBounds.classList.remove('dragging');
    try{els.roomBackgroundBounds.releasePointerCapture?.(event.pointerId);}catch{}
    centerViewportPending=true;
    save();render(state.current.resource);
  }

  function bind(){
    document.addEventListener('click',event=>{if(event.target.closest('.tree-room[data-node-id]'))centerViewportPending=true;},true);
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
    els.showViewportToggle.addEventListener('change',setGuideVisibility);
    els.showImageBoundsToggle.addEventListener('change',setGuideVisibility);
    els.roomBackgroundBounds.addEventListener('pointerdown',beginBackgroundDrag);
    els.roomBackgroundBounds.addEventListener('pointermove',moveBackgroundDrag);
    els.roomBackgroundBounds.addEventListener('pointerup',endBackgroundDrag);
    els.roomBackgroundBounds.addEventListener('pointercancel',endBackgroundDrag);
    els.roomBackgroundImage.addEventListener('dragstart',event=>event.preventDefault());
    els.removeBackgroundButton.addEventListener('click',removeDefault);
    window.addEventListener('beforeunload',release);
  }

  return{bind,render};
}

function trimNumber(value){return Number(Number(value).toFixed(3));}
function stripExtension(name){return name.replace(/\.[^.]+$/,'');}
function readDimensions(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{resolve({width:img.naturalWidth,height:img.naturalHeight});URL.revokeObjectURL(url);};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Invalid image'));};img.src=url;});}