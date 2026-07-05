import{STORAGE_KEYS,TYPES,bucketFor,ensureResource,findNode,loadResources,loadSettings,loadTree,removeReferencesTo,saveProject}from'./project-model.js';
import{createProjectTreeController}from'./project-tree.js';
import{createRoomEditor}from'./room-editor.js';
import{roomBackgroundStore}from'./asset-store.js';

const els={tree:document.getElementById('projectTree'),menu:document.getElementById('treeCreateMenu'),context:document.getElementById('contextPill'),empty:document.getElementById('workspaceEmpty'),workspace:document.getElementById('editorWorkspace'),editorIcon:document.getElementById('editorIcon'),editorKind:document.getElementById('editorKind'),editorTitle:document.getElementById('editorTitle'),editorStatus:document.getElementById('editorStatus'),placeholder:document.getElementById('editorPlaceholder'),placeholderIcon:document.getElementById('placeholderIcon'),placeholderTitle:document.getElementById('placeholderTitle'),placeholderText:document.getElementById('placeholderText'),roomEditor:document.getElementById('roomEditor'),roomCanvasShell:document.getElementById('roomCanvasShell'),roomCanvasEmpty:document.getElementById('roomCanvasEmpty'),roomCanvasStage:document.getElementById('roomCanvasStage'),roomBackgroundImage:document.getElementById('roomBackgroundImage'),roomZoomRange:document.getElementById('roomZoomRange'),roomZoomOutput:document.getElementById('roomZoomOutput'),importBackgroundButton:document.getElementById('importBackgroundButton'),emptyImportBackgroundButton:document.getElementById('emptyImportBackgroundButton'),fitRoomButton:document.getElementById('fitRoomButton'),backgroundFileInput:document.getElementById('backgroundFileInput'),inspectorEmpty:document.getElementById('inspectorEmpty'),inspectorContent:document.getElementById('inspectorContent'),inspectorTitle:document.getElementById('inspectorTitle'),inspectorResourceIcon:document.getElementById('inspectorResourceIcon'),inspectorResourceType:document.getElementById('inspectorResourceType'),inspectorResourceState:document.getElementById('inspectorResourceState'),inspectorResourceId:document.getElementById('inspectorResourceId'),inspectorResourceKind:document.getElementById('inspectorResourceKind'),projectResolutionSection:document.getElementById('projectResolutionSection'),gameWidthInput:document.getElementById('gameWidthInput'),gameHeightInput:document.getElementById('gameHeightInput'),roomPropertiesSection:document.getElementById('roomPropertiesSection'),roomImageName:document.getElementById('roomImageName'),roomImageWidth:document.getElementById('roomImageWidth'),roomImageHeight:document.getElementById('roomImageHeight'),roomZoomInput:document.getElementById('roomZoomInput'),roomScaleMode:document.getElementById('roomScaleMode'),replaceBackgroundButton:document.getElementById('replaceBackgroundButton'),removeBackgroundButton:document.getElementById('removeBackgroundButton'),genericEditorSection:document.getElementById('genericEditorSection')};

let tree=loadTree();
let resources=loadResources();
let settings=loadSettings();
let selectedId=localStorage.getItem(STORAGE_KEYS.selection)||'rooms';
let activeEditorId=localStorage.getItem(STORAGE_KEYS.activeEditor)||null;

const save=()=>saveProject({tree,resources,settings,selectedId,activeEditorId});
const getActiveNode=()=>findNode(tree,activeEditorId)?.node||null;

const roomEditor=createRoomEditor({els,getActiveNode,getResources:()=>resources,save,renderWorkspace:()=>renderWorkspace(),assets:roomBackgroundStore});

