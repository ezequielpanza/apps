// Validated, bank-level estimates. Measured samples are never overwritten.
export function estimatedRows(history, batchId, description, intervals) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(batchId) || !description || description.length>240 || !Array.isArray(intervals) || !intervals.length || intervals.length>1000) throw Error('Estimación inválida');
  if (history.some(p=>p.estimateBatchId===batchId)) return [];
  const result=[];let previousEnd=0;
  for(const item of intervals){
    const start=Number(item.start),end=Number(item.end),current=Number(item.current);
    if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(current)||Math.abs(current)>500||end<=start||end-start>3600000||start<previousEnd)throw Error('Intervalo inválido');
    if(history.some(p=>Number(p.time)>start&&Number(p.time)<end))throw Error('El intervalo contiene datos registrados');
    const ah=current*(end-start)/3600000,chargeAh=Math.max(0,ah),dischargeAh=Math.max(0,-ah);
    result.push({time:Math.round(end-1),current,currentLast:current,voltage:null,soc:null,batteries:[],chargeAh,dischargeAh,storedAh:chargeAh*.99-dischargeAh,estimated:true,estimateBatchId:batchId,estimateDescription:description});
    previousEnd=end;
  }
  return result;
}
