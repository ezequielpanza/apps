const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function body(request) {
  try { return await request.json(); } catch { throw new HttpError(400, "JSON inválido"); }
}

function actor(request, env) {
  const email = request.headers.get("cf-access-authenticated-user-email") ||
    (env.AUTH_MODE === "development" ? env.DEV_USER_EMAIL : null);
  if (!email) throw new HttpError(401, "Acceso no autenticado");
  const allowed = String(env.ALLOWED_EMAILS || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(email.toLowerCase())) throw new HttpError(403, "Usuario no autorizado");
  return { email };
}

function gptActor(request, env) {
  const expected = String(env.GPT_SHARED_SECRET || "");
  const supplied = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || supplied !== expected) throw new HttpError(401, "Credencial GPT inválida");
  return { email: "gpt@chez-youtube-tool" };
}

async function audit(env, user, action, entityType, entityId, payload = null) {
  await env.DB.prepare(`INSERT INTO audit_log (actor_email, action, entity_type, entity_id, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))`)
    .bind(user.email, action, entityType, String(entityId), payload ? JSON.stringify(payload) : null).run();
}

async function dashboard(env) {
  const stats = await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM videos) videos,
    (SELECT COUNT(*) FROM comments WHERE parent_comment_id IS NULL) comments,
    (SELECT COUNT(*) FROM comments WHERE parent_comment_id IS NULL AND status='pending') pending,
    (SELECT COUNT(*) FROM reply_proposals WHERE status='proposed') proposed,
    (SELECT COUNT(*) FROM published_replies WHERE publish_status='published') published,
    (SELECT COUNT(*) FROM review_actions WHERE action='accepted') accepted,
    (SELECT COUNT(*) FROM review_actions WHERE action='edited') edited,
    (SELECT COUNT(*) FROM review_actions WHERE action='rejected') rejected,
    (SELECT COUNT(*) FROM review_actions WHERE action='skipped') skipped`).first();
  const videos = await env.DB.prepare(`SELECT v.id, v.title, v.thumbnail_url, v.published_at, v.episode_number,
    SUM(CASE WHEN c.parent_comment_id IS NULL THEN 1 ELSE 0 END) comment_count,
    SUM(CASE WHEN c.parent_comment_id IS NULL AND c.status='pending' THEN 1 ELSE 0 END) pending_count
    FROM videos v LEFT JOIN comments c ON c.video_id=v.id GROUP BY v.id ORDER BY v.published_at DESC LIMIT 8`).all();
  const connection = await env.DB.prepare(`SELECT c.id, c.title, c.thumbnail_url, yc.updated_at
    FROM youtube_connections yc JOIN channels c ON c.id=yc.channel_id ORDER BY yc.updated_at DESC LIMIT 1`).first();
  return { stats, videos: videos.results || [], connection: connection || null };
}

async function comments(env, url) {
  const status = url.searchParams.get("status") || "pending";
  const clauses = ["c.parent_comment_id IS NULL"];
  const binds = [];
  if (status !== "all") { clauses.push("c.status=?"); binds.push(status); }
  const videoId = url.searchParams.get("videoId");
  if (videoId) { clauses.push("c.video_id=?"); binds.push(videoId); }
  const rows = await env.DB.prepare(`SELECT c.*, v.title video_title,
    rp.id proposal_id, rp.proposed_text, rp.final_text, rp.status proposal_status, rp.confidence, rp.rationale
    FROM comments c JOIN videos v ON v.id=c.video_id
    LEFT JOIN reply_proposals rp ON rp.id=(SELECT id FROM reply_proposals WHERE comment_id=c.id ORDER BY id DESC LIMIT 1)
    WHERE ${clauses.join(" AND ")} ORDER BY c.published_at DESC LIMIT 100`).bind(...binds).all();
  return { items: rows.results || [] };
}

async function videos(env) {
  const rows = await env.DB.prepare(`SELECT v.*,
    SUM(CASE WHEN c.parent_comment_id IS NULL THEN 1 ELSE 0 END) comment_count,
    SUM(CASE WHEN c.parent_comment_id IS NULL AND c.status='pending' THEN 1 ELSE 0 END) pending_count
    FROM videos v LEFT JOIN comments c ON c.video_id=v.id GROUP BY v.id ORDER BY v.published_at DESC`).all();
  return { items: rows.results || [] };
}

async function style(env) {
  const metrics = await env.DB.prepare(`SELECT COUNT(*) reviews,
    SUM(action='accepted') accepted, SUM(action='edited') edited,
    SUM(action='rejected') rejected, SUM(action='skipped') skipped,
    ROUND(AVG(CASE WHEN final_text IS NOT NULL THEN length(final_text) END),1) avg_length
    FROM review_actions`).first();
  const rules = await env.DB.prepare(`SELECT * FROM style_rules WHERE status!='archived' ORDER BY status='confirmed' DESC, evidence_count DESC`).all();
  const examples = await env.DB.prepare(`SELECT * FROM style_examples ORDER BY id DESC LIMIT 30`).all();
  return { metrics, rules: rules.results || [], examples: examples.results || [] };
}

async function createProposal(env, user, commentId, data, source = "manual") {
  const text = String(data.proposed_text || "").trim();
  if (!text) throw new HttpError(400, "La propuesta no puede estar vacía");
  const comment = await env.DB.prepare("SELECT id FROM comments WHERE id=?").bind(commentId).first();
  if (!comment) throw new HttpError(404, "Comentario no encontrado");
  const result = await env.DB.prepare(`INSERT INTO reply_proposals
    (comment_id, proposed_text, source, model_label, confidence, rationale, knowledge_json, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed', ?, datetime('now'), datetime('now'))`)
    .bind(commentId, text, source, data.model_label || null, data.confidence ?? null,
      data.rationale || null, JSON.stringify(data.knowledge_used || []), user.email).run();
  await env.DB.prepare("UPDATE comments SET status='proposed' WHERE id=?").bind(commentId).run();
  await audit(env, user, "proposal.created", "reply_proposal", result.meta.last_row_id, { commentId, source });
  return { id: result.meta.last_row_id };
}

