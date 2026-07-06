import{ensureResource,findNode,uid}from'./project-model.js';

export function createBackgroundEditor({els,getTree,getActiveSection,getResources,save,assets,renderWorkspace}){
  let selectedBackgroundId=null;
  let previewUrl=null;

  function context(){
    const section=getActiveSection();
    if(!section||section.kind!=='room-section'||section.sectionKey!=='backgrounds')return null;
    const room=findNode(getTree(),section.roomId)?.node;
    if(!room)return null;
    return{section,room,resource:ensureResource(getResources(),room)};
  }

  function releasePreview(){if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}}
  function selectBackground(id){selectedBackgroundId=id||null;}

  async function render(){
    const current=context();if(!current)return;
    const{resource}=current;
    if(!selectedBackgroundId||!resource.backgrounds.some(bg=>bg.id===selectedBackgroundId))selectedBackgroundId=resource.defaultBackgroundId||resource.backgrounds[0]?.id||null;
    els.backgroundList.innerHTML=resource.backgrounds.length?resource.backgrounds.map(bg=>`<button class="background-list-item${bg.id===selectedBackgroundId?' selected':''}" data-background-id="${bg.id}"><span class="background-state-dot"></span><span><strong>${escapeHtml(bg.name)}</strong><small>${bg.width} × ${bg.height}${bg.id===resource.defaultBackgroundId?' · Default':''}</small></span></button>`).join(''):'<div class="background-list-empty">No backgrounds yet</div>';
    els.backgroundCount.textContent=`${resource.backgrounds.length} background${resource.backgrounds.length===1?'':'s'}`;
    await renderSelected(resource);
  }

  async function renderSelected(resource){
    const bg=resource.backgrounds.find(item=>item.id===selectedBackgroundId)||null;
    els.backgroundEditorEmpty.hidden=Boolean(bg);
    els.backgroundPreviewPane.hidden=!bg;
    els.backgroundInspectorSection.hidden=!bg;
    if(!bg){releasePreview();return;}
    els.backgroundNameInput.value=bg.name;
    els.backgroundDimensions.value=`${bg.width} × ${bg.height}`;
    els.backgroundDefaultCheck.checked=bg.id===resource.defaultBackgroundId;
    const blob=await assets.get(bg.assetKey,bg.sourceUrl,bg.sourceEncoding,bg.type);
    if(!blob){releasePreview();els.backgroundPreviewImage.removeAttribute('src');return;}
    releasePreview();
    previewUrl=URL.createObjectURL(blob);
    els.backgroundPreviewImage.src=previewUrl;
  }

  async function addFiles(files){
    const current=context();if(!current||!files?.length)return;
    for(const file of files){
      const dims=await readDimensions(file),id=uid('background'),assetKey=`${current.room.gameId}:${current.room.id}:background:${id}`;
      await assets.put(assetKey,file);
      current.resource.backgrounds.push({id,name:stripExtension(file.name)||`Background ${current.resource.backgrounds.length+1}`,assetKey,width:dims.width,height:dims.height,type:file.type,size:file.size,zoom:100,scaleMode:'manual'});
      if(!current.resource.defaultBackgroundId)current.resource.defaultBackgroundId=id;
      selectedBackgroundId=id;
    }
    save();await renderWorkspace();
  }

  async function removeSelected(){
    const current=context();if(!current||!selectedBackgroundId)return;
    const index=current.resource.backgrounds.findIndex(bg=>bg.id===selectedBackgroundId);if(index<0)return;
    const[removed]=current.resource.backgrounds.splice(index,1);
    await assets.remove(removed.assetKey);
    if(current.resource.defaultBackgroundId===removed.id)current.resource.defaultBackgroundId=current.resource.backgrounds[0]?.id||null;
    selectedBackgroundId=current.resource.backgrounds[index]?.id||current.resource.backgrounds[index-1]?.id||null;
    save();await renderWorkspace();
  }

  function renameSelected(value){const current=context(),bg=current?.resource.backgrounds.find(item=>item.id===selectedBackgroundId),name=value.trim();if(!bg||!name)return;bg.name=name;save();render();}
  function setDefault(checked){const current=context();if(!current||!selectedBackgroundId||!checked)return;current.resource.defaultBackgroundId=selectedBackgroundId;save();render();}

  function bind(){
    els.addBackgroundStateButton.addEventListener('click',()=>els.backgroundStateFileInput.click());
    els.backgroundEditorImportButton.addEventListener('click',()=>els.backgroundStateFileInput.click());
    els.backgroundStateFileInput.addEventListener('change',async()=>{const files=[...(els.backgroundStateFileInput.files||[])];els.backgroundStateFileInput.value='';if(files.length)await addFiles(files);});
    els.backgroundList.addEventListener('click',event=>{const button=event.target.closest('[data-background-id]');if(!button)return;selectedBackgroundId=button.dataset.backgroundId;render();});
    els.backgroundNameInput.addEventListener('change',()=>renameSelected(els.backgroundNameInput.value));
    els.backgroundDefaultCheck.addEventListener('change',()=>setDefault(els.backgroundDefaultCheck.checked));
    els.deleteBackgroundStateButton.addEventListener('click',removeSelected);
    window.addEventListener('beforeunload',releasePreview);
  }

  return{bind,render,selectBackground};
}

function stripExtension(name){return name.replace(/\.[^.]+$/,'');}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function readDimensions(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{resolve({width:img.naturalWidth,height:img.naturalHeight});URL.revokeObjectURL(url);};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Invalid image'));};img.src=url;});}
