import{STORAGE_KEYS,TYPES,bucketFor,ensureResource,findNode,loadResources,loadSettings,loadTree,removeReferencesTo,saveProject}from'./project-model.js';
import{createProjectTreeController}from'./project-tree.js';
import{createRoomEditor}from'./room-editor.js';
import{createBackgroundEditor}from'./background-editor.js';
import{createGameSettingsEditor}from'./game-settings-editor.js';
import{roomBackgroundStore}from'./asset-store.js';
import{bootstrapBundledProject,getCurrentProjectName}from'./bundled-project.js';
import{STARTUP_PROJECT_URL}from'./startup-project.js';

try{await bootstrapBundledProject(STARTUP_PROJECT_URL);}catch(error){console.error('Unable to bootstrap startup project',error);}

const els={projectSubtitle:document.getElementById('projectSubtitle'),tree:document.getElementById('projectTree'),menu:document.getElementById('treeCreateMenu'),context:document.getElementById('contextPill'),empty:document.getElementById('workspaceEmpty'),workspace:document.getElementById('editorWorkspace'),editorIcon:document.getElementById('editorIcon'),editorKind:document.getElementById('editorKind'),editorTitle:document.getElementById('editorTitle'),editorStatus:document.getElementById('editorStatus'),placeholder:document.getElementById('editorPlaceholder'),placeholderIcon:document.getElementById('placeholderIcon'),placeholderTitle:document.getElementById('placeholderTitle'),placeholderText:document.getElementById('placeholderText'),gameSettingsEditor:document.getElementById('gameSettingsEditor'),gameSettingsWidthInput:document.getElementById('gameSettingsWidthInput'),gameSettingsHeightInput:document.getElementById('gameSettingsHeightInput'),gameSettingsResolutionPreview:document.getElementById('gameSettingsResolutionPreview'),gameSettingsInspectorSection:document.getElementById('gameSettingsInspectorSection'),gameSettingsInspectorWidth:document.getElementById('gameSettingsInspectorWidth'),gameSettingsInspectorHeight:document.getElementById('gameSettingsInspectorHeight'),roomEditor:document.getElementById('roomEditor'),roomCanvasShell:document.getElementById('roomCanvasShell'),roomCanvasEmpty:document.getElementById('roomCanvasEmpty'),roomCanvasStage:document.getElementById('roomCanvasStage'),roomBackgroundImage:document.getElementById('roomBackgroundImage'),roomZoomRange:document.getElementById('roomZoomRange'),roomZoomOutput:document.getElementById('roomZoomOutput'),importBackgroundButton:document.getElementById('importBackgroundButton'),emptyImportBackgroundButton:document.getElementById('emptyImportBackgroundButton'),fitRoomButton:document.getElementById('fitRoomButton'),backgroundFileInput:document.getElementById('backgroundFileInput'),backgroundEditor:document.getElementById('backgroundEditor'),addBackgroundStateButton:document.getElementById('addBackgroundStateButton'),backgroundCount:document.getElementById('backgroundCount'),backgroundList:document.getElementById('backgroundList'),backgroundEditorEmpty:document.getElementById('backgroundEditorEmpty'),backgroundEditorImportButton:document.getElementById('backgroundEditorImportButton'),backgroundPreviewPane:document.getElementById('backgroundPreviewPane'),backgroundPreviewImage:document.getElementById('backgroundPreviewImage'),backgroundStateFileInput:document.getElementById('backgroundStateFileInput'),inspectorEmpty:document.getElementById('inspectorEmpty'),inspectorContent:document.getElementById('inspectorContent'),inspectorTitle:document.getElementById('inspectorTitle'),inspectorResourceIcon:document.getElementById('inspectorResourceIcon'),inspectorResourceType:document.getElementById('inspectorResourceType'),inspectorResourceState:document.getElementById('inspectorResourceState'),resourceSection:document.getElementById('resourceSection'),inspectorResourceId:document.getElementById('inspectorResourceId'),inspectorResourceKind:document.getElementById('inspectorResourceKind'),roomPropertiesSection:document.getElementById('roomPropertiesSection'),roomImageName:document.getElementById('roomImageName'),roomImageWidth:document.getElementById('roomImageWidth'),roomImageHeight:document.getElementById('roomImageHeight'),roomZoomInput:document.getElementById('roomZoomInput'),roomScaleMode:document.getElementById('roomScaleMode'),replaceBackgroundButton:document.getElementById('replaceBackgroundButton'),removeBackgroundButton:document.getElementById('removeBackgroundButton'),backgroundInspectorSection:document.getElementById('backgroundInspectorSection'),backgroundNameInput:document.getElementById('backgroundNameInput'),backgroundDimensions:document.getElementById('backgroundDimensions'),backgroundDefaultCheck:document.getElementById('backgroundDefaultCheck'),deleteBackgroundStateButton:document.getElementById('deleteBackgroundStateButton'),genericEditorSection:document.getElementById('genericEditorSection')};

