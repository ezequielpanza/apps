export class StationState {
  constructor(state, env) { this.state = state; this.env = env; }

  async fetch(request) {
    const url = new URL(request.url);
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || '';
    const storedToken = await this.state.storage.get('token');

    if (request.method === 'POST' && url.pathname.endsWith('/state')) {
      const body = await request.json();
      if (!body || !body.token) return json({error: 'missing token'}, 400);
      if (storedToken && storedToken !== body.token) return json({error: 'unauthorized'}, 401);
      if (!storedToken) await this.state.storage.put('token', body.token);
      const record = {updatedAt: Date.now(), boatName: body.boatName || 'Boat Station', snapshot: body.snapshot || {}, version: body.version || null};
      await this.state.storage.put('state', record);
      return json({ok: true, updatedAt: record.updatedAt});
    }

    if (!storedToken || token !== storedToken) return json({error: 'unauthorized'}, 401);

    if (request.method === 'GET' && url.pathname.endsWith('/state')) {
      const clientId = url.searchParams.get('clientId');
      const clientName = url.searchParams.get('clientName') || 'Remote';
      if (clientId) {
        const clients = (await this.state.storage.get('clients')) || {};
        clients[clientId] = {name: clientName, lastSeen: Date.now()};
        for (const [id, client] of Object.entries(clients)) if (Date.now() - client.lastSeen > 120000) delete clients[id];
        await this.state.storage.put('clients', clients);
      }
      return json((await this.state.storage.get('state')) || {updatedAt: 0, boatName: 'Boat Station', snapshot: {}});
    }

    if (url.pathname.endsWith('/commands')) {
      if (request.method === 'POST') {
        const body = await request.json();
        const command = String(body?.command || '');
        const allowed = ['system.refresh', 'gps.new', 'gps.resume', 'gps.stop', 'gps.clear', 'gps.import', 'gps.anchor.command', 'gps.anchor.settings', 'battery.scan', 'battery.add', 'battery.remove', 'battery.renameBank', 'battery.edit', 'battery.diagnostics.exportCsv', 'battery.chargeCalculation', 'battery.currentHistoryColor', 'battery.bankHistoryColor', 'gps.history.settings', 'gps.vessel.settings', 'boatStatus.adjustHeading', 'boatStatus.action'];
        if (!allowed.includes(command)) return json({error: 'invalid command'}, 400);
        const commands = (await this.state.storage.get('commands')) || [];
        commands.push({id: crypto.randomUUID(), command, payload: body?.payload ?? null, createdAt: Date.now()});
        while (commands.length > 50) commands.shift();
        await this.state.storage.put('commands', commands);
        return json({ok: true});
      }
      if (request.method === 'GET') {
        const commands = (await this.state.storage.get('commands')) || [];
        await this.state.storage.put('commands', []);
        return json({commands});
      }
    }

    const exportRoute = url.pathname.match(/\/exports\/([A-Za-z0-9-]+)(?:\/(chunks\/(\d+)|complete|error|file))?$/);
    if (exportRoute) return this.handleExport(request, exportRoute);

    if (request.method === 'GET' && url.pathname.endsWith('/clients')) {
      const clients = (await this.state.storage.get('clients')) || {};
      const now = Date.now();
      const active = Object.entries(clients).filter(([, client]) => now - client.lastSeen <= 30000).map(([id, client]) => ({id, ...client}));
      return json({clients: active, count: active.length});
    }
    return json({error: 'not found'}, 404);
  }

  async handleExport(request, match) {
    const [, id, action, chunkIndexRaw] = match;
    const metaKey = 'export-meta:' + id;
    const chunkKey = index => 'export:' + id + ':' + index;

    if (!action && request.method === 'POST') {
      const body = await request.json();
      if (body?.action !== 'create') return json({error: 'invalid export action'}, 400);
      await this.cleanupExports();
      const existing = await this.state.storage.get(metaKey);
      if (existing) return json(existing);
      const active = await this.state.storage.list({prefix: 'export-meta:'});
      if ([...active.values()].some(item => item.status === 'pending')) return json({error: 'another export is already running'}, 409);
      let filename = String(body.filename || 'BoatStation-diagnostico-baterias.csv').replace(/[^A-Za-z0-9._-]/g, '_');
      if (!filename.endsWith('.csv')) filename += '.csv';
      const meta = {id, filename, status: 'pending', createdAt: Date.now(), chunkCount: 0, size: 0};
      await this.state.storage.put(metaKey, meta);
      return json(meta);
    }

    const meta = await this.state.storage.get(metaKey);
    if (!meta) return json({error: 'export not found'}, 404);
    if (!action && request.method === 'GET') return json(meta);

    if (action?.startsWith('chunks/') && request.method === 'POST') {
      if (meta.status !== 'pending') return json({error: 'export is not accepting data'}, 409);
      const index = Number(chunkIndexRaw);
      if (!Number.isSafeInteger(index) || index !== meta.chunkCount) return json({error: 'unexpected chunk index'}, 409);
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > 65536) return json({error: 'chunk size must be between 1 and 65536 bytes'}, 413);
      await this.state.storage.put(chunkKey(index), new Uint8Array(bytes));
      meta.chunkCount += 1;
      meta.size += bytes.byteLength;
      await this.state.storage.put(metaKey, meta);
      return json({ok: true, chunkCount: meta.chunkCount, size: meta.size});
    }

    if (action === 'complete' && request.method === 'POST') {
      if (meta.status !== 'pending') return json({error: 'export is not pending'}, 409);
      const body = await request.json();
      if (Number(body?.chunkCount) !== meta.chunkCount || Number(body?.size) !== meta.size) return json({error: 'export length does not match uploaded data'}, 400);
      meta.status = 'ready';
      meta.readyAt = Date.now();
      await this.state.storage.put(metaKey, meta);
      return json(meta);
    }

    if (action === 'error' && request.method === 'POST') {
      if (meta.status !== 'pending') return json({error: 'export is not pending'}, 409);
      const body = await request.json();
      meta.status = 'error';
      meta.message = String(body?.message || 'La estación no pudo generar el CSV.').slice(0, 180);
      meta.updatedAt = Date.now();
      await this.state.storage.put(metaKey, meta);
      return json(meta);
    }

    if (action === 'file' && request.method === 'GET') {
      if (meta.status !== 'ready') return json({error: 'export is not ready'}, 409);
      const storage = this.state.storage;
      let index = 0;
      const stream = new ReadableStream({
        async pull(controller) {
          if (index >= meta.chunkCount) { controller.close(); return; }
          try {
            const value = await storage.get(chunkKey(index++));
            if (!value) throw new Error('missing export chunk');
            controller.enqueue(value instanceof Uint8Array ? value : new Uint8Array(value));
          } catch (error) { controller.error(error); }
        }
      });
      return new Response(stream, {status: 200, headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="' + meta.filename + '"',
        'content-length': String(meta.size),
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization,content-type',
        'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
        'access-control-expose-headers': 'Content-Disposition'
      }});
    }

    if (!action && request.method === 'DELETE') {
      await this.deleteExport(id, meta);
      return json({ok: true});
    }
    return json({error: 'not found'}, 404);
  }

  async cleanupExports() {
    const now = Date.now();
    const items = await this.state.storage.list({prefix: 'export-meta:'});
    for (const [key, meta] of items) {
      const age = now - Number(meta?.createdAt || 0);
      if (age <= 6 * 60 * 60 * 1000 && !(meta?.status === 'pending' && age > 30 * 60 * 1000)) continue;
      const id = key.slice('export-meta:'.length);
      await this.deleteExport(id, meta);
    }
  }

  async deleteExport(id, meta) {
    const keys = ['export-meta:' + id];
    const count = Math.max(0, Math.min(100000, Number(meta?.chunkCount) || 0));
    for (let index = 0; index < count; index++) keys.push('export:' + id + ':' + index);
    await this.state.storage.delete(keys);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {status, headers: {
    'content-type': 'application/json;charset=UTF-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-expose-headers': 'Content-Disposition',
    'cache-control': 'no-store'
  }});
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return json({ok: true});
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/station\/([^/]+)\/(state|clients|commands|exports\/[A-Za-z0-9-]+(?:\/(?:chunks\/\d+|complete|error|file))?)$/);
    if (!match) return json({error: 'not found'}, 404);
    const id = env.STATIONS.idFromName(decodeURIComponent(match[1]));
    return env.STATIONS.get(id).fetch(request);
  }
};
