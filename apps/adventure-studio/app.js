const STORAGE_KEYS={projectTree:'adventureStudioProjectTreeV1',projectSelection:'adventureStudioProjectSelectionV1',projectWidth:'adventureStudioProjectWidth',inspectorWidth:'adventureStudioInspectorWidth'};

const ROOT_DEFINITIONS=[
  {id:'rooms',label:'Rooms',itemType:'room',icon:'▧'},
  {id:'characters',label:'Characters',itemType:'character',icon:'◉'},
  {id:'inventory',label:'Inventory',itemType:'inventory',icon:'◇'},
  {id:'dialogues',label:'Dialogues',itemType:'dialogue',icon:'◌'},
  {id:'audio',label:'Audio',itemType:'audio',icon:'♪'}
];

const ITEM_DEFINITIONS={
  room:{label:'Room',rootId:'rooms',icon:'▧'},
  character:{label:'Character',rootId:'characters',icon:'◉'},
  inventory:{label:'Inventory Element',rootId:'inventory',icon:'◇'},
  dialogue:{label:'Dialogue',rootId:'dialogues',icon:'◌'},
  audio:{label:'Audio',rootId:'audio',icon:'♪'}
};

const projectTreeElement=document.getElementById('projectTree');
const projectAddButton=document.getElementById('projectAddButton');
const projectCreateMenu=document.getElementById('projectCreateMenu');
const contextPill=document.querySelector('.context-pill');
const playButton=document.getElementById('playButton');
const stopButton=document.getElementById('stopButton');
const playOverlay=document.getElementById('playOverlay');
const roomStage=document.getElementById('roomStage');
const playStageCopy=document.getElementById('playStageCopy');

function createInitialProjectTree(){
  return ROOT_DEFINITIONS.map(root=>({
    id:root.id,
    kind:'root',
    label:root.label,
    itemType:root.itemType,
    open:true,
    children:[]
  }));
}

function isValidNode(node){
  if(!node||typeof node!=='object'||typeof node.id!=='string'||typeof node.label!=='string')return false;
  if(!['root','folder','item'].includes(node.kind))return false;
  if(node.kind!=='item'&&!Array.isArray(node.children))return false;
  return true;
}

function normalizeNode(node,rootId){
  if(!isValidNode(node))return null;
  if(node.kind==='root')return null;
  if(node.kind==='folder'){
    return {id:node.id,kind:'folder',label:node.label,rootId,open:node.open!==false,children:(node.children||[]).map(child=>normalizeNode(child,rootId)).filter(Boolean)};
  }
  const type=ITEM_DEFINITIONS[node.itemType]?.rootId===rootId?node.itemType:ROOT_DEFINITIONS.find(root=>root.id===rootId)?.itemType;
  return type?{id:node.id,kind:'item',label:node.label,rootId,itemType:type}:null;
}

function loadProjectTree(){
  try{
    const raw=localStorage.getItem(STORAGE_KEYS.projectTree);
    if(!raw)return createInitialProjectTree();
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed))return createInitialProjectTree();
    return ROOT_DEFINITIONS.map(def=>{
      const saved=parsed.find(node=>node&&node.id===def.id&&node.kind==='root');
      return {
        id:def.id,
        kind:'root',
        label:def.label,
        itemType:def.itemType,
        open:saved?saved.open!==false:true,
        children:saved&&Array.isArray(saved.children)?saved.children.map(child=>normalizeNode(child,def.id)).filter(Boolean):[]
      };
    });
  }catch{
    return createInitialProjectTree();
  }
}

let projectTree=loadProjectTree();
let selectedNodeId=localStorage.getItem(STORAGE_KEYS.projectSelection)||'rooms';

function saveProjectTree(){
  localStorage.setItem(STORAGE_KEYS.projectTree,JSON.stringify(projectTree));
  localStorage.setItem(STORAGE_KEYS.projectSelection,selectedNodeId);
}

