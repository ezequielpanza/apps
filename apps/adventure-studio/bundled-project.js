import{STORAGE_KEYS}from'./project-model.js';
import{roomBackgroundStore}from'./asset-store.js';

const PROJECT_NAME_KEY='adventureStudioProjectNameV1';
const PROJECT_ID_KEY='adventureStudioBundledProjectIdV1';

export async function bootstrapBundledProject(projectUrl,{forceDefault=false}={}){
  if(!projectUrl)return null;
  const module=await import(projectUrl);
  const project=module.default;
  if(!project?.id||!Array.isArray(project.tree)||!project.resources?.games)return null;

  const currentProjectId=localStorage.getItem(PROJECT_ID_KEY);
  const hasProject=Boolean(localStorage.getItem(STORAGE_KEYS.tree));
  const shouldInitialize=forceDefault||!hasProject||!currentProjectId;
  const isCurrentBundle=currentProjectId===project.id;

  if(shouldInitialize)initializeProject(project);
  else if(isCurrentBundle)reconcileBundledResources(project);

  if(shouldInitialize||isCurrentBundle)await hydrateBundledAssets(project,projectUrl);

  return{projectName:localStorage.getItem(PROJECT_NAME_KEY)||project.name||'Untitled Project',projectId:localStorage.getItem(PROJECT_ID_KEY)||project.id};
}

export function getCurrentProjectName(){return localStorage.getItem(PROJECT_NAME_KEY)||'Untitled Project';}

function initializeProject(project){
  localStorage.setItem(STORAGE_KEYS.tree,JSON.stringify(project.tree));
  localStorage.setItem(STORAGE_KEYS.resources,JSON.stringify(project.resources));
  localStorage.removeItem(STORAGE_KEYS.settings);
  localStorage.setItem(STORAGE_KEYS.selection,project.selectedId||'games');
  if(project.activeEditorId)localStorage.setItem(STORAGE_KEYS.activeEditor,project.activeEditorId);else localStorage.removeItem(STORAGE_KEYS.activeEditor);
  localStorage.setItem(PROJECT_NAME_KEY,project.name||'Untitled Project');
  localStorage.setItem(PROJECT_ID_KEY,project.id);
}

function reconcileBundledResources(project){
  let localResources=parseStoredResources();if(!localResources)return;
  if(!localResources.games)localResources=migrateLegacyResources(localResources,project);
  localResources.games??={};

  for(const[gameId,bundledGame]of Object.entries(project.resources.games||{})){
    const localGame=localResources.games[gameId];if(!localGame)continue;
    localGame.settings=localGame.settings||bundledGame.settings||{width:1280,height:720};
    for(const bucket of['rooms','characters','inventory','dialogues','audio'])localGame[bucket]=localGame[bucket]&&typeof localGame[bucket]==='object'?localGame[bucket]:{};

    for(const[roomId,bundledRoom]of Object.entries(bundledGame.rooms||{})){
      const localRoom=localGame.rooms[roomId];if(!localRoom)continue;
      localRoom.backgrounds=Array.isArray(localRoom.backgrounds)?localRoom.backgrounds:[];
      for(const bundledBackground of bundledRoom.backgrounds||[])reconcileBackground(localRoom,bundledBackground);
      if(!localRoom.defaultBackgroundId||!localRoom.backgrounds.some(bg=>bg.id===localRoom.defaultBackgroundId)){
        const bundledDefault=(bundledRoom.backgrounds||[]).find(bg=>bg.id===bundledRoom.defaultBackgroundId);
        const localDefault=bundledDefault?findEquivalentBackground(localRoom.backgrounds,bundledDefault):localRoom.backgrounds[0];
        localRoom.defaultBackgroundId=localDefault?.id||null;
      }
    }
  }
  localStorage.setItem(STORAGE_KEYS.resources,JSON.stringify(localResources));
}

function migrateLegacyResources(legacy,project){
  const gameId=Object.keys(project.resources.games||{})[0]||'game-main';
  const bundledGame=project.resources.games?.[gameId]||{};
  let legacySettings=null;try{legacySettings=JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)||'null');}catch{}
  return{games:{[gameId]:{id:gameId,type:'game',settings:{width:Number(legacySettings?.width)||Number(bundledGame.settings?.width)||1280,height:Number(legacySettings?.height)||Number(bundledGame.settings?.height)||720},rooms:legacy.rooms||{},characters:legacy.characters||{},inventory:legacy.inventory||{},dialogues:legacy.dialogues||{},audio:legacy.audio||{}}}};
}

function reconcileBackground(localRoom,bundledBackground){
  const matches=localRoom.backgrounds.filter(bg=>backgroundsEquivalent(bg,bundledBackground));
  let target=matches.find(bg=>bg.id===bundledBackground.id)||matches[0]||null;
  if(!target){target={...bundledBackground};localRoom.backgrounds.push(target);}else{target.assetKey=bundledBackground.assetKey;target.sourceUrl=bundledBackground.sourceUrl;target.sourceEncoding=bundledBackground.sourceEncoding;target.type=bundledBackground.type||target.type;target.width=target.width||bundledBackground.width;target.height=target.height||bundledBackground.height;target.size=bundledBackground.size||target.size;target.zoom=Number(target.zoom)||Number(bundledBackground.zoom)||100;target.scaleMode=target.scaleMode||bundledBackground.scaleMode||'manual';}
  for(const duplicate of matches){if(duplicate===target)continue;if(localRoom.defaultBackgroundId===duplicate.id)localRoom.defaultBackgroundId=target.id;localRoom.backgrounds=localRoom.backgrounds.filter(bg=>bg!==duplicate);}
}

function findEquivalentBackground(backgrounds,bundledBackground){return backgrounds.find(bg=>backgroundsEquivalent(bg,bundledBackground))||null;}
function backgroundsEquivalent(a,b){if(!a||!b)return false;if(a.id&&b.id&&a.id===b.id)return true;return a.name===b.name&&Number(a.width)===Number(b.width)&&Number(a.height)===Number(b.height);}
function parseStoredResources(){try{return JSON.parse(localStorage.getItem(STORAGE_KEYS.resources)||'null');}catch{return null;}}

async function hydrateBundledAssets(project,projectUrl){
  const assets=[];
  if(Array.isArray(project.assets))assets.push(...project.assets);
  Object.values(project.resources.games||{}).forEach(game=>Object.values(game.rooms||{}).forEach(room=>(room.backgrounds||[]).forEach(background=>{if(background.sourceUrl)assets.push({assetKey:background.assetKey,url:background.sourceUrl,encoding:background.sourceEncoding,type:background.type});})));
  for(const asset of assets){const blob=await fetchAsset(asset,projectUrl);if(blob)await roomBackgroundStore.put(asset.assetKey,blob);}
}

async function fetchAsset(asset,projectUrl){const url=new URL(asset.url,projectUrl).href;const response=await fetch(url);if(!response.ok)throw new Error(`Unable to load bundled asset: ${url}`);if(asset.encoding==='base64'){const text=await response.text();return base64ToBlob(text.trim(),asset.type||'application/octet-stream');}return response.blob();}
function base64ToBlob(base64,type){const binary=atob(base64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new Blob([bytes],{type});}
