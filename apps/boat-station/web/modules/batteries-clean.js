import {createBatteriesModule as createLegacyBatteriesModule} from './batteries.js';

try{
  const params=new URLSearchParams(location.search);
  const local=params.get('mode')==='station'||!!window.CoreBridge||!!window.BoatStationCore||!!window.NativeBridge;
  const station=localStorage.getItem('bs.remote.activeStation')||'default';
  const key=local?'bs.pageLayout.local.v2':`bs.pageLayout.remote.${station}.v2`;
  const marker=`${key}.batteriesCleanPages`;
  if(localStorage.getItem(marker)!=='1'){
    const value=JSON.parse(localStorage.getItem(key)||'null');
    if(value&&typeof value==='object'){
      if(value.contentHeights&&typeof value.contentHeights==='object')delete value.contentHeights.batteries;
      if(value.pages&&typeof value.pages==='object')value.pages.batteries=0;
      localStorage.setItem(key,JSON.stringify(value));
    }
    localStorage.setItem(marker,'1');
  }
}catch{}

export function createBatteriesModule(requestRender,openManager){
  const base=createLegacyBatteriesModule(requestRender,openManager);
  const pageMap=[0,2,3];
  return{
    ...base,
    pages:3,
    page(index){return base.page(pageMap[index]);},
    afterRender(root){base.afterRender?.(root);}
  };
}
