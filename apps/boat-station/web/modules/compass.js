export function createCompassModule(requestRender){
  const state={heading:null};
  const cardinal=h=>{if(!Number.isFinite(h))return'—';const dirs=['N','NE','E','SE','S','SO','O','NO'];return dirs[Math.round(h/45)%8]};
  function summary(){return Number.isFinite(state.heading)?`${Math.round(state.heading)}° ${cardinal(state.heading)}`:'Sin datos'}
  function page(){return `<div class="battery-hero"><div class="battery-ring" style="--soc:${Number.isFinite(state.heading)?state.heading/3.6:0}"><div><strong>${Number.isFinite(state.heading)?Math.round(state.heading)+'°':'—'}</strong><span>${cardinal(state.heading)}</span></div></div><div class="battery-bank-name">Rumbo magnético</div></div>`}
  function update(value){const h=Number(value);if(!Number.isFinite(h))return;state.heading=((h%360)+360)%360;requestRender('compass')}
  return{id:'compass',name:'Brújula',pages:1,summary,page,update,state};
}
