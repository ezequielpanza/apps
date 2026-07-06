import{STORAGE_KEYS}from'./project-model.js';

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

  return{projectName:project.name||'Untitled Project',projectId:project.id};
}

export function getCurrentProjectName(){return localStorage.getItem(PROJECT_NAME_KEY)||'Untitled Project';}