async function review(env, user, proposalId, data) {
  const action = String(data.action || "");
  if (!["accepted", "edited", "rejected", "skipped"].includes(action)) throw new HttpError(400, "Acción inválida");
  const proposal = await env.DB.prepare(`SELECT rp.*, c.text_original comment_text FROM reply_proposals rp
    JOIN comments c ON c.id=rp.comment_id WHERE rp.id=?`).bind(proposalId).first();
  if (!proposal) throw new HttpError(404, "Propuesta no encontrada");
  let finalText = action === "accepted" ? proposal.proposed_text : null;
  if (action === "edited") {
    finalText = String(data.final_text || "").trim();
    if (!finalText) throw new HttpError(400, "La respuesta editada no puede estar vacía");
  }
  await env.DB.prepare(`INSERT INTO review_actions
    (proposal_id, comment_id, action, proposed_text, final_text, reason, reviewer_email, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`)
    .bind(proposalId, proposal.comment_id, action, proposal.proposed_text, finalText, data.reason || null, user.email).run();
  await env.DB.prepare(`UPDATE reply_proposals SET status=?, final_text=?, reviewed_by=?, reviewed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`)
    .bind(action, finalText, user.email, proposalId).run();
  const commentStatus = action === "rejected" ? "pending" : action === "skipped" ? "skipped" : "approved";
  await env.DB.prepare("UPDATE comments SET status=? WHERE id=?").bind(commentStatus, proposal.comment_id).run();
  const signal = { accepted: "positive", edited: "correction", rejected: "negative", skipped: "skip" }[action];
  await env.DB.prepare(`INSERT INTO style_examples
    (comment_id, proposal_id, signal, category, comment_text, proposed_text, final_text, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`)
    .bind(proposal.comment_id, proposalId, signal, data.category || null, proposal.comment_text,
      proposal.proposed_text, finalText, data.reason || null).run();
  await audit(env, user, `proposal.${action}`, "reply_proposal", proposalId);
  return { status: action };
}

async function gptPending(env, url) {
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20)));
  const rows = await env.DB.prepare(`SELECT c.id comment_id, c.youtube_comment_id, c.text_original comment,
    c.author_name, c.published_at, v.id video_id, v.title video_title, v.episode_number
    FROM comments c JOIN videos v ON v.id=c.video_id
    WHERE c.parent_comment_id IS NULL AND c.status='pending'
    ORDER BY c.published_at ASC LIMIT ?`).bind(limit).all();
  return { items: rows.results || [] };
}

async function gptBatch(env, user, data) {
  const proposals = Array.isArray(data.proposals) ? data.proposals : [];
  if (!proposals.length) throw new HttpError(400, "No hay propuestas");
  const saved = [];
  for (const item of proposals.slice(0, 50)) {
    saved.push(await createProposal(env, user, Number(item.comment_id), item, "gpt"));
  }
  return { saved };
}

async function api(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/health") return json({ ok: true, app: env.APP_NAME, version: "0.1.0" });
  if (path.startsWith("/api/gpt/")) {
    const user = gptActor(request, env);
    if (path === "/api/gpt/pending-comments" && method === "GET") return json(await gptPending(env, url));
    if (path === "/api/gpt/style-profile" && method === "GET") return json(await style(env));
    if (path === "/api/gpt/proposals/batch" && method === "POST") return json(await gptBatch(env, user, await body(request)), 201);
    throw new HttpError(404, "Endpoint GPT no encontrado");
  }

  const user = actor(request, env);
  if (path === "/api/dashboard" && method === "GET") return json(await dashboard(env));
  if (path === "/api/comments" && method === "GET") return json(await comments(env, url));
  if (path === "/api/videos" && method === "GET") return json(await videos(env));
  if (path === "/api/style" && method === "GET") return json(await style(env));
  if (path === "/api/setup" && method === "GET") return json({
    youtubeConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    gptConfigured: Boolean(env.GPT_SHARED_SECRET),
    authMode: env.AUTH_MODE,
    next: "Configurar Google OAuth y activar la sincronización con YouTube"
  });

  let match = path.match(/^\/api\/comments\/(\d+)\/proposals$/);
  if (match && method === "POST") return json(await createProposal(env, user, Number(match[1]), await body(request)), 201);
  match = path.match(/^\/api\/proposals\/(\d+)\/review$/);
  if (match && method === "POST") return json(await review(env, user, Number(match[1]), await body(request)));

  if (path === "/api/sync" && method === "POST") {
    await audit(env, user, "sync.requested", "system", "youtube");
    return json({ ok: false, status: "configuration_required", message: "La conexión OAuth con YouTube se habilita en la siguiente etapa." }, 202);
  }
  throw new HttpError(404, "Endpoint no encontrado");
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await api(request, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) console.error(error);
      return json({ error: error.message || "Error interno" }, status);
    }
  },
  async scheduled(_event, env) {
    await env.DB.prepare(`INSERT INTO sync_runs (kind, status, started_at, finished_at, result_json)
      VALUES ('cron', 'waiting_configuration', datetime('now'), datetime('now'), '{"message":"OAuth pendiente"}')`).run();
  }
};
