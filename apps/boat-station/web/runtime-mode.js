(function(){
  const params=new URLSearchParams(location.search);
  const native=!!window.CoreBridge||!!window.BoatStationCore||!!window.NativeBridge;
  function role(){
    const saved=localStorage.getItem('bs.runtime.role');
    if(saved==='server'||saved==='client')return saved;
    if(params.get('mode')==='client'||params.get('mode')==='remote')return 'client';
    return native||params.get('mode')==='station'?'server':'client';
  }
  function setRole(next){
    if(next!=='server'&&next!=='client')return false;
    if(next==='server'&&!native)return false;
    localStorage.setItem('bs.runtime.role',next);
    const url=new URL(location.href);
    url.searchParams.set('mode',next==='server'?'station':'client');
    url.searchParams.delete('view');
    location.assign(url.href);
    return true;
  }
  window.BoatStationRuntime={isNative:()=>native,getRole:role,isServer:()=>role()==='server',isClient:()=>role()==='client',setRole};
})();