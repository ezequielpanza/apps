
const TARGETS = {'vegetables':14,'fruits':7,'whole-grains':7,'legumes':3,'nuts-seeds':7,'calcium':7,'fish':2,'poultry':2,'beef':1,'pork':1,'eggs':3,'olive-oil':7,'turmeric':2,'ginger':2,'lemon':2,'cinnamon':2};
const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
function validWeek(w) { return typeof w === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w) && !Number.isNaN(Date.parse(w)); }
export async function onRequestGet(context) {
  const week = new URL(context.request.url).searchParams.get('week');
  if (!validWeek(week)) return new Response('Semana inválida',{status:400});
  try {
    const result = await context.env.DB.prepare('SELECT food, mark, checked FROM marks WHERE week = ?').bind(week).all();
    return new Response(JSON.stringify({marks:result.results.map(r=>({food:r.food,mark:r.mark,checked:!!r.checked}))}),{headers});
  } catch (_) { return new Response('Base no disponible',{status:503}); }
}
export async function onRequestPost(context) {
  try {
    const data=await context.request.json();
    if (!validWeek(data.week) || !Object.hasOwn(TARGETS,data.food) || !Number.isInteger(data.mark) || data.mark<0 || data.mark>=TARGETS[data.food] || typeof data.checked!=='boolean') return new Response('Datos inválidos',{status:400});
    const sql=data.migrate ? 'INSERT OR IGNORE INTO marks (week,food,mark,checked) VALUES (?,?,?,?)' : 'INSERT INTO marks (week,food,mark,checked) VALUES (?,?,?,?) ON CONFLICT(week,food,mark) DO UPDATE SET checked=excluded.checked';
    await context.env.DB.prepare(sql).bind(data.week,data.food,data.mark,data.checked?1:0).run();
    return new Response(JSON.stringify({ok:true}),{headers});
  } catch (_) { return new Response('No se pudo guardar',{status:503}); }
}