async function renderWorkspace(){
  const active=findNode(tree,activeEditorId);
  if(!active||active.node.kind!=='item'){
    activeEditorId=null;
    els.empty.hidden=false;
    els.workspace.hidden=true;
    els.inspectorEmpty.hidden=false;
    els.inspectorContent.hidden=true;
    els.context.innerHTML=`<span class="dot"></span> ${escapeHtml(findNode(tree,selectedId)?.node.label||'Project')}`;
    save();
    return;
  }
  const type=TYPES[active.node.itemType];
  const resource=ensureResource(resources,active.node);
  els.empty.hidden=true;
  els.workspace.hidden=false;
  els.editorIcon.textContent=type.icon;
  els.editorKind.textContent=type.editor;
  els.editorTitle.textContent=active.node.label;
  els.context.innerHTML=`<span class="dot"></span> ${escapeHtml(type.editor)} / ${escapeHtml(active.node.label)}`;
  els.inspectorEmpty.hidden=true;
  els.inspectorContent.hidden=false;
  els.inspectorTitle.textContent=active.node.label;
  els.inspectorResourceIcon.textContent=type.icon;
  els.inspectorResourceType.textContent=type.label;
  els.inspectorResourceState.textContent='Active project resource';
  els.inspectorResourceId.value=active.node.id;
  els.inspectorResourceKind.value=active.node.itemType;
  els.projectResolutionSection.hidden=active.node.itemType!=='room';
  els.roomPropertiesSection.hidden=active.node.itemType!=='room';
  els.genericEditorSection.hidden=active.node.itemType==='room';
  if(active.node.itemType==='room'){
    els.placeholder.hidden=true;
    els.roomEditor.hidden=false;
    els.editorStatus.textContent=`${settings.width} × ${settings.height}`;
    els.gameWidthInput.value=settings.width;
    els.gameHeightInput.value=settings.height;
    await roomEditor.render(resource);
  }else{
    els.roomEditor.hidden=true;
    els.placeholder.hidden=false;
    els.placeholderIcon.textContent=type.icon;
    els.placeholderTitle.textContent=type.editor;
    els.placeholderText.textContent=`${type.editor} is ready for its specialized tools.`;
    els.editorStatus.textContent='Editor shell';
  }
  save();
}

function openEditor(id){const found=findNode(tree,id);if(!found||found.node.kind!=='item')return;ensureResource(resources,found.node);activeEditorId=id;selectedId=id;save();treeController.render();renderWorkspace();}

function deleteResourceTree(node){
  const visit=current=>{
    if(current.kind==='item'){
      const bucket=bucketFor(current.itemType);
      delete resources[bucket]?.[current.id];
      removeReferencesTo(tree,current.id);
      if(current.itemType==='room')roomBackgroundStore.remove(current.id).catch(()=>{});
      if(activeEditorId===current.id)activeEditorId=null;
    }
    if(Array.isArray(current.children))current.children.forEach(visit);
  };
  visit(node);
}

const treeController=createProjectTreeController({treeElement:els.tree,menuElement:els.menu,getTree:()=>tree,getSelectedId:()=>selectedId,setSelectedId:id=>{selectedId=id;},save:()=>{save();renderWorkspace();},openEditor,onDeleteResource:deleteResourceTree});

els.gameWidthInput.addEventListener('change',()=>{settings.width=Math.max(160,Math.min(7680,Number(els.gameWidthInput.value)||1280));save();renderWorkspace();});
els.gameHeightInput.addEventListener('change',()=>{settings.height=Math.max(120,Math.min(4320,Number(els.gameHeightInput.value)||720));save();renderWorkspace();});

const panelLimits={project:{min:170,max:420,key:STORAGE_KEYS.projectWidth,css:'--project-width'},inspector:{min:220,max:480,key:STORAGE_KEYS.inspectorWidth,css:'--inspector-width'}};
function clamp(v,min,max){return Math.min(Math.max(v,min),max);}
function restoreWidths(){Object.values(panelLimits).forEach(p=>{const v=Number(localStorage.getItem(p.key));if(Number.isFinite(v)&&v>0)document.documentElement.style.setProperty(p.css,`${clamp(v,p.min,p.max)}px`);});}
function setupResizer(id,side){const handle=document.getElementById(id),panel=panelLimits[side];let startX=0,startWidth=0,active=false;const move=e=>{if(!active)return;const delta=e.clientX-startX;document.documentElement.style.setProperty(panel.css,`${clamp(side==='project'?startWidth+delta:startWidth-delta,panel.min,panel.max)}px`);};const end=()=>{if(!active)return;active=false;handle.classList.remove('dragging');document.body.classList.remove('resizing-panels');const current=parseFloat(getComputedStyle(document.documentElement).getPropertyValue(panel.css));localStorage.setItem(panel.key,String(Math.round(current)));removeEventListener('pointermove',move);removeEventListener('pointerup',end);};handle.addEventListener('pointerdown',e=>{active=true;startX=e.clientX;startWidth=(side==='project'?document.querySelector('.sidebar'):document.querySelector('.inspector')).getBoundingClientRect().width;handle.classList.add('dragging');document.body.classList.add('resizing-panels');addEventListener('pointermove',move);addEventListener('pointerup',end);});handle.addEventListener('dblclick',()=>{const value=side==='project'?232:286;document.documentElement.style.setProperty(panel.css,`${value}px`);localStorage.removeItem(panel.key);});}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

restoreWidths();
roomEditor.bind();
treeController.bind();
treeController.render();
renderWorkspace();
setupResizer('leftResizer','project');
setupResizer('rightResizer','inspector');