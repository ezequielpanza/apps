import {ensureResource} from './project-model.js';

export function createRoomEditor({els,getActiveNode,getResources,save,renderWorkspace,assets}){
  let imageUrl=null;
  const activeRoom=()=>{
    const node=getActiveNode();
    return node?.itemType==='room'?ensureResource(getResources(),node):null;
  };
  const release=()=>{if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl=null;}};

  async function render(room){
    const zoom=room.zoom||100;
    els.roomZoomRange.value=zoom;
    els.roomZoomInput.value=zoom;
    els.roomZoomOutput.textContent=`${zoom}%`;
    els.roomScaleMode.value=room.scaleMode||'manual';
    els.roomImageName.value=room.background?.name||'None';
    els.roomImageWidth.value=room.background?.width||'—';
    els.roomImageHeight.value=room.background?.height||'—';
    if(!room.background){release();els.roomCanvasEmpty.hidden=false;els.roomCanvasStage.hidden=true;return;}
    const blob=await assets.get(room.id);
    if(!blob){room.background=null;save();return render(room);}
    release();
    imageUrl=URL.createObjectURL(blob);
    els.roomBackgroundImage.src=imageUrl;
    els.roomBackgroundImage.style.width=`${room.background.width*zoom/100}px`;
    els.roomCanvasEmpty.hidden=true;
    els.roomCanvasStage.hidden=false;
  }

  async function importBackground(file){
    const room=activeRoom();if(!room||!file)return;
    const dims=await readDimensions(file);
    await assets.put(room.id,file);
    room.background={name:file.name,type:file.type,size:file.size,width:dims.width,height:dims.height};
    room.zoom=100;room.scaleMode='manual';save();await renderWorkspace();
  }

  function setZoom(value){const room=activeRoom();if(!room)return;room.zoom=Math.max(10,Math.min(300,Number(value)||100));room.scaleMode='manual';save();render(room);}
  function fit(){const room=activeRoom();if(!room?.background)return;const box=els.roomCanvasShell.getBoundingClientRect();const value=Math.min((box.width-80)/room.background.width,(box.height-80)/room.background.height)*100;room.zoom=Math.max(10,Math.min(300,Math.round(value/5)*5));room.scaleMode='fit';save();render(room);}
  async function remove(){const room=activeRoom();if(!room)return;await assets.remove(room.id);room.background=null;room.zoom=100;room.scaleMode='manual';save();renderWorkspace();}

  function bind(){
    [els.importBackgroundButton,els.emptyImportBackgroundButton,els.replaceBackgroundButton].forEach(button=>button.addEventListener('click',()=>els.backgroundFileInput.click()));
    els.backgroundFileInput.addEventListener('change',async()=>{const file=els.backgroundFileInput.files?.[0];els.backgroundFileInput.value='';if(file)await importBackground(file);});
    els.roomZoomRange.addEventListener('input',()=>setZoom(els.roomZoomRange.value));
    els.roomZoomInput.addEventListener('change',()=>setZoom(els.roomZoomInput.value));
    els.fitRoomButton.addEventListener('click',fit);
    els.roomScaleMode.addEventListener('change',()=>{const room=activeRoom();if(!room)return;room.scaleMode=els.roomScaleMode.value;room.scaleMode==='fit'?fit():(save(),render(room));});
    els.removeBackgroundButton.addEventListener('click',remove);
    window.addEventListener('beforeunload',release);
  }
  return {bind,render};
}

function readDimensions(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file);const img=new Image();img.onload=()=>{resolve({width:img.naturalWidth,height:img.naturalHeight});URL.revokeObjectURL(url);};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Invalid image'));};img.src=url;});}