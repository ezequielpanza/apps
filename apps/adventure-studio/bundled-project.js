import{STORAGE_KEYS}from'./project-model.js';
import{roomBackgroundStore}from'./asset-store.js';

const PROJECT_NAME_KEY='adventureStudioProjectNameV1';
const PROJECT_ID_KEY='adventureStudioBundledProjectIdV1';

export async function bootstrapBundledProject(projectUrl,{forceDefault=false}={}){
  if(!projectUrl)return null;
  const module=await import(projectUrl);
  const project=module.default;
  if(!project?.id||!Array.isArray(project.tree)||!project.resources||!project.settings)return null;

  const currentProjectId=localStorage.getItem(PROJECT_ID_KEY);
  const hasProject=Boolean(localStorage.getItem(STORAGE_KEYS.tree));
  const shouldInitialize=forceDefault||!hasProject||!currentProjectId;
  const isCurrentBundle=currentProjectId===project.id;

  if(shouldInitialize){
    localStorage.setItem(STORAGE_KEYS.tree,JSON.stringify(project.tree));
    localStorage.setItem(STORAGE_KEYS.resources,JSON.stringify(project.resources));
    localStorage.setItem(STORAGE_KEYS.settings,JSON.stringify(project.settings));
    localStorage.setItem(STORAGE_KEYS.selection,project.selectedId||'rooms');
    if(project.activeEditorId)localStorage.setItem(STORAGE_KEYS.activeEditor,project.activeEditorId);else localStorage.removeItem(STORAGE_KEYS.activeEditor);
    localStorage.setItem(PROJECT_NAME_KEY,project.name||'Untitled Project');
    localStorage.setItem(PROJECT_ID_KEY,project.id);
  }

  if(shouldInitialize||isCurrentBundle){
    await hydrateBundledAssets(project,projectUrl);
  }

  return{
    projectName:localStorage.getItem(PROJECT_NAME_KEY)||project.name||'Untitled Project',
    projectId:localStorage.getItem(PROJECT_ID_KEY)||project.id
  };
}

export function getCurrentProjectName(){return localStorage.getItem(PROJECT_NAME_KEY)||'Untitled Project';}

async function hydrateBundledAssets(project,projectUrl){
  const assets=[];
  if(Array.isArray(project.assets))assets.push(...project.assets);
  Object.values(project.resources?.rooms||{}).forEach(room=>{
    (room.backgrounds||[]).forEach(background=>{
      if(background.sourceUrl)assets.push({
        assetKey:background.assetKey,
        url:background.sourceUrl,
        encoding:background.sourceEncoding,
        type:background.type
      });
    });
  });

  for(const asset of assets){
    const blob=await fetchAsset(asset,projectUrl);
    if(blob)await roomBackgroundStore.put(asset.assetKey,blob);
  }
}

async function fetchAsset(asset,projectUrl){
  const url=new URL(asset.url,projectUrl).href;
  const response=await fetch(url);
  if(!response.ok)throw new Error(`Unable to load bundled asset: ${url}`);

  if(asset.encoding==='base64'){
    const text=await response.text();
    return base64ToBlob(text.trim(),asset.type||'application/octet-stream');
  }

  return response.blob();
}

function base64ToBlob(base64,type){
  const binary=atob(base64);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type});
}
