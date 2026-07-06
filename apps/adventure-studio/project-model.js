export const STORAGE_KEYS={tree:'adventureStudioProjectTreeV1',selection:'adventureStudioProjectSelectionV1',activeEditor:'adventureStudioActiveEditorV1',resources:'adventureStudioResourcesV1',settings:'adventureStudioGameSettingsV1',projectWidth:'adventureStudioProjectWidth',inspectorWidth:'adventureStudioInspectorWidth'};

const LEGACY_GAME_ID='game-main';
const PROJECT_NAME_KEY='adventureStudioProjectNameV1';

export const ROOTS=[{id:'games',label:'Games',itemType:'game',icon:'◆',fixed:true}];
export const TYPES={
  game:{label:'Game',editor:'Game',rootId:'games',icon:'◆'},
  room:{label:'Room',editor:'Room Editor',sectionKey:'rooms',icon:'▧'},
  character:{label:'Character',editor:'Character Editor',sectionKey:'characters',icon:'◉'},
  inventory:{label:'Inventory Element',editor:'Inventory Editor',sectionKey:'inventory',icon:'◇'},
  dialogue:{label:'Dialogue',editor:'Dialogue Editor',sectionKey:'dialogues',icon:'◌'},
  audio:{label:'Audio',editor:'Audio Editor',sectionKey:'audio',icon:'♪'}
};
export const GAME_SECTIONS=[
  {key:'settings',label:'Settings',icon:'⚙'},
  {key:'rooms',label:'Rooms',icon:'▧',itemType:'room'},
  {key:'characters',label:'Characters',icon:'◉',itemType:'character'},
  {key:'inventory',label:'Inventory',icon:'◇',itemType:'inventory'},
  {key:'dialogues',label:'Dialogues',icon:'◌',itemType:'dialogue'},
  {key:'audio',label:'Audio',icon:'♪',itemType:'audio'}
];
export const ROOM_SECTIONS=[
  {key:'backgrounds',label:'Backgrounds',accepts:'background',icon:'▣'},
  {key:'characters',label:'Characters',accepts:'character',icon:'◉'},
  {key:'objects',label:'Objects',accepts:'object',icon:'□'},
  {key:'inventory',label:'Inventory',accepts:'inventory',icon:'◇'},
  {key:'audio',label:'Audio',accepts:'audio',icon:'♪'},
  {key:'dialogues',label:'Dialogues',accepts:'dialogue',icon:'◌'},
  {key:'hotspots',label:'Hotspots',accepts:'hotspot',icon:'⌖'},
  {key:'walkAreas',label:'Walk Areas',accepts:'walkArea',icon:'⌁'},
  {key:'entrances',label:'Entrances',accepts:'entrance',icon:'⇥'}
];

