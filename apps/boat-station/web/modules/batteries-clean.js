import {createBatteriesModule as createLegacyBatteriesModule} from './batteries.js';

export function createBatteriesModule(requestRender,openManager){
  const base=createLegacyBatteriesModule(requestRender,openManager);
  const pageMap=[0,2,3];
  return{
    ...base,
    pages:3,
    page(index){
      const legacyIndex=pageMap[index];
      return base.page(legacyIndex);
    },
    afterRender(root){
      base.afterRender?.(root);
    }
  };
}
