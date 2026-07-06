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
  const shouldLoad=forceDefault||!hasProject||!currentProjectId;

  if(!shouldLoad){
    return{projectName:localStorage.getItem(PROJECT_NAME_KEY)||project.name||'Untitled Project',projectId:currentProjectId};
  }

  localStorage.setItem(STORAGE_KEYS.tree,JSON.stringify(project.tree));
  localStorage.setItem(STORAGE_KEYS.resources,JSON.stringify(project.resources));
  localStorage.setItem(STORAGE_KEYS.settings,JSON.stringify(project.settings));
  localStorage.setItem(STORAGE_KEYS.selection,project.selectedId||'rooms');
  if(project.activeEditorId)localStorage.setItem(STORAGE_KEYS.activeEditor,project.activeEditorId);else localStorage.removeItem(STORAGE_KEYS.activeEditor);
  localStorage.setItem(PROJECT_NAME_KEY,project.name||'Untitled Project');
  localStorage.setItem(PROJECT_ID_KEY,project.id);

  await loadBundledAssets(project,projectUrl);

  return{projectName:project.name||'Untitled Project',projectId:project.id};
}

export function getCurrentProjectName(){return localStorage.getItem(PROJECT_NAME_KEY)||'Untitled Project';}

async function loadBundledAssets(project,projectUrl){
  const assets=[];
  if(Array.isArray(project.assets))assets.push(...project.assets);
  Object.values(project.resources?.rooms||{}).forEach(room=>{
    (room.backgrounds||[]).forEach(background=>{
      if(background.sourceUrl)assets.push({assetKey:background.assetKey,url:background.sourceUrl,encoding:background.sourceEncoding,type:background.type});
    });
  });
  for(const asset of assets){
    const blob=await fetchAsset(asset,projectUrl);
    if(blob)await roomBackgroundStore.put(asset.assetKey,blob);
  }
}

async function fetchAsset(asset,projectUrl){
  const url=new URL(asset.url,projectUrl).href;
  if(asset.encoding==='base64'){
    const text=await fetch(url).then(response=>response.text());
    return base64ToBlob(text.trim(),asset.type||'application/octet-stream');
  }
  const response=await fetch(url);
  return response.ok?response.blob():null;
}

function base64ToBlob(base64,type){
  const binary=atob(base64);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type});
}