export function uid(prefix){return`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;}
export function initialTree(){return[{id:'games',kind:'root',label:'Games',itemType:'game',open:true,children:[]}];}
export function createGameSections(gameId){return GAME_SECTIONS.map(def=>({id:`${gameId}:section:${def.key}`,kind:'game-section',label:def.label,sectionKey:def.key,itemType:def.itemType||null,icon:def.icon,gameId,open:def.key==='rooms',children:def.itemType?[]:undefined}));}
export function createRoomSections(roomId,gameId){return ROOM_SECTIONS.map(def=>({id:`${roomId}:section:${def.key}`,kind:'room-section',label:def.label,sectionKey:def.key,accepts:def.accepts,icon:def.icon,roomId,gameId,open:false,children:[]}));}

function normalizeReference(node,roomId,gameId,section){
  if(!node||node.kind!=='reference'||typeof node.resourceId!=='string'||node.itemType!==section.accepts)return null;
  return{id:node.id||uid('ref'),kind:'reference',resourceId:node.resourceId,itemType:node.itemType,roomId,gameId,sectionKey:section.key};
}

function normalizeRoomSections(roomId,gameId,children){
  const saved=Array.isArray(children)?children:[];
  return ROOM_SECTIONS.map(def=>{
    const old=saved.find(node=>node?.kind==='room-section'&&node.sectionKey===def.key);
    return{id:`${roomId}:section:${def.key}`,kind:'room-section',label:def.label,sectionKey:def.key,accepts:def.accepts,icon:def.icon,roomId,gameId,open:old?.open===true,children:Array.isArray(old?.children)?old.children.map(child=>normalizeReference(child,roomId,gameId,def)).filter(Boolean):[]};
  });
}

function normalizeGameChild(node,gameId,section){
  if(!node||typeof node!=='object'||typeof node.id!=='string'||typeof node.label!=='string')return null;
  if(node.kind==='folder')return{id:node.id,kind:'folder',label:node.label,rootId:'games',gameId,sectionKey:section.key,itemType:section.itemType,open:node.open===true,children:Array.isArray(node.children)?node.children.map(child=>normalizeGameChild(child,gameId,section)).filter(Boolean):[]};
  if(node.kind!=='item'||node.itemType!==section.itemType)return null;
  const item={id:node.id,kind:'item',label:node.label,rootId:'games',gameId,sectionKey:section.key,itemType:section.itemType};
  if(item.itemType==='room'){
    item.open=node.open===true;
    item.children=normalizeRoomSections(item.id,gameId,node.children);
  }
  return item;
}

function normalizeGameSections(gameId,children){
  const saved=Array.isArray(children)?children:[];
  return GAME_SECTIONS.map(def=>{
    const old=saved.find(node=>node?.kind==='game-section'&&node.sectionKey===def.key);
    const section={id:`${gameId}:section:${def.key}`,kind:'game-section',label:def.label,sectionKey:def.key,itemType:def.itemType||null,icon:def.icon,gameId,open:old?.open===true};
    if(def.itemType)section.children=Array.isArray(old?.children)?old.children.map(child=>normalizeGameChild(child,gameId,def)).filter(Boolean):[];
    return section;
  });
}

function normalizeGame(node){
  if(!node||node.kind!=='item'||node.itemType!=='game'||typeof node.id!=='string'||typeof node.label!=='string')return null;
  return{id:node.id,kind:'item',label:node.label,rootId:'games',itemType:'game',gameId:node.id,open:node.open===true,children:normalizeGameSections(node.id,node.children)};
}

function normalizeMultiGameTree(parsed){
  const root=parsed.find(node=>node?.id==='games'&&node.kind==='root');
  return[{id:'games',kind:'root',label:'Games',itemType:'game',open:root?.open!==false,children:Array.isArray(root?.children)?root.children.map(normalizeGame).filter(Boolean):[]}];
}

function migrateLegacyNode(node,gameId,section){
  if(!node||typeof node!=='object'||typeof node.id!=='string'||typeof node.label!=='string')return null;
  if(node.kind==='folder')return{id:node.id,kind:'folder',label:node.label,rootId:'games',gameId,sectionKey:section.key,itemType:section.itemType,open:node.open===true,children:Array.isArray(node.children)?node.children.map(child=>migrateLegacyNode(child,gameId,section)).filter(Boolean):[]};
  if(node.kind!=='item')return null;
  const item={id:node.id,kind:'item',label:node.label,rootId:'games',gameId,sectionKey:section.key,itemType:section.itemType};
  if(item.itemType==='room'){
    item.open=node.open===true;
    item.children=normalizeRoomSections(item.id,gameId,node.children);
  }
  return item;
}

function migrateLegacyTree(parsed){
  const gameId=LEGACY_GAME_ID;
  const gameLabel=localStorage.getItem(PROJECT_NAME_KEY)||'Game 1';
  const sections=GAME_SECTIONS.map(def=>{
    const oldRoot=parsed.find(node=>node?.id===def.key&&node.kind==='root');
    const oldSettings=parsed.find(node=>node?.id==='game'&&node.kind==='root')?.children?.find(node=>node?.sectionKey===def.key);
    const section={id:`${gameId}:section:${def.key}`,kind:'game-section',label:def.label,sectionKey:def.key,itemType:def.itemType||null,icon:def.icon,gameId,open:def.key==='settings'?false:(oldRoot?.open===true)};
    if(def.itemType)section.children=Array.isArray(oldRoot?.children)?oldRoot.children.map(child=>migrateLegacyNode(child,gameId,def)).filter(Boolean):[];
    else if(oldSettings)section.open=oldSettings.open===true;
    return section;
  });
  const result=[{id:'games',kind:'root',label:'Games',itemType:'game',open:true,children:[{id:gameId,kind:'item',label:gameLabel,rootId:'games',itemType:'game',gameId,open:true,children:sections}]}];
  migrateLegacyPointers();
  localStorage.setItem(STORAGE_KEYS.tree,JSON.stringify(result));
  return result;
}

function migrateLegacyPointers(){
  const map=id=>{
    if(!id)return id;
    if(id==='game')return LEGACY_GAME_ID;
    if(id==='game:section:settings')return`${LEGACY_GAME_ID}:section:settings`;
    if(GAME_SECTIONS.some(def=>def.key===id))return`${LEGACY_GAME_ID}:section:${id}`;
    return id;
  };
  const selected=localStorage.getItem(STORAGE_KEYS.selection);
  const active=localStorage.getItem(STORAGE_KEYS.activeEditor);
  if(selected)localStorage.setItem(STORAGE_KEYS.selection,map(selected));
  if(active)localStorage.setItem(STORAGE_KEYS.activeEditor,map(active));
}

export function loadTree(){
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEYS.tree)||'null');
    if(!Array.isArray(parsed))return initialTree();
    if(parsed.some(node=>node?.id==='games'&&node.kind==='root'))return normalizeMultiGameTree(parsed);
    return migrateLegacyTree(parsed);
  }catch{return initialTree();}
}

function defaultGameResource(id){return{id,type:'game',settings:{width:1280,height:720},rooms:{},characters:{},inventory:{},dialogues:{},audio:{}};}
function normalizeGameResource(id,resource){
  const game=resource&&typeof resource==='object'?resource:defaultGameResource(id);
  game.id=id;game.type='game';
  game.settings={width:Number(game.settings?.width)||1280,height:Number(game.settings?.height)||720};
  game.rooms=game.rooms&&typeof game.rooms==='object'?game.rooms:{};
  game.characters=game.characters&&typeof game.characters==='object'?game.characters:{};
  game.inventory=game.inventory&&typeof game.inventory==='object'?game.inventory:{};
  game.dialogues=game.dialogues&&typeof game.dialogues==='object'?game.dialogues:{};
  game.audio=game.audio&&typeof game.audio==='object'?game.audio:{};
  return game;
}

function migrateLegacyResources(resources){
  const legacySettings=(()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)||'null');}catch{return null;}})();
  const game=defaultGameResource(LEGACY_GAME_ID);
  game.settings={width:Number(legacySettings?.width)||1280,height:Number(legacySettings?.height)||720};
  game.rooms=resources?.rooms&&typeof resources.rooms==='object'?resources.rooms:{};
  game.characters=resources?.characters&&typeof resources.characters==='object'?resources.characters:{};
  game.inventory=resources?.inventory&&typeof resources.inventory==='object'?resources.inventory:{};
  game.dialogues=resources?.dialogues&&typeof resources.dialogues==='object'?resources.dialogues:{};
  game.audio=resources?.audio&&typeof resources.audio==='object'?resources.audio:{};
  const migrated={games:{[LEGACY_GAME_ID]:normalizeGameResource(LEGACY_GAME_ID,game)}};
  localStorage.setItem(STORAGE_KEYS.resources,JSON.stringify(migrated));
  return migrated;
}

export function loadResources(){
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEYS.resources)||'null');
    if(parsed?.games&&typeof parsed.games==='object'){
      const games={};
      for(const[id,resource]of Object.entries(parsed.games))games[id]=normalizeGameResource(id,resource);
      return{games};
    }
    return migrateLegacyResources(parsed||{});
  }catch{return{games:{}};}
}

export function walk(nodes,visitor,parent=null,rootId=null){for(const node of nodes){const current=node.kind==='root'?node.id:rootId;if(visitor(node,parent,current)===false)return false;if(Array.isArray(node.children)&&walk(node.children,visitor,node,current)===false)return false;}return true;}
export function findNode(tree,id){let found=null;walk(tree,(node,parent,rootId)=>{if(node.id===id){found={node,parent,rootId};return false;}});return found;}
export function bucketFor(type){return type==='room'?'rooms':type==='character'?'characters':type==='inventory'?'inventory':type==='dialogue'?'dialogues':type==='audio'?'audio':null;}
export function ensureGameResource(resources,gameOrId){const id=typeof gameOrId==='string'?gameOrId:gameOrId?.gameId||gameOrId?.id;if(!id)return null;resources.games??={};resources.games[id]=normalizeGameResource(id,resources.games[id]);return resources.games[id];}
export function getGameResource(resources,gameId){return resources?.games?.[gameId]||null;}
export function ensureResource(resources,node){
  if(!node||node.kind!=='item')return null;
  if(node.itemType==='game')return ensureGameResource(resources,node.id);
  const game=ensureGameResource(resources,node.gameId);if(!game)return null;
  const bucket=bucketFor(node.itemType);if(!bucket)return null;
  if(!game[bucket][node.id])game[bucket][node.id]=node.itemType==='room'?{id:node.id,type:'room',backgrounds:[],defaultBackgroundId:null}:{id:node.id,type:node.itemType};
  const resource=game[bucket][node.id];
  if(node.itemType==='room'){
    resource.backgrounds=Array.isArray(resource.backgrounds)?resource.backgrounds:[];
    if(resource.background&&resource.backgrounds.length===0){
      const legacyId=`${node.id}:background:default`;
      resource.backgrounds.push({id:legacyId,name:resource.background.name||'Default',assetKey:node.id,width:resource.background.width,height:resource.background.height,type:resource.background.type,size:resource.background.size,zoom:resource.zoom||100,scaleMode:resource.scaleMode||'manual'});
      resource.defaultBackgroundId=legacyId;delete resource.background;delete resource.zoom;delete resource.scaleMode;
    }
    if(!resource.defaultBackgroundId&&resource.backgrounds[0])resource.defaultBackgroundId=resource.backgrounds[0].id;
  }
  return resource;
}
export function removeReferencesTo(tree,resourceId){walk(tree,node=>{if(Array.isArray(node.children))node.children=node.children.filter(child=>!(child.kind==='reference'&&child.resourceId===resourceId));});}
export function createReference(section,resourceNode){if(section.kind!=='room-section'||resourceNode.kind!=='item'||section.gameId!==resourceNode.gameId||section.accepts!==resourceNode.itemType)return null;if(section.children.some(reference=>reference.resourceId===resourceNode.id))return null;return{id:uid('ref'),kind:'reference',resourceId:resourceNode.id,itemType:resourceNode.itemType,roomId:section.roomId,gameId:section.gameId,sectionKey:section.sectionKey};}
export function saveProject({tree,resources,selectedId,activeEditorId}){localStorage.setItem(STORAGE_KEYS.tree,JSON.stringify(tree));localStorage.setItem(STORAGE_KEYS.resources,JSON.stringify(resources));localStorage.setItem(STORAGE_KEYS.selection,selectedId);activeEditorId?localStorage.setItem(STORAGE_KEYS.activeEditor,activeEditorId):localStorage.removeItem(STORAGE_KEYS.activeEditor);}
