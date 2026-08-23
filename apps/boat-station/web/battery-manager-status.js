(function(){
  const KEY='bs.batteries.state';

  function readState(){
    try{
      const value=JSON.parse(localStorage.getItem(KEY)||'null');
      return value&&typeof value==='object'?value:null;
    }catch{return null}
  }

  function normalize(value){return String(value||'').trim().toLowerCase()}

  function batteryForRow(row,batteries){
    const strong=row.querySelector('strong');
    const small=row.querySelector('small');
    const name=normalize(strong?.textContent);
    const detail=normalize(small?.textContent);
    return batteries.find(b=>{
      const batteryName=normalize(b?.name||b?.deviceName);
      const address=normalize(b?.address||b?.id||b?.mac);
      return (address&&detail.includes(address))||(batteryName&&batteryName===name);
    })||null;
  }

  function render(){
    const state=readState();
    const batteries=Array.isArray(state?.batteries)?state.batteries:[];
    document.querySelectorAll('.battery-manage-row').forEach(row=>{
      const left=row.querySelector(':scope > div');
      if(!left)return;
      let status=left.querySelector('.battery-manager-connection');
      if(!status){
        status=document.createElement('span');
        status.className='battery-manager-connection';
        left.appendChild(status);
      }
      const battery=batteryForRow(row,batteries);
      const online=!!battery&&battery.connected!==false&&Number.isFinite(Number(battery.voltage));
      status.classList.toggle('online',online);
      status.classList.toggle('offline',!online);
      status.textContent=online?'● Conectada':'● Offline';
    });
  }

  const style=document.createElement('style');
  style.textContent='.battery-manager-connection{display:block;margin-top:5px;font-size:12px;font-weight:750;letter-spacing:.01em}.battery-manager-connection.online{color:#8bd332}.battery-manager-connection.offline{color:#ff7f86}';
  document.head.appendChild(style);

  const observer=new MutationObserver(()=>requestAnimationFrame(render));
  observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('storage',e=>{if(e.key===KEY)render()});
  setInterval(render,1000);
  render();
})();