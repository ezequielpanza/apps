import{ensureResource,uid}from'./project-model.js';

export function createRoomEditor({els,getActiveNode,getResources,save,renderWorkspace,assets}){
  let imageUrl=null;
  const activeRoom=()=>{const node=getActiveNode();return node?.itemType==='room'?ensureResource(getResources(),node):null;};
  const defaultBackground=room=>room.backgrounds.find(bg=>bg.id===room.defaultBackgroundId)||room.backgrounds[0]||null;
  const release=()=>{if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl=null;}};

  async function render(room){
    const bg=defaultBackground(room);
    const zoom=bg?.zoom||100;
    els.roomZoomRange.value=zoom;
    els.roomZoomInput.value=zoom;
    els.roomZoomOutput.textContent=`${zoom}%`;
    els.roomScaleMode.value=bg?.scaleMode||'manual';
    els.roomImageName.value=bg?.name||'None';
    els.roomImageWidth.value=bg?.width||'—';
    els.roomImageHeight.value=bg?.height||'—';
    if(!bg){release();els.roomCanvasEmpty.hidden=false;els.roomCanvasStage.hidden=true;return;}
    const blob=await assets.get(bg.assetKey);
    if(!blob){release();els.roomCanvasEmpty.hidden=false;els.roomCanvasStage.hidden=true;return;}
    release();imageUrl=URL.createObjectURL(blob);els.roomBackgroundImage.src=imageUrl;els.roomBackgroundImage.style.width=`${bg.width*zoom/100}px`;els.roomCanvasEmpty.hidden=true;els.roomCanvasStage.hidden=false;
  }

  async function addDefaultBackground(file){
    const room=activeRoom();if(!room||!file)return;
    const dims=await readDimensions(file);const id=uid('background');const assetKey=`${room.id}:background:${id}`;
    await assets.put(assetKey,file);
    const bg={id,name:stripExtension(file.name)||'Background',assetKey,width:dims.width,height:dims.height,type:file.type,size:file.size,zoom:100,scaleMode:'manual'};
    room.backgrounds.push(bg);if(!room.defaultBackgroundId)room.defaultBackgroundId=id;save();await renderWorkspace();
  }

  async function replaceDefault(file){
    const room=activeRoom();const bg=room&&defaultBackground(room);if(!room||!bg||!file)return;
    const dims=await readDimensions(file);await assets.put(bg.assetKey,file);bg.name=stripExtension(file.name)||bg.name;bg.width=dims.width;bg.height=dims.height;bg.type=file.type;bg.size=file.size;save();await renderWorkspace();
  }

  function setZoom(value){const room=activeRoom();const bg=room&&defaultBackground(room);if(!bg)return;bg.zoom=Math.max(10,Math.min(300,Number(value)||100));bg.scaleMode='manual';save();render(room);}
  function fit(){const room=activeRoom();const bg=room&&defaultBackground(room);if(!bg)return;const box=els.roomCanvasShell.getBoundingClientRect();const value=Math.min((box.width-80)/bg.width,(box.height-80)/bg.height)*100;bg.zoom=Math.max(10,Math.min(300,Math.round(value/5)*5));bg.scaleMode='fit';save();render(room);}
  async function removeDefault(){const room=activeRoom();const bg=room&&defaultBackground(room);if(!room||!bg)return;await assets.remove(bg.assetKey);room.backgrounds=room.backgrounds.filter(item=>item.id!==bg.id);room.defaultBackgroundId=room.backgrounds[0]?.id||null;save();renderWorkspace();}

  function bind(){
    els.importBackgroundButton.addEventListener('click',()=>els.backgroundFileInput.click());
    els.emptyImportBackgroundButton.addEventListener('click',()=>els.backgroundFileInput.click());
    els.replaceBackgroundButton.addEventListener('click',()=>{const room=activeRoom();defaultBackground(room)?els.backgroundFileInput.click():els.backgroundFileInput.click();els.backgroundFileInput.dataset.mode='replace';});
    els.backgroundFileInput.addEventListener('change',async()=>{const file=els.backgroundFileInput.files?.[0];const mode=els.backgroundFileInput.dataset.mode||'add';els.backgroundFileInput.value='';delete els.backgroundFileInput.dataset.mode;if(file){const room=activeRoom();const bg=room&&defaultBackground(room);if(mode==='replace'&&bg)await replaceDefault(file);else await addDefaultBackground(file);}});
    els.roomZoomRange.addEventListener('input',()=>setZoom(els.roomZoomRange.value));
    els.roomZoomInput.addEventListener('change',()=>setZoom(els.roomZoomInput.value));
    els.fitRoomButton.addEventListener('click',fit);
    els.roomScaleMode.addEventListener('change',()=>{const room=activeRoom();const bg=room&&defaultBackground(room);if(!bg)return;bg.scaleMode=els.roomScaleMode.value;bg.scaleMode==='fit'?fit():(save(),render(room));});
    els.removeBackgroundButton.addEventListener('click',removeDefault);
    window.addEventListener('beforeunload',release);
  }
  return{bind,render};
}

function stripExtension(name){return name.replace(/\.[^.]+$/,'');}
function readDimensions(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{resolve({width:img.naturalWidth,height:img.naturalHeight});URL.revokeObjectURL(url);};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Invalid image'));};img.src=url;});}