function walkNodes(nodes,visitor,parent=null,rootId=null){
  for(const node of nodes){
    const currentRootId=node.kind==='root'?node.id:rootId;
    if(visitor(node,parent,currentRootId)===false)return false;
    if(node.kind!=='item'&&walkNodes(node.children,visitor,node,currentRootId)===false)return false;
  }
  return true;
}

function findNode(nodeId){
  let result=null;
  walkNodes(projectTree,(node,parent,rootId)=>{
    if(node.id===nodeId){result={node,parent,rootId};return false;}
  });
  return result;
}

function countItems(node){
  if(node.kind==='item')return 1;
  return node.children.reduce((sum,child)=>sum+countItems(child),0);
}

function createId(prefix){
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
}

function escapeHtml(value){
  return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function renderNode(node,depth=0){
  const selected=node.id===selectedNodeId?' selected':'';
  if(node.kind==='root'){
    return `<div class="tree-root ${node.open?'':'closed'}" data-node-id="${node.id}">
      <div class="tree-root-row${selected}">
        <button class="tree-toggle" data-action="toggle" data-node-id="${node.id}">
          <span class="tree-chevron">⌄</span><span class="tree-type-icon">${ROOT_DEFINITIONS.find(root=>root.id===node.id)?.icon||'▱'}</span>
          <span class="tree-root-name">${escapeHtml(node.label)}</span><span class="tree-count">${countItems(node)}</span>
        </button>
      </div>
      <div class="tree-children">${node.children.length?node.children.map(child=>renderNode(child,depth+1)).join(''):'<div class="tree-empty">Empty</div>'}</div>
    </div>`;
  }
  if(node.kind==='folder'){
    return `<div class="tree-folder ${node.open?'':'closed'}" data-node-id="${node.id}">
      <div class="tree-folder-row${selected}">
        <button class="tree-toggle" data-action="toggle" data-node-id="${node.id}"><span class="tree-chevron">⌄</span><span class="tree-type-icon">▱</span><span class="tree-folder-name">${escapeHtml(node.label)}</span></button>
        <button class="tree-delete" data-action="delete" data-node-id="${node.id}" aria-label="Eliminar carpeta">×</button>
      </div>
      <div class="tree-children">${node.children.length?node.children.map(child=>renderNode(child,depth+1)).join(''):'<div class="tree-empty">Empty</div>'}</div>
    </div>`;
  }
  const def=ITEM_DEFINITIONS[node.itemType];
  return `<div class="tree-item" data-node-id="${node.id}"><div class="tree-item-row${selected}"><button class="tree-item-select" data-action="select" data-node-id="${node.id}"><span class="tree-type-icon">${def?.icon||'•'}</span><span class="tree-item-name">${escapeHtml(node.label)}</span></button><button class="tree-delete" data-action="delete" data-node-id="${node.id}" aria-label="Eliminar elemento">×</button></div></div>`;
}

function renderProjectTree(){
  if(!findNode(selectedNodeId))selectedNodeId='rooms';
  projectTreeElement.innerHTML=projectTree.map(node=>renderNode(node)).join('');
  updateContextFromSelection();
}

function updateContextFromSelection(){
  const found=findNode(selectedNodeId);
  if(!found)return;
  const prefix=found.node.kind==='root'?'Project':found.node.kind==='folder'?'Folder':ITEM_DEFINITIONS[found.node.itemType]?.label||'Project';
  contextPill.innerHTML=`<span class="dot"></span> ${escapeHtml(prefix)} / ${escapeHtml(found.node.label)}`;
}

function selectNode(nodeId){
  if(!findNode(nodeId))return;
  selectedNodeId=nodeId;
  saveProjectTree();
  renderProjectTree();
}

function toggleNode(nodeId){
  const found=findNode(nodeId);
  if(!found||found.node.kind==='item')return;
  found.node.open=!found.node.open;
  selectedNodeId=nodeId;
  saveProjectTree();
  renderProjectTree();
}

function deleteNode(nodeId){
  const found=findNode(nodeId);
  if(!found||found.node.kind==='root'||!found.parent)return;
  found.parent.children=found.parent.children.filter(child=>child.id!==nodeId);
  selectedNodeId=found.parent.id;
  saveProjectTree();
  renderProjectTree();
}

function getSelectedContainerForRoot(rootId){
  const selected=findNode(selectedNodeId);
  if(selected&&selected.rootId===rootId){
    if(selected.node.kind==='folder')return selected.node;
    if(selected.node.kind==='item'&&selected.parent&&selected.parent.kind==='folder')return selected.parent;
  }
  return projectTree.find(root=>root.id===rootId);
}

function getFolderTarget(){
  const selected=findNode(selectedNodeId);
  if(!selected)return null;
  if(selected.node.kind==='root'||selected.node.kind==='folder')return selected.node;
  if(selected.node.kind==='item')return selected.parent;
  return null;
}

function nextDefaultName(itemType){
  const def=ITEM_DEFINITIONS[itemType];
  let count=0;
  walkNodes(projectTree,node=>{if(node.kind==='item'&&node.itemType===itemType)count+=1;});
  return `${def.label} ${count+1}`;
}

function startInlineRename(nodeId){
  requestAnimationFrame(()=>{
    const row=projectTreeElement.querySelector(`[data-node-id="${CSS.escape(nodeId)}"] .tree-folder-name, [data-node-id="${CSS.escape(nodeId)}"] .tree-item-name`);
    if(!row)return;
    const found=findNode(nodeId);
    if(!found)return;
    const input=document.createElement('input');
    input.className='tree-rename-input';
    input.value=found.node.label;
    row.replaceWith(input);
    input.focus();
    input.select();
    let finished=false;
    const commit=()=>{
      if(finished)return;
      finished=true;
      const value=input.value.trim();
      if(value)found.node.label=value;
      saveProjectTree();
      renderProjectTree();
    };
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter')commit();
      if(event.key==='Escape'){finished=true;renderProjectTree();}
    });
    input.addEventListener('blur',commit,{once:true});
  });
}

