import{GAME_SECTIONS,TYPES,findNode,walk,uid,createGameSections,createRoomSections,createReference}from'./project-model.js';

export function createProjectTreeController({treeElement,menuElement,getTree,getSelectedId,setSelectedId,save,openEditor,openGameSectionEditor,openRoomSectionEditor,onCreateResource,onDeleteResource,getRoomSectionCount,getRoomBackgrounds,onOpenBackground}){
  let activeCreateTargetId=null;
  let draggedId=null;
  const tree=()=>getTree();
  const esc=value=>String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const resourceLabel=id=>findNode(tree(),id)?.node?.label||'Missing resource';
  const countItems=node=>node.kind==='item'&&node.itemType!=='game'?1:Array.isArray(node.children)?node.children.reduce((sum,child)=>sum+countItems(child),0):0;
  const sectionCount=node=>typeof getRoomSectionCount==='function'?getRoomSectionCount(node):countItems(node);
  const chevron=node=>Array.isArray(node.children)?`<span class="tree-chevron">⌄</span>`:'<span class="tree-chevron-placeholder"></span>';
  const editButton=node=>`<button class="tree-edit" data-action="edit-name" data-node-id="${node.id}" title="Rename ${esc(node.label)}" aria-label="Rename ${esc(node.label)}">✎</button>`;
  const deleteButton=node=>`<button class="tree-delete" data-action="delete" data-node-id="${node.id}" title="Delete ${esc(node.label)}" aria-label="Delete ${esc(node.label)}">×</button>`;
  const backgroundSelectionId=id=>`background:${id}`;

  function renderBackground(bg){
    const selected=getSelectedId()===backgroundSelectionId(bg.id)?' selected':'';
    return`<div class="tree-reference tree-background" data-background-id="${bg.id}"><div class="tree-reference-row${selected}"><button class="tree-main-action" data-action="open-background" data-background-id="${bg.id}"><span class="tree-chevron-placeholder"></span><span class="tree-type-icon">▣</span><span class="tree-item-name">${esc(bg.name)}</span></button></div></div>`;
  }

  function renderNode(node){
    const selected=node.id===getSelectedId()?' selected':'';
    if(node.kind==='root')return`<div class="tree-root ${node.open?'':'closed'}" data-node-id="${node.id}"><div class="tree-root-row${selected}"><button class="tree-main-action" data-action="activate" data-node-id="${node.id}">${chevron(node)}<span class="tree-type-icon">◆</span><span class="tree-root-name">${esc(node.label)}</span><span class="tree-count">${node.children.length}</span></button><button class="tree-create" data-action="create-menu" data-node-id="${node.id}" title="Add Game" aria-label="Add Game">＋</button></div><div class="tree-children">${node.children.length?node.children.map(renderNode).join(''):'<div class="tree-empty">Empty</div>'}</div></div>`;
    if(node.kind==='game-section'){
      const createButton=node.itemType?`<button class="tree-create" data-action="create-menu" data-node-id="${node.id}" title="Add to ${esc(node.label)}" aria-label="Add to ${esc(node.label)}">＋</button>`:'';
      const count=node.itemType?`<span class="tree-count">${countItems(node)}</span>`:'';
      return`<div class="tree-game-section ${node.open?'':'closed'}" data-node-id="${node.id}" ${node.itemType?'data-drop-container="true"':''}><div class="tree-game-section-row${selected}"><button class="tree-main-action" data-action="activate" data-node-id="${node.id}">${chevron(node)}<span class="tree-type-icon">${node.icon}</span><span class="tree-section-name">${esc(node.label)}</span>${count}</button>${createButton}</div>${node.itemType?`<div class="tree-children">${node.children.length?node.children.map(renderNode).join(''):'<div class="tree-empty">Empty</div>'}</div>`:''}</div>`;
    }
    if(node.kind==='folder')return`<div class="tree-folder ${node.open?'':'closed'}" data-node-id="${node.id}" data-draggable-node="true" data-drop-container="true" draggable="true"><div class="tree-folder-row${selected}"><button class="tree-main-action" data-action="activate" data-node-id="${node.id}">${chevron(node)}<span class="tree-type-icon">▱</span><span class="tree-folder-name">${esc(node.label)}</span></button><button class="tree-create" data-action="create-menu" data-node-id="${node.id}" title="Add to ${esc(node.label)}" aria-label="Add to ${esc(node.label)}">＋</button>${editButton(node)}${deleteButton(node)}</div><div class="tree-children">${node.children.length?node.children.map(renderNode).join(''):'<div class="tree-empty">Empty</div>'}</div></div>`;
    if(node.kind==='room-section'){
      const backgrounds=node.sectionKey==='backgrounds'&&typeof getRoomBackgrounds==='function'?getRoomBackgrounds(node):null;
      const children=backgrounds?backgrounds.map(renderBackground).join(''):(node.children.length?node.children.map(renderNode).join(''):'<div class="tree-empty">Empty</div>');
      return`<div class="tree-room-section ${node.open?'':'closed'}" data-node-id="${node.id}" data-drop-container="true"><div class="tree-section-row${selected}"><button class="tree-main-action" data-action="activate" data-node-id="${node.id}">${chevron(node)}<span class="tree-type-icon">${node.icon}</span><span class="tree-section-name">${esc(node.label)}</span><span class="tree-count">${sectionCount(node)}</span></button></div><div class="tree-children">${children}</div></div>`;
    }
    if(node.kind==='reference'){
      const type=TYPES[node.itemType];
      return`<div class="tree-reference" data-node-id="${node.id}"><div class="tree-reference-row${selected}"><button class="tree-main-action" data-action="activate" data-node-id="${node.id}"><span class="tree-chevron-placeholder"></span><span class="tree-reference-link">↗</span><span class="tree-type-icon">${type?.icon||'•'}</span><span class="tree-item-name">${esc(resourceLabel(node.resourceId))}</span></button><button class="tree-delete" data-action="delete-reference" data-node-id="${node.id}" title="Remove reference" aria-label="Remove reference">×</button></div></div>`;
    }
    const type=TYPES[node.itemType];
    if(node.itemType==='game')return`<div class="tree-item tree-game ${node.open?'':'closed'}" data-node-id="${node.id}"><div class="tree-item-row${selected}"><button class="tree-main-action" data-action="activate" data-node-id="${node.id}">${chevron(node)}<span class="tree-type-icon">${type.icon}</span><span class="tree-item-name">${esc(node.label)}</span></button>${editButton(node)}${deleteButton(node)}</div><div class="tree-children">${node.children.map(renderNode).join('')}</div></div>`;
    if(node.itemType==='room')return`<div class="tree-item tree-room ${node.open?'':'closed'}" data-node-id="${node.id}" data-draggable-node="true" draggable="true"><div class="tree-item-row${selected}"><button class="tree-main-action" data-action="activate" data-node-id="${node.id}">${chevron(node)}<span class="tree-type-icon">${type.icon}</span><span class="tree-item-name">${esc(node.label)}</span></button>${editButton(node)}${deleteButton(node)}</div><div class="tree-children">${node.children.map(renderNode).join('')}</div></div>`;
    return`<div class="tree-item" data-node-id="${node.id}" data-draggable-node="true" draggable="true"><div class="tree-item-row${selected}"><button class="tree-main-action" data-action="activate" data-node-id="${node.id}"><span class="tree-chevron-placeholder"></span><span class="tree-type-icon">${type?.icon||'•'}</span><span class="tree-item-name">${esc(node.label)}</span></button>${editButton(node)}${deleteButton(node)}</div></div>`;
  }

  function render(){treeElement.innerHTML=tree().map(renderNode).join('');}
  function select(id){if(!findNode(tree(),id))return;setSelectedId(id);save();render();}
  function toggleNode(node){if(Array.isArray(node.children))node.open=!node.open;}

  function activate(id){
    const found=findNode(tree(),id);if(!found)return;
    const node=found.node;
    if(node.kind==='root'||node.kind==='folder'||node.itemType==='game'){setSelectedId(id);toggleNode(node);save();render();return;}
    if(node.kind==='game-section'){setSelectedId(id);if(node.itemType)toggleNode(node);save();render();if(node.sectionKey==='settings')openGameSectionEditor(id);return;}
    if(node.kind==='room-section'){setSelectedId(id);toggleNode(node);save();render();if(node.sectionKey==='backgrounds')openRoomSectionEditor(id);return;}
    if(node.kind==='reference'){openEditor(node.resourceId);return;}
    if(node.kind==='item'){if(node.itemType==='room')toggleNode(node);openEditor(id);}
  }

  function openBackground(id){
    const section=findBackgroundSection(id);if(!section)return;
    setSelectedId(backgroundSelectionId(id));
    save();render();onOpenBackground?.(section.id,id);
  }
  function findBackgroundSection(backgroundId){let result=null;walk(tree(),node=>{if(node.kind==='room-section'&&node.sectionKey==='backgrounds'){const backgrounds=typeof getRoomBackgrounds==='function'?getRoomBackgrounds(node):[];if(backgrounds.some(bg=>bg.id===backgroundId)){result=node;return false;}}});return result;}

  function deleteReference(id){const found=findNode(tree(),id);if(!found||found.node.kind!=='reference'||!found.parent)return;found.parent.children=found.parent.children.filter(child=>child.id!==id);setSelectedId(found.parent.id);save();render();}
  function deleteNode(id){const found=findNode(tree(),id);if(!found||found.node.kind!=='item'&&found.node.kind!=='folder'||!found.parent)return;onDeleteResource(found.node);found.parent.children=found.parent.children.filter(child=>child.id!==id);setSelectedId(found.parent.id);save();render();}

  function startRename(id){requestAnimationFrame(()=>{const found=findNode(tree(),id);if(!found||!['folder','item'].includes(found.node.kind))return;const row=treeElement.querySelector(`[data-node-id="${CSS.escape(id)}"] > .tree-folder-row, [data-node-id="${CSS.escape(id)}"] > .tree-item-row`);if(!row)return;const name=row.querySelector('.tree-folder-name,.tree-item-name');if(!name)return;setSelectedId(id);const input=document.createElement('input');input.className='tree-rename-input';input.value=found.node.label;input.addEventListener('click',event=>event.stopPropagation());input.addEventListener('pointerdown',event=>event.stopPropagation());name.replaceWith(input);input.focus();input.select();let done=false;const commit=()=>{if(done)return;done=true;const value=input.value.trim();if(value)found.node.label=value;save();render();};input.addEventListener('keydown',event=>{if(event.key==='Enter')commit();if(event.key==='Escape'){done=true;render();}});input.addEventListener('blur',commit,{once:true});});}

  function nextName(type,gameId){let count=0;walk(tree(),node=>{if(node.kind==='item'&&node.itemType===type&&(type==='game'||node.gameId===gameId))count++;});return type==='game'?`Game ${count+1}`:`${TYPES[type].label} ${count+1}`;}
  function createEntry(targetId,type){const found=findNode(tree(),targetId);if(!found)return;if(found.node.kind==='root'&&found.node.id==='games'&&type==='game'){const id=uid('game'),item={id,kind:'item',label:nextName('game'),rootId:'games',itemType:'game',gameId:id,open:true,children:createGameSections(id)};found.node.children.push(item);found.node.open=true;onCreateResource(item);setSelectedId(item.id);save();render();return;}if(!['game-section','folder'].includes(found.node.kind))return;const gameId=found.node.gameId,sectionKey=found.node.sectionKey,itemType=found.node.itemType;if(!gameId||!sectionKey||!itemType)return;const target=found.node;if(type==='folder'){const folder={id:uid('folder'),kind:'folder',label:'New Folder',rootId:'games',gameId,sectionKey,itemType,open:false,children:[]};target.children.push(folder);target.open=true;setSelectedId(folder.id);save();render();return;}if(type!==itemType)return;const item={id:uid(type),kind:'item',label:nextName(type,gameId),rootId:'games',gameId,sectionKey,itemType:type};if(type==='room'){item.open=false;item.children=createRoomSections(item.id,gameId);}target.children.push(item);target.open=true;onCreateResource(item);setSelectedId(item.id);save();render();}

  function buildMenu(id){const found=findNode(tree(),id);if(!found)return'';if(found.node.kind==='root'&&found.node.id==='games')return`<div class="create-menu-label">Create in Games</div><button data-create-type="game"><span>◆</span><div><strong>Game</strong><small>Add a playable game</small></div></button>`;if(!['game-section','folder'].includes(found.node.kind)||!found.node.itemType)return'';const type=TYPES[found.node.itemType];return`<div class="create-menu-label">Create in ${esc(found.node.label)}</div><button data-create-type="${found.node.itemType}"><span>${type.icon}</span><div><strong>${esc(type.label)}</strong><small>Add to this game</small></div></button><div class="create-menu-separator"></div><button data-create-type="folder"><span>▱</span><div><strong>Subfolder</strong><small>Create a nested folder</small></div></button>`;}
  function openMenu(id,anchor){const html=buildMenu(id);if(!html)return;activeCreateTargetId=id;menuElement.innerHTML=html;const rect=anchor.getBoundingClientRect();menuElement.style.left=`${Math.min(innerWidth-228,Math.max(8,rect.right+6))}px`;menuElement.style.top=`${Math.min(innerHeight-130,rect.top-4)}px`;menuElement.classList.add('open');}
  function closeMenu(){activeCreateTargetId=null;menuElement.classList.remove('open');menuElement.innerHTML='';}
  function isDescendant(node,id){return Array.isArray(node.children)&&node.children.some(child=>child.id===id||isDescendant(child,id));}
  function canMoveMaster(dragged,target){if(!dragged||!target||!['folder','item'].includes(dragged.node.kind)||dragged.node.itemType==='game'||!['game-section','folder'].includes(target.node.kind))return false;if(dragged.node.gameId!==target.node.gameId||dragged.node.sectionKey!==target.node.sectionKey||dragged.node.itemType!==target.node.itemType)return false;if(dragged.node.kind==='folder'&&isDescendant(dragged.node,target.node.id))return false;if(dragged.parent?.id===target.node.id)return false;return true;}
  function canReference(dragged,target){return dragged?.node.kind==='item'&&dragged.node.itemType!=='room'&&dragged.node.itemType!=='game'&&target?.node.kind==='room-section'&&dragged.node.gameId===target.node.gameId&&dragged.node.itemType===target.node.accepts&&!target.node.children.some(reference=>reference.resourceId===dragged.node.id);}
  function canDrop(dragId,targetId){const dragged=findNode(tree(),dragId),target=findNode(tree(),targetId);return canReference(dragged,target)||canMoveMaster(dragged,target);}
  function dropNode(dragId,targetId){const dragged=findNode(tree(),dragId),target=findNode(tree(),targetId);if(canReference(dragged,target)){const reference=createReference(target.node,dragged.node);if(reference){target.node.children.push(reference);target.node.open=true;setSelectedId(reference.id);save();render();}return;}if(!canMoveMaster(dragged,target))return;const index=dragged.parent.children.findIndex(child=>child.id===dragId);if(index<0)return;const[moved]=dragged.parent.children.splice(index,1);target.node.children.push(moved);setSelectedId(moved.id);save();render();}
  function clearDrop(){treeElement.querySelectorAll('.drop-valid,.drop-invalid,.dragging-node').forEach(element=>element.classList.remove('drop-valid','drop-invalid','dragging-node'));}

  function bind(){
    treeElement.addEventListener('click',event=>{const actionElement=event.target.closest('[data-action]');if(!actionElement)return;const{action,nodeId,backgroundId}=actionElement.dataset;if(action==='activate')activate(nodeId);if(action==='open-background')openBackground(backgroundId);if(action==='edit-name'){event.stopPropagation();startRename(nodeId);}if(action==='delete'){event.stopPropagation();deleteNode(nodeId);}if(action==='delete-reference'){event.stopPropagation();deleteReference(nodeId);}if(action==='create-menu'){event.stopPropagation();select(nodeId);openMenu(nodeId,actionElement);}});
    treeElement.addEventListener('dragstart',event=>{const element=event.target.closest('[data-draggable-node="true"]');if(!element)return;draggedId=element.dataset.nodeId;element.classList.add('dragging-node');event.dataTransfer.effectAllowed='copyMove';event.dataTransfer.setData('text/plain',draggedId);closeMenu();});
    treeElement.addEventListener('dragover',event=>{if(!draggedId)return;const target=event.target.closest('[data-drop-container="true"]');if(!target)return;event.preventDefault();const valid=canDrop(draggedId,target.dataset.nodeId);event.dataTransfer.dropEffect=valid?(findNode(tree(),target.dataset.nodeId)?.node.kind==='room-section'?'copy':'move'):'none';treeElement.querySelectorAll('.drop-valid,.drop-invalid').forEach(element=>element.classList.remove('drop-valid','drop-invalid'));target.classList.add(valid?'drop-valid':'drop-invalid');});
    treeElement.addEventListener('drop',event=>{if(!draggedId)return;const target=event.target.closest('[data-drop-container="true"]');if(target){event.preventDefault();dropNode(draggedId,target.dataset.nodeId);}draggedId=null;clearDrop();});
    treeElement.addEventListener('dragend',()=>{draggedId=null;clearDrop();});
    menuElement.addEventListener('click',event=>{const button=event.target.closest('[data-create-type]');if(!button||!activeCreateTargetId)return;const target=activeCreateTargetId;closeMenu();createEntry(target,button.dataset.createType);});
    document.addEventListener('click',event=>{if(!menuElement.contains(event.target)&&!event.target.closest('[data-action="create-menu"]'))closeMenu();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
  }

  return{bind,render};
}