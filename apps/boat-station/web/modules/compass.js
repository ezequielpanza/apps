export function createCompassModule(requestRender){
  const state={heading:null};
  let pending=null;
  const LARGE_JUMP_DEG=75;
  const CONFIRM_TOLERANCE_DEG=18;
  const normalize=h=>((h%360)+360)%360;
  const angularDelta=(a,b)=>Math.abs(((a-b+540)%360)-180);
  const cardinal=h=>{if(!Number.isFinite(h))return'—';const dirs=['N','NE','E','SE','S','SO','O','NO'];return dirs[Math.round(h/45)%8]};
  function summary(){return Number.isFinite(state.heading)?`${Math.round(state.heading)}° ${cardinal(state.heading)}`:'Sin datos'}
  function page(){return `<div class="battery-hero"><div class="battery-ring" style="--soc:${Number.isFinite(state.heading)?state.heading/3.6:0}"><div><strong>${Number.isFinite(state.heading)?Math.round(state.heading)+'°':'—'}</strong><span>${cardinal(state.heading)}</span></div></div><div class="battery-bank-name">Rumbo magnético</div></div>`}
  function accept(h){state.heading=h;pending=null;requestRender('compass')}
  function update(value){
    const raw=Number(value);if(!Number.isFinite(raw))return;
    const h=normalize(raw);
    if(!Number.isFinite(state.heading)){accept(h);return}
    const jump=angularDelta(h,state.heading);
    if(jump<=LARGE_JUMP_DEG){accept(h);return}
    if(pending&&angularDelta(h,pending.heading)<=CONFIRM_TOLERANCE_DEG){accept(h);return}
    pending={heading:h,time:Date.now()};
  }
  return{id:'compass',name:'Brújula',pages:1,summary,page,update,state};
}
