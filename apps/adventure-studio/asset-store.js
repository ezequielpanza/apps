function openDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open('AdventureStudioAssets',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('roomBackgrounds'))request.result.createObjectStore('roomBackgrounds');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}

async function readLocal(id){const db=await openDb();const value=await new Promise((resolve,reject)=>{const request=db.transaction('roomBackgrounds','readonly').objectStore('roomBackgrounds').get(id);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});db.close();return value;}
async function writeLocal(id,blob){const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction('roomBackgrounds','readwrite');tx.objectStore('roomBackgrounds').put(blob,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}
async function removeLocal(id){const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction('roomBackgrounds','readwrite');tx.objectStore('roomBackgrounds').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}

async function fetchBundledBlob(sourceUrl,sourceEncoding,mimeType='application/octet-stream'){
  const response=await fetch(sourceUrl,{cache:'no-store'});if(!response.ok)throw new Error(`Unable to load bundled asset: ${response.status}`);
  if(sourceEncoding==='base64'){
    const encoded=(await response.text()).replace(/\s+/g,'');
    const binary=atob(encoded);const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return new Blob([bytes],{type:mimeType});
  }
  return response.blob();
}

export const roomBackgroundStore={
  async put(id,blob){await writeLocal(id,blob);},
  async get(id,sourceUrl=null,sourceEncoding=null,mimeType='application/octet-stream'){
    const local=await readLocal(id);if(local)return local;
    if(!sourceUrl)return null;
    const bundled=await fetchBundledBlob(sourceUrl,sourceEncoding,mimeType);
    await writeLocal(id,bundled);
    return bundled;
  },
  async remove(id){await removeLocal(id);}
};
