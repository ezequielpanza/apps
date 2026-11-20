
const TARGETS = {'vegetables':14,'vegetables-green':7,'vegetables-color':7,'vegetables-carb':7,'fruits':7,'whole-grains':7,'legumes':3,'nuts-seeds':7,'seeds':7,'calcium':7,'fish':2,'poultry':2,'beef':1,'pork':1,'eggs':3,'olive-oil':7,'turmeric':2,'ginger':2,'lemon':2,'cinnamon':2};
const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
function validWeek(w) { return typeof w === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w) && !Number.isNaN(Date.parse(w)); }
export async function onRequestGet(context) {
  const week = new URL(context.request.url).searchParams.get('week');
  if (!validWeek(week)) return new Response('Semana inválida',{status:400});
  try {
    const result = await context.env.DB.prepare('SELECT food, mark, checked FROM marks WHERE week = ?').bind(week).all();
    const settings = await context.env.DB.prepare('SELECT food, target FROM food_targets').all();
    return new Response(JSON.stringify({marks:result.results.map(r=>({food:r.food,mark:r.mark,checked:!!r.checked})),targets:Object.fromEntries(settings.results.map(r=>[r.food,r.target]))}),{headers});
  } catch (_) { return new Response('Base no disponible',{status:503}); }
}
export async function onRequestPost(context) {
  try {
    const data=await context.request.json();
    if (data.type === 'target') {
      if (!Object.hasOwn(TARGETS,data.food) || ![-1,1].includes(data.delta)) return new Response('Datos inválidos',{status:400});
      await context.env.DB.prepare('INSERT INTO food_targets (food,target) VALUES (?, MAX(0, MIN(35, ? + ?))) ON CONFLICT(food) DO UPDATE SET target=MAX(0, MIN(35, food_targets.target + ?))').bind(data.food,TARGETS[data.food],data.delta,data.delta).run();
      return new Response(JSON.stringify({ok:true}),{headers});
    }
    if (!validWeek(data.week) || !Object.hasOwn(TARGETS,data.food) || !Number.isInteger(data.mark) || data.mark<0 || data.mark>=35 || typeof data.checked!=='boolean') return new Response('Datos inválidos',{status:400});
    const sql=data.migrate ? 'INSERT OR IGNORE INTO marks (week,food,mark,checked) VALUES (?,?,?,?)' : 'INSERT INTO marks (week,food,mark,checked) VALUES (?,?,?,?) ON CONFLICT(week,food,mark) DO UPDATE SET checked=excluded.checked';
    await context.env.DB.prepare(sql).bind(data.week,data.food,data.mark,data.checked?1:0).run();
    return new Response(JSON.stringify({ok:true}),{headers});
  } catch (_) { return new Response('No se pudo guardar',{status:503}); }
}