let tree=loadTree();
let resources=loadResources();
let settings=loadSettings();
let selectedId=localStorage.getItem(STORAGE_KEYS.selection)||'game';
let activeEditorId=localStorage.getItem(STORAGE_KEYS.activeEditor)||null;

els.projectSubtitle.textContent=getCurrentProjectName();

const save=()=>saveProject({tree,resources,settings,selectedId,activeEditorId});
const getActiveNode=()=>findNode(tree,activeEditorId)?.node||null;
const roomEditor=createRoomEditor({els,getActiveNode,getResources:()=>resources,save,renderWorkspace:()=>renderWorkspace(),assets:roomBackgroundStore});
const backgroundEditor=createBackgroundEditor({els,getTree:()=>tree,getActiveSection:()=>{const node=getActiveNode();return node?.kind==='room-section'?node:null;},getResources:()=>resources,save,assets:roomBackgroundStore,renderWorkspace:()=>renderWorkspace()});
const gameSettingsEditor=createGameSettingsEditor({els,getSettings:()=>settings,save,renderWorkspace:()=>renderWorkspace()});

function hideAllEditors(){els.placeholder.hidden=true;els.gameSettingsEditor.hidden=true;els.roomEditor.hidden=true;els.backgroundEditor.hidden=true;}
function showInspector(){els.inspectorEmpty.hidden=true;els.inspectorContent.hidden=false;}
function hideInspectorSections(){els.resourceSection.hidden=true;els.gameSettingsInspectorSection.hidden=true;els.roomPropertiesSection.hidden=true;els.backgroundInspectorSection.hidden=true;els.genericEditorSection.hidden=true;}

async function renderWorkspace(){
  const active=findNode(tree,activeEditorId);
  if(!active){activeEditorId=null;els.empty.hidden=false;els.workspace.hidden=true;els.inspectorEmpty.hidden=false;els.inspectorContent.hidden=true;els.context.innerHTML=`<span class="dot"></span> ${escapeHtml(findNode(tree,selectedId)?.node.label||'Project')}`;save();return;}

  els.empty.hidden=true;els.workspace.hidden=false;hideAllEditors();showInspector();hideInspectorSections();

  if(active.node.kind==='game-section'&&active.node.sectionKey==='settings'){
    els.editorIcon.textContent='⚙';
    els.editorKind.textContent='Game Settings Editor';
    els.editorTitle.textContent='Settings';
    els.editorStatus.textContent=`${settings.width} × ${settings.height}`;
    els.context.innerHTML='<span class="dot"></span> Game / Settings';
    els.gameSettingsEditor.hidden=false;
    els.inspectorTitle.textContent='Settings';
    els.inspectorResourceIcon.textContent='⚙';
    els.inspectorResourceType.textContent='Game Settings';
    els.inspectorResourceState.textContent='Global game configuration';
    els.gameSettingsInspectorSection.hidden=false;
    gameSettingsEditor.render();
    save();return;
  }

  if(active.node.kind==='room-section'&&active.node.sectionKey==='backgrounds'){
    const room=findNode(tree,active.node.roomId)?.node;if(!room){activeEditorId=null;return renderWorkspace();}
    const roomResource=ensureResource(resources,room);
    els.editorIcon.textContent='▣';els.editorKind.textContent='Background Editor';els.editorTitle.textContent=room.label;els.editorStatus.textContent=`${roomResource.backgrounds.length} state${roomResource.backgrounds.length===1?'':'s'}`;els.context.innerHTML=`<span class="dot"></span> Background Editor / ${escapeHtml(room.label)}`;els.backgroundEditor.hidden=false;
    els.inspectorTitle.textContent='Backgrounds';els.inspectorResourceIcon.textContent='▣';els.inspectorResourceType.textContent='Background States';els.inspectorResourceState.textContent=`Room / ${room.label}`;els.backgroundInspectorSection.hidden=false;
    await backgroundEditor.render();save();return;
  }

  if(active.node.kind!=='item'){activeEditorId=null;return renderWorkspace();}
  const type=TYPES[active.node.itemType],resource=ensureResource(resources,active.node);
  els.editorIcon.textContent=type.icon;els.editorKind.textContent=type.editor;els.editorTitle.textContent=active.node.label;els.context.innerHTML=`<span class="dot"></span> ${escapeHtml(type.editor)} / ${escapeHtml(active.node.label)}`;
  els.inspectorTitle.textContent=active.node.label;els.inspectorResourceIcon.textContent=type.icon;els.inspectorResourceType.textContent=type.label;els.inspectorResourceState.textContent='Active project resource';els.inspectorResourceId.value=active.node.id;els.inspectorResourceKind.value=active.node.itemType;els.resourceSection.hidden=false;

  if(active.node.itemType==='room'){
    els.roomEditor.hidden=false;els.roomPropertiesSection.hidden=false;els.editorStatus.textContent=`${resource.backgrounds.length} background${resource.backgrounds.length===1?'':'s'}`;await roomEditor.render(resource);
  }else{
    els.placeholder.hidden=false;els.genericEditorSection.hidden=false;els.placeholderIcon.textContent=type.icon;els.placeholderTitle.textContent=type.editor;els.placeholderText.textContent=`${type.editor} is ready for its specialized tools.`;els.editorStatus.textContent='Editor shell';
  }
  save();
}

