export class StationState {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(request) {
    const url = new URL(request.url);
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i,'') || url.searchParams.get('token') || '';
    const storedToken = await this.state.storage.get('token');
    if (request.method === 'POST' && url.pathname.endsWith('/state')) {
      const body = await request.json();
      if (!body || !body.token) return json({error:'missing token'},400);
      if (storedToken && storedToken !== body.token) return json({error:'unauthorized'},401);
      if (!storedToken) await this.state.storage.put('token', body.token);
      const record = {updatedAt:Date.now(), boatName:body.boatName||'Boat Station', snapshot:body.snapshot||{}, version:body.version||null};
      await this.state.storage.put('state', record);
      return json({ok:true, updatedAt:record.updatedAt});
    }
    if (!storedToken || token !== storedToken) return json({error:'unauthorized'},401);
    if (request.method === 'GET' && url.pathname.endsWith('/state')) {
      const clientId = url.searchParams.get('clientId');
      const clientName = url.searchParams.get('clientName') || 'Remote';
      if (clientId) {
        const clients = (await this.state.storage.get('clients')) || {};
        clients[clientId] = {name:clientName,lastSeen:Date.now()};
        for (const [id,c] of Object.entries(clients)) if (Date.now()-c.lastSeen > 120000) delete clients[id];
        await this.state.storage.put('clients', clients);
      }
      return json((await this.state.storage.get('state')) || {updatedAt:0,boatName:'Boat Station',snapshot:{}});
    }
    if (request.method === 'GET' && url.pathname.endsWith('/clients')) {
      const clients = (await this.state.storage.get('clients')) || {};
      const now=Date.now();
      const active=Object.entries(clients).filter(([,c])=>now-c.lastSeen<=30000).map(([id,c])=>({id,...c}));
      return json({clients:active,count:active.length});
    }
    return json({error:'not found'},404);
  }
}

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8','access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS','cache-control':'no-store'}})}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return json({ok:true});
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/station\/([^/]+)\/(state|clients)$/);
    if (!m) return json({error:'not found'},404);
    const id = env.STATIONS.idFromName(decodeURIComponent(m[1]));
    return env.STATIONS.get(id).fetch(request);
  }
};
