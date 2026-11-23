import assert from 'node:assert/strict';
import {drawCurrentArea,CURRENT_HISTORY_SCALE_AMPS} from '../modules/batteries-clean.js';
function render(values, transparency=50){
  const fills=[];let points=[];
  const c={globalAlpha:1,fillStyle:'',save(){},restore(){},beginPath(){points=[]},rect(){},clip(){},moveTo(x,y){points.push([x,y])},lineTo(x,y){points.push([x,y])},closePath(){},fill(){fills.push({color:this.fillStyle,alpha:this.globalAlpha,points})}};
  drawCurrentArea(c,values.map(value=>({currents:value===null?[]:[{id:'bank',value}]})),{width:100,plotH:100,slot:10,currentScale:10,transparency});return fills;
}
assert.equal(CURRENT_HISTORY_SCALE_AMPS,40);
let fills=render([4,-6]);
assert.deepEqual(fills.map(f=>f.color),['#26c768','#ef4f59']);
assert.equal(fills[0].alpha,.5);
assert.equal(fills[0].points[2][0],9);
assert.equal(fills[0].points[2][1],50);
assert.equal(render([4,null,-6]).length,0);
assert.equal(render([4,5],100).length,0);
assert.equal(render([4,5],0)[0].alpha,1);
console.log('Corriente: colores, cruce por cero, huecos y transparencia verificados');
