export function number(value){return value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null}
export function position(value){const lat=number(value?.lat),lon=number(value?.lon);return lat!==null&&lon!==null&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null}
export function distance(a,b){const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlon=(b.lon-a.lon)*r,h=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2;return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)))}
export function zone(value){const p=position(value),radius=number(value?.radius);return p&&radius!==null&&radius>=1&&radius<=2000?{...p,radius}:null}
export function fresh(record,now=Date.now()){const time=number(record?.telemetry?.time),received=number(record?.updatedAt);return time!==null&&received!==null&&time<=now+60000&&received<=now+60000&&now-time<30000&&now-received<30000&&!record.error}
export function overlaps(entries){const result=[];for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){const a=entries[i],b=entries[j];if(distance(a.zone,b.zone)<a.zone.radius+b.zone.radius)result.push([a,b])}return result}
