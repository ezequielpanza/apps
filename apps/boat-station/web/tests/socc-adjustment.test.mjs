import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../modules/batteries-clean.js',import.meta.url),'utf8');
const start=source.indexOf('  function adjustedSoccPoints('),end=source.indexOf('  function indicatorStats()',start);
assert.ok(start>=0&&end>start);
const context={num:v=>v==null?null:Number(v),soccChargeEfficiency:100,soccSelfDischarge:0};
vm.createContext(context);
vm.runInContext(source.slice(start,end)+';globalThis.calculate=adjustedSoccPoints;',context);
const anchor=1795342459141,day=86400000,rows=[{time:anchor+day,chargeAh:100,dischargeAh:0},{time:anchor+2*day,chargeAh:0,dischargeAh:20}];
assert.equal(context.calculate(rows,200).at(-1).ah,80);
context.soccChargeEfficiency=90;context.soccSelfDischarge=1;
assert.ok(Math.abs(context.calculate(rows,200).at(-1).ah-69.1)<1e-9);
assert.equal(context.calculate(rows,0).length,0);
console.log('SOCc ajustado: conteo, eficiencia y autodescarga correctos');
