
const TARGETS = {'vegetables':14,'vegetables-green':7,'vegetables-color':7,'vegetables-carb':7,'fruits':7,'whole-grains':7,'legumes':3,'nuts-seeds':7,'seeds':7,'calcium':7,'fish':2,'poultry':2,'beef':1,'pork':1,'eggs':3,'olive-oil':7,'turmeric':2,'ginger':2,'lemon':2,'cinnamon':2};
const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
function validWeek(w) { return typeof w === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w) && !Number.isNaN(Date.parse(w)); }
export async function onRequestGet(context) {
  const week = new URL(context.request.url).searchParams.get('week');
  if (!validWeek(week)) return new Response('Semana inválida',{status:400});
  try {
    const result = await context.env.DB.prepare('SELECT food, mark, checked FROM marks WHERE week = ?').bind(week).all();
    const settings = await context.env.DB.prepare('SELECT food, target FROM food_targets').all();
    const cats = await context.env.DB.prepare('SELECT id,title FROM custom_categories ORDER BY rowid').all();
    const custom = await context.env.DB.prepare('SELECT id,food,name FROM custom_foods ORDER BY id').all();
    const hidden = await context.env.DB.prepare('SELECT food,slot FROM hidden_foods').all();
    const categorySettings = await context.env.DB.prepare('SELECT food,title,deleted FROM category_settings').all();
    const foodNames = await context.env.DB.prepare('SELECT food,slot,name FROM food_names').all();
    return new Response(JSON.stringify({marks:result.results.map(r=>({food:r.food,mark:r.mark,checked:!!r.checked})),targets:Object.fromEntries(settings.results.map(r=>[r.food,r.target])),categories:cats.results,customFoods:custom.results.map(r=>({food:r.food,name:r.name,slot:100+r.id})),hiddenFoods:hidden.results,categorySettings:categorySettings.results,foodNames:foodNames.results}),{headers});
  } catch (_) { return new Response('Base no disponible',{status:503}); }
}
export async function onRequestPost(context) {
  try {
    const data=await context.request.json();
    if (data.type === 'add-category') {
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!title || title.length > 80) return new Response('Nombre inválido',{status:400});
      await context.env.DB.prepare('INSERT OR IGNORE INTO custom_categories (id,title) VALUES (?,?)').bind('custom-'+crypto.randomUUID(),title).run();
      return new Response(JSON.stringify({ok:true}),{headers});
    }
    const customCategory = typeof data.food === 'string' && data.food.startsWith('custom-') ? await context.env.DB.prepare('SELECT id FROM custom_categories WHERE id=?').bind(data.food).first() : null;
    const validFood = Object.hasOwn(TARGETS,data.food) || !!customCategory;
    if (data.type === 'rename-category') {
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!validFood || !title || title.length > 80) return new Response('Nombre inválido',{status:400});
      await context.env.DB.prepare('INSERT INTO category_settings (food,title,deleted) VALUES (?,?,0) ON CONFLICT(food) DO UPDATE SET title=excluded.title WHERE category_settings.deleted=0').bind(data.food,title).run();
      return new Response(JSON.stringify({ok:true}),{headers});
    }
    if (data.type === 'delete-category') {
      if (!validFood) return new Response('Categoría inválida',{status:400});
      await context.env.DB.batch([
        context.env.DB.prepare('INSERT INTO category_settings (food,deleted) VALUES (?,1) ON CONFLICT(food) DO UPDATE SET deleted=1').bind(data.food),
        context.env.DB.prepare('DELETE FROM marks WHERE food=?').bind(data.food),
        context.env.DB.prepare('DELETE FROM food_targets WHERE food=?').bind(data.food),
        context.env.DB.prepare('DELETE FROM custom_foods WHERE food=?').bind(data.food)
      ]);
      return new Response(JSON.stringify({ok:true}),{headers});
    }
    if (data.type === 'add-food') {
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!validFood || !name || name.length > 80) return new Response('Nombre inválido',{status:400});
      await context.env.DB.prepare('INSERT OR IGNORE INTO custom_foods (food,name) VALUES (?,?)').bind(data.food,name).run();
      return new Response(JSON.stringify({ok:true}),{headers});
    }
    if (data.type === 'rename-food') {
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!validFood || !Number.isInteger(data.slot) || data.slot < 1 || data.slot >= 10100 || !name || name.length > 80) return new Response('Datos inválidos',{status:400});
      await context.env.DB.prepare('INSERT INTO food_names (food,slot,name) VALUES (?,?,?) ON CONFLICT(food,slot) DO UPDATE SET name=excluded.name').bind(data.food,data.slot,name).run();
      return new Response(JSON.stringify({ok:true}),{headers});
    }
    if (data.type === 'remove-food') {
      const slot = data.slot;
      if (!validFood || !Number.isInteger(slot) || slot < 1 || slot >= 10100) return new Response('Datos inválidos',{status:400});
      await context.env.DB.batch([
        context.env.DB.prepare('INSERT OR IGNORE INTO hidden_foods (food,slot) VALUES (?,?)').bind(data.food,slot),
        context.env.DB.prepare('DELETE FROM marks WHERE food=? AND mark>=? AND mark<?').bind(data.food,slot*35,(slot+1)*35)
      ]);
      return new Response(JSON.stringify({ok:true}),{headers});
    }
    if (data.type === 'target') {
      if (!validFood || ![-1,1].includes(data.delta)) return new Response('Datos inválidos',{status:400});
      await context.env.DB.prepare('INSERT INTO food_targets (food,target) VALUES (?, MAX(0, MIN(35, ? + ?))) ON CONFLICT(food) DO UPDATE SET target=MAX(0, MIN(35, food_targets.target + ?))').bind(data.food,TARGETS[data.food] ?? 7,data.delta,data.delta).run();
      return new Response(JSON.stringify({ok:true}),{headers});
    }
    if (!validWeek(data.week) || !validFood || !Number.isInteger(data.mark) || data.mark<35 || data.mark>=353500 || typeof data.checked!=='boolean') return new Response('Datos inválidos',{status:400});
    const sql=data.migrate ? 'INSERT OR IGNORE INTO marks (week,food,mark,checked) VALUES (?,?,?,?)' : 'INSERT INTO marks (week,food,mark,checked) VALUES (?,?,?,?) ON CONFLICT(week,food,mark) DO UPDATE SET checked=excluded.checked';
    await context.env.DB.prepare(sql).bind(data.week,data.food,data.mark,data.checked?1:0).run();
    return new Response(JSON.stringify({ok:true}),{headers});
  } catch (_) { return new Response('No se pudo guardar',{status:503}); }
}