function createProjectEntry(createType){
  if(createType==='folder'){
    const target=getFolderTarget();
    if(!target)return;
    const folder={id:createId('folder'),kind:'folder',label:'New Folder',rootId:target.kind==='root'?target.id:target.rootId,open:true,children:[]};
    target.children.push(folder);
    target.open=true;
    selectedNodeId=folder.id;
    saveProjectTree();
    renderProjectTree();
    startInlineRename(folder.id);
    return;
  }
  const def=ITEM_DEFINITIONS[createType];
  if(!def)return;
  const target=getSelectedContainerForRoot(def.rootId);
  if(!target)return;
  const item={id:createId(createType),kind:'item',label:nextDefaultName(createType),rootId:def.rootId,itemType:createType};
  target.children.push(item);
  target.open=true;
  selectedNodeId=item.id;
  saveProjectTree();
  renderProjectTree();
  startInlineRename(item.id);
}

function positionCreateMenu(){
  const buttonRect=projectAddButton.getBoundingClientRect();
  projectCreateMenu.style.left=`${Math.max(8,buttonRect.right-242)}px`;
  projectCreateMenu.style.top=`${buttonRect.bottom+6}px`;
}

function openCreateMenu(){
  positionCreateMenu();
  projectCreateMenu.classList.add('open');
  projectCreateMenu.setAttribute('aria-hidden','false');
  projectAddButton.setAttribute('aria-expanded','true');
}

function closeCreateMenu(){
  projectCreateMenu.classList.remove('open');
  projectCreateMenu.setAttribute('aria-hidden','true');
  projectAddButton.setAttribute('aria-expanded','false');
}

projectTreeElement.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');
  if(!target)return;
  const {action,nodeId}=target.dataset;
  if(action==='toggle')toggleNode(nodeId);
  if(action==='select')selectNode(nodeId);
  if(action==='delete')deleteNode(nodeId);
});

projectTreeElement.addEventListener('dblclick',event=>{
  const nodeElement=event.target.closest('[data-node-id]');
  if(!nodeElement)return;
  const found=findNode(nodeElement.dataset.nodeId);
  if(found&&found.node.kind!=='root')startInlineRename(found.node.id);
});