function openEditor(id){const found=findNode(tree,id);if(!found||found.node.kind!=='item')return;ensureResource(resources,found.node);activeEditorId=id;selectedId=id;save();treeController.render();renderWorkspace();}
function openGameSectionEditor(id){const found=findNode(tree,id);if(!found||found.node.kind!=='game-section')return;activeEditorId=id;selectedId=id;save();treeController.render();renderWorkspace();}
function openRoomSectionEditor(id){const found=findNode(tree,id);if(!found||found.node.kind!=='room-section')return;activeEditorId=id;selectedId=id;save();treeController.render();renderWorkspace();}

function deleteResourceTree(node){
  const visit=current=>{
    if(current.kind==='item'){
      const bucket=bucketFor(current.itemType),resource=resources[bucket]?.[current.id];
      if(current.itemType==='room'&&resource?.backgrounds)resource.backgrounds.forEach(background=>roomBackgroundStore.remove(background.assetKey).catch(()=>{}));
      delete resources[bucket]?.[current.id];removeReferencesTo(tree,current.id);if(activeEditorId===current.id)activeEditorId=null;
    }
    if(Array.isArray(current.children))current.children.forEach(visit);
  };
  visit(node);
}

function getRoomSectionCount(section){
  if(section.sectionKey!=='backgrounds')return section.children.length;
  const room=findNode(tree,section.roomId)?.node;if(!room)return 0;
  return ensureResource(resources,room).backgrounds.length;
}

const treeController=createProjectTreeController({treeElement:els.tree,menuElement:els.menu,getTree:()=>tree,getSelectedId:()=>selectedId,setSelectedId:id=>{selectedId=id;},save:()=>{save();renderWorkspace();},openEditor,openGameSectionEditor,openRoomSectionEditor,onDeleteResource:deleteResourceTree,getRoomSectionCount});

const panelLimits={project:{min:170,max:420,key:STORAGE_KEYS.projectWidth,css:'--project-width'},inspector:{min:220,max:480,key:STORAGE_KEYS.inspectorWidth,css:'--inspector-width'}};
function clamp(value,min,max){return Math.min(Math.max(value,min),max);}
function restoreWidths(){Object.values(panelLimits).forEach(panel=>{const value=Number(localStorage.getItem(panel.key));if(Number.isFinite(value)&&value>0)document.documentElement.style.setProperty(panel.css,`${clamp(value,panel.min,panel.max)}px`);});}
function setupResizer(id,side){const handle=document.getElementById(id),panel=panelLimits[side];let startX=0,startWidth=0,active=false;const move=event=>{if(!active)return;const delta=event.clientX-startX;document.documentElement.style.setProperty(panel.css,`${clamp(side==='project'?startWidth+delta:startWidth-delta,panel.min,panel.max)}px`);};const end=()=>{if(!active)return;active=false;handle.classList.remove('dragging');document.body.classList.remove('resizing-panels');const current=parseFloat(getComputedStyle(document.documentElement).getPropertyValue(panel.css));localStorage.setItem(panel.key,String(Math.round(current)));removeEventListener('pointermove',move);removeEventListener('pointerup',end);};handle.addEventListener('pointerdown',event=>{active=true;startX=event.clientX;startWidth=(side==='project'?document.querySelector('.sidebar'):document.querySelector('.inspector')).getBoundingClientRect().width;handle.classList.add('dragging');document.body.classList.add('resizing-panels');addEventListener('pointermove',move);addEventListener('pointerup',end);});handle.addEventListener('dblclick',()=>{const value=side==='project'?232:286;document.documentElement.style.setProperty(panel.css,`${value}px`);localStorage.removeItem(panel.key);});}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}

restoreWidths();gameSettingsEditor.bind();roomEditor.bind();backgroundEditor.bind();treeController.bind();treeController.render();renderWorkspace();setupResizer('leftResizer','project');setupResizer('rightResizer','inspector');
