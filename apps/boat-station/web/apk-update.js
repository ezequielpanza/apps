(function(){
  if(window.BoatStationApkUpdate)return;
  const params=new URLSearchParams(location.search);
  const isCore=params.get('mode')==='station'||!!window.CoreBridge||!!window.BoatStationCore||!!window.NativeBridge;
  if(!isCore)return;

  let installed='';
  let latest='';
  let checking=false;
  let lastCheck=0;

  function parts(v){return String(v||'').trim().split('.').map(x=>parseInt(x,10)||0)}
  function newer(a,b){
    const aa=parts(a),bb=parts(b),n=Math.max(aa.length,bb.length);
    for(let i=0;i<n;i++){const x=aa[i]||0,y=bb[i]||0;if(x!==y)return x>y}
    return false;
  }
  function menuInner(){return document.querySelector('#menuSheet .sheet-inner')}
  function removeRow(){document.querySelectorAll('[data-core-apk-update]').forEach(el=>el.remove())}
  function download(version){
    const path=`/BoatStation-${encodeURIComponent(version)}.apk`;
    const url=new URL(path,location.origin).href;
    try{if(window.CoreBridge&&typeof CoreBridge.downloadApk==='function'){CoreBridge.downloadApk(url);return}}catch(_){}
    try{location.href=url}catch(_){window.open(url,'_self')}
  }
  function render(){
    removeRow();
    if(!installed||!latest||!newer(latest,installed))return;
    const inner=menuInner();if(!inner)return;
    const button=document.createElement('button');
    button.type='button';
    button.className='option sheet-option';
    button.dataset.coreApkUpdate='1';
    button.innerHTML=`<span>Descargar nueva versión ${latest}<br><small class="sub">APK instalada: ${installed}</small></span>`;
    button.addEventListener('click',()=>download(latest));
    const title=inner.querySelector('h3');
    if(title&&title.nextSibling)inner.insertBefore(button,title.nextSibling);else inner.appendChild(button);
  }
  async function check(force=false){
    if(checking)return;
    const now=Date.now();if(!force&&now-lastCheck<5*60*1000)return;
    checking=true;lastCheck=now;
    try{
      const r=await fetch('/APK_VERSION?v='+now,{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
      if(r.ok){latest=(await r.text()).trim();render()}
    }catch(_){}finally{checking=false}
  }
  function capture(value){
    const v=String(value?.version||value?.apkVersion||'').trim();
    if(!v)return;
    installed=v;render();check(true);
  }
  function wrapPhone(){
    const api=window.BoatStation;if(!api||typeof api.updatePhone!=='function')return false;
    if(api.updatePhone.__apkUpdateWrapped)return true;
    const original=api.updatePhone;
    function wrapped(value){capture(value);return original.call(api,value)}
    wrapped.__apkUpdateWrapped=true;api.updatePhone=wrapped;return true;
  }
  try{if(window.CoreBridge&&typeof CoreBridge.getApkVersion==='function')installed=String(CoreBridge.getApkVersion()||'').trim()}catch(_){}
  if(!wrapPhone()){const timer=setInterval(()=>{if(wrapPhone())clearInterval(timer)},50);setTimeout(()=>clearInterval(timer),10000)}
  document.getElementById('menuBtn')?.addEventListener('click',()=>check(true),true);
  window.addEventListener('boatstation-core-ready',()=>{try{if(window.CoreBridge&&typeof CoreBridge.getApkVersion==='function')installed=String(CoreBridge.getApkVersion()||'').trim()}catch(_){}check(true)});
  window.addEventListener('focus',()=>check(false));
  setTimeout(()=>check(true),1000);
  window.BoatStationApkUpdate={check:()=>check(true),getInstalled:()=>installed,getLatest:()=>latest};
})();