projectAddButton.addEventListener('click',event=>{
  event.stopPropagation();
  projectCreateMenu.classList.contains('open')?closeCreateMenu():openCreateMenu();
});

projectCreateMenu.addEventListener('click',event=>{
  const button=event.target.closest('[data-create-type]');
  if(!button)return;
  createProjectEntry(button.dataset.createType);
  closeCreateMenu();
});

document.addEventListener('click',event=>{
  if(!projectCreateMenu.contains(event.target)&&event.target!==projectAddButton)closeCreateMenu();
});
window.addEventListener('resize',()=>{if(projectCreateMenu.classList.contains('open'))positionCreateMenu();});

function startPlay(){
  playStageCopy.innerHTML='';
  const clone=roomStage.cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelectorAll('.selected-object').forEach(element=>element.classList.remove('selected-object'));
  clone.querySelectorAll('.selection-label,.hotspot-door span').forEach(element=>element.remove());
  playStageCopy.appendChild(clone);
  playOverlay.classList.add('open');
  playOverlay.setAttribute('aria-hidden','false');
}
function stopPlay(){playOverlay.classList.remove('open');playOverlay.setAttribute('aria-hidden','true');playStageCopy.innerHTML='';}
playButton.addEventListener('click',startPlay);
stopButton.addEventListener('click',stopPlay);
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(playOverlay.classList.contains('open'))stopPlay();else closeCreateMenu();}});

document.querySelectorAll('.mode-tab').forEach(tab=>tab.addEventListener('click',()=>{document.querySelectorAll('.mode-tab').forEach(item=>item.classList.remove('active'));tab.classList.add('active');}));
document.querySelectorAll('.bottom-tab').forEach(tab=>tab.addEventListener('click',()=>{document.querySelectorAll('.bottom-tab').forEach(item=>item.classList.remove('active'));tab.classList.add('active');}));

const panelLimits={project:{min:170,max:420,storage:STORAGE_KEYS.projectWidth,css:'--project-width'},inspector:{min:220,max:480,storage:STORAGE_KEYS.inspectorWidth,css:'--inspector-width'}};
function clamp(value,min,max){return Math.min(Math.max(value,min),max);}
function restorePanelWidths(){Object.values(panelLimits).forEach(panel=>{const stored=Number(localStorage.getItem(panel.storage));if(Number.isFinite(stored)&&stored>0)document.documentElement.style.setProperty(panel.css,`${clamp(stored,panel.min,panel.max)}px`);});}
function setupResizer(elementId,side){
  const handle=document.getElementById(elementId);if(!handle)return;
  const panel=panelLimits[side];let startX=0;let startWidth=0;let pointerId=null;
  const onMove=event=>{if(pointerId===null)return;const delta=event.clientX-startX;const width=side==='project'?startWidth+delta:startWidth-delta;document.documentElement.style.setProperty(panel.css,`${clamp(width,panel.min,panel.max)}px`);};
  const finish=()=>{if(pointerId===null)return;pointerId=null;handle.classList.remove('dragging');document.body.classList.remove('resizing-panels');const current=parseFloat(getComputedStyle(document.documentElement).getPropertyValue(panel.css));localStorage.setItem(panel.storage,String(Math.round(current)));window.removeEventListener('pointermove',onMove);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);};
  handle.addEventListener('pointerdown',event=>{pointerId=event.pointerId;startX=event.clientX;startWidth=side==='project'?document.querySelector('.sidebar').getBoundingClientRect().width:document.querySelector('.inspector').getBoundingClientRect().width;handle.classList.add('dragging');document.body.classList.add('resizing-panels');window.addEventListener('pointermove',onMove);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);});
  handle.addEventListener('dblclick',()=>{const defaultWidth=side==='project'?232:286;document.documentElement.style.setProperty(panel.css,`${defaultWidth}px`);localStorage.removeItem(panel.storage);});
}

restorePanelWidths();
renderProjectTree();
setupResizer('leftResizer','project');
setupResizer('rightResizer','inspector');