(function(){
  const cards=document.getElementById('cards');
  if(!cards)return;

  const style=document.createElement('style');
  style.textContent=`
    .battery-ring{--flow-color:var(--accent);background:conic-gradient(var(--flow-color) calc(var(--soc)*1%),#17394f 0);transition:background .18s ease,filter .18s ease}
    .battery-ring.battery-flow-charging{--flow-color:#8bd332;filter:drop-shadow(0 0 8px #8bd33233)}
    .battery-ring.battery-flow-discharging{--flow-color:#ff6e6e;filter:drop-shadow(0 0 8px #ff6e6e33)}
    .battery-ring.battery-flow-idle{--flow-color:var(--accent)}
    .battery-flow-label{margin-top:7px;font-size:12px;font-weight:800;letter-spacing:.01em}
    .battery-flow-label.charging{color:#8bd332}
    .battery-flow-label.discharging{color:#ff8b8b}
    .battery-flow-label.idle{color:var(--muted)}
  `;
  document.head.appendChild(style);

  function parseCurrent(card){
    const metrics=card.querySelectorAll('.compact-bank-metrics .metric .value');
    if(metrics.length<2)return null;
    const match=String(metrics[1].textContent||'').replace(',','.').match(/[-+]?\d+(?:\.\d+)?/);
    return match?Number(match[0]):null;
  }

  function apply(){
    const card=cards.querySelector('.card[data-id="batteries"]');
    if(!card)return;
    const ring=card.querySelector('.battery-ring');
    if(!ring)return;
    const current=parseCurrent(card);
    const state=current===null?'idle':current>0.15?'charging':current<-0.15?'discharging':'idle';
    ring.classList.remove('battery-flow-charging','battery-flow-discharging','battery-flow-idle');
    ring.classList.add('battery-flow-'+state);
    const hero=ring.closest('.battery-hero');
    if(!hero)return;
    let label=hero.querySelector('.battery-flow-label');
    if(!label){label=document.createElement('div');label.className='battery-flow-label';hero.appendChild(label)}
    label.className='battery-flow-label '+state;
    label.textContent=state==='charging'?'Cargando':state==='discharging'?'Descargando':'En reposo';
  }

  let raf=0;
  const schedule=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;apply()})};
  const observer=new MutationObserver(schedule);
  observer.observe(cards,{childList:true,subtree:true,characterData:true});
  window.addEventListener('resize',schedule);
  schedule();
})();