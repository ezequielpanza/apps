const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
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

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function tokenKey(env) {
  if (!env.TOKEN_ENCRYPTION_KEY) throw new HttpError(503, "Falta TOKEN_ENCRYPTION_KEY");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.TOKEN_ENCRYPTION_KEY));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(env, value) {
  if (!value) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await tokenKey(env), new TextEncoder().encode(value));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(cipher)))}`;
}

async function decrypt(env, value) {
  if (!value) return null;
  const [ivPart, cipherPart] = value.split(".");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivPart) }, await tokenKey(env), fromBase64(cipherPart));
  return new TextDecoder().decode(plain);
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
    rp.id proposal_id, rp.proposed_text, rp.final_text, rp.status proposal_status, rp.confidence, rp.rationale,
    pr.publish_status, pr.youtube_reply_id
    FROM comments c JOIN videos v ON v.id=c.video_id
    LEFT JOIN reply_proposals rp ON rp.id=(SELECT id FROM reply_proposals WHERE comment_id=c.id ORDER BY id DESC LIMIT 1)
    LEFT JOIN published_replies pr ON pr.id=(SELECT id FROM published_replies WHERE comment_id=c.id ORDER BY id DESC LIMIT 1)
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

async function googleTokenRequest(params) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params)
  });
  const data = await response.json();
  if (!response.ok) throw new HttpError(502, data.error_description || data.error || "Google OAuth falló");
  return data;
}

async function youtubeConnection(env) {
  return env.DB.prepare("SELECT * FROM youtube_connections ORDER BY updated_at DESC LIMIT 1").first();
}

async function accessToken(env) {
  const connection = await youtubeConnection(env);
  if (!connection) throw new HttpError(409, "YouTube todavía no está conectado");
  const expires = connection.expires_at ? Date.parse(connection.expires_at) : 0;
  if (expires > Date.now() + 60_000) return { token: await decrypt(env, connection.access_token_enc), channelId: connection.channel_id };
  const refreshToken = await decrypt(env, connection.refresh_token_enc);
  if (!refreshToken) throw new HttpError(409, "La conexión de YouTube debe renovarse");
  const refreshed = await googleTokenRequest({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  const expiresAt = new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000).toISOString();
  await env.DB.prepare(`UPDATE youtube_connections SET access_token_enc=?, expires_at=?, token_type=?, scope=COALESCE(?,scope), updated_at=datetime('now') WHERE channel_id=?`)
    .bind(await encrypt(env, refreshed.access_token), expiresAt, refreshed.token_type || "Bearer", refreshed.scope || null, connection.channel_id).run();
  return { token: refreshed.access_token, channelId: connection.channel_id };
}

async function yt(env, path, params = {}, options = {}) {
  const auth = await accessToken(env);
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  Object.entries(params).forEach(([key, value]) => value !== undefined && value !== null && url.searchParams.set(key, String(value)));
  const response = await fetch(url, {
    ...options,
    headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(response.status === 401 ? 409 : 502, data.error?.message || `YouTube API ${response.status}`);
  return data;
}

async function oauthStart(request, env, user) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.TOKEN_ENCRYPTION_KEY) throw new HttpError(503, "Faltan secretos de Google OAuth");
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const redirectUri = `${new URL(request.url).origin}/api/youtube/callback`;
  await env.DB.prepare(`INSERT INTO oauth_states (state, code_verifier, actor_email, expires_at, created_at)
    VALUES (?, ?, ?, datetime('now','+10 minutes'), datetime('now'))`).bind(state, verifier, user.email).run();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  }).toString();
  return { authorizationUrl: url.toString(), redirectUri };
}

async function oauthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateValue = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) return Response.redirect(`${url.origin}/?oauth=error&reason=${encodeURIComponent(error)}`, 302);
  if (!code || !stateValue) throw new HttpError(400, "Respuesta OAuth incompleta");
  const state = await env.DB.prepare(`SELECT * FROM oauth_states WHERE state=? AND used_at IS NULL AND expires_at>datetime('now')`).bind(stateValue).first();
  if (!state) throw new HttpError(400, "Estado OAuth inválido o vencido");
  const redirectUri = `${url.origin}/api/youtube/callback`;
  const tokens = await googleTokenRequest({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    code,
    code_verifier: state.code_verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });
  const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true", {
    headers: { authorization: `Bearer ${tokens.access_token}` }
  });
  const channelData = await channelResponse.json();
  const channel = channelData.items?.[0];
  if (!channel) throw new HttpError(409, "La cuenta autorizada no administra un canal de YouTube");
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString();
  await env.DB.prepare(`INSERT INTO channels (id,title,thumbnail_url,connected_at,updated_at)
    VALUES (?,?,?,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET title=excluded.title, thumbnail_url=excluded.thumbnail_url, updated_at=datetime('now')`)
    .bind(channel.id, channel.snippet.title, channel.snippet.thumbnails?.default?.url || null, new Date().toISOString()).run();
  await env.DB.prepare(`INSERT INTO youtube_connections
    (channel_id,access_token_enc,refresh_token_enc,token_type,scope,expires_at,updated_at)
    VALUES (?,?,?,?,?,?,datetime('now')) ON CONFLICT(channel_id) DO UPDATE SET
    access_token_enc=excluded.access_token_enc,
    refresh_token_enc=COALESCE(excluded.refresh_token_enc,youtube_connections.refresh_token_enc),
    token_type=excluded.token_type, scope=excluded.scope, expires_at=excluded.expires_at, updated_at=datetime('now')`)
    .bind(channel.id, await encrypt(env, tokens.access_token), await encrypt(env, tokens.refresh_token || null), tokens.token_type || "Bearer", tokens.scope || YOUTUBE_SCOPE, expiresAt).run();
  await env.DB.prepare("UPDATE oauth_states SET used_at=datetime('now') WHERE state=?").bind(stateValue).run();
  await audit(env, { email: state.actor_email }, "youtube.connected", "channel", channel.id);
  return Response.redirect(`${url.origin}/?oauth=connected`, 302);
}

function episodeNumber(title) {
  const match = String(title || "").match(/(?:episodio|ep\.?|cap[ií]tulo)\s*#?\s*(\d{1,4})/i);
  return match ? Number(match[1]) : null;
}

async function syncVideos(env, channelId) {
  const channel = await yt(env, "channels", { part: "contentDetails", id: channelId });
  const playlistId = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlistId) throw new HttpError(502, "No se encontró la lista de videos del canal");
  const limit = Math.min(50, Math.max(1, Number(env.SYNC_VIDEO_LIMIT || 20)));
  const playlist = await yt(env, "playlistItems", { part: "snippet,contentDetails", playlistId, maxResults: limit });
  for (const item of playlist.items || []) {
    const s = item.snippet;
    const id = item.contentDetails?.videoId || s?.resourceId?.videoId;
    if (!id) continue;
    await env.DB.prepare(`INSERT INTO videos (id,channel_id,title,description,thumbnail_url,published_at,episode_number,updated_at)
      VALUES (?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, description=excluded.description, thumbnail_url=excluded.thumbnail_url,
      published_at=excluded.published_at, episode_number=COALESCE(videos.episode_number,excluded.episode_number), updated_at=datetime('now')`)
      .bind(id, channelId, s.title || "Sin título", s.description || "", s.thumbnails?.medium?.url || s.thumbnails?.default?.url || null,
        s.publishedAt || null, episodeNumber(s.title)).run();
  }
  return (playlist.items || []).length;
}

async function saveReply(env, videoId, topId, reply, channelId) {
  const s = reply.snippet || {};
  await env.DB.prepare(`INSERT INTO comments
    (youtube_comment_id,video_id,parent_comment_id,author_name,author_channel_id,author_avatar_url,text_display,text_original,like_count,published_at,updated_at_youtube,is_channel_owner,has_channel_reply,status,last_synced_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'published',datetime('now'))
    ON CONFLICT(youtube_comment_id) DO UPDATE SET text_display=excluded.text_display,text_original=excluded.text_original,like_count=excluded.like_count,updated_at_youtube=excluded.updated_at_youtube,last_synced_at=datetime('now')`)
    .bind(reply.id, videoId, topId, s.authorDisplayName || "Usuario", s.authorChannelId?.value || null, s.authorProfileImageUrl || null,
      s.textDisplay || s.textOriginal || "", s.textOriginal || s.textDisplay || "", s.likeCount || 0, s.publishedAt || null, s.updatedAt || null,
      s.authorChannelId?.value === channelId ? 1 : 0, 0).run();
}

async function syncComments(env, channelId) {
  const pageLimit = Math.min(10, Math.max(1, Number(env.SYNC_COMMENT_PAGE_LIMIT || 3)));
  let pageToken;
  let saved = 0;
  for (let page = 0; page < pageLimit; page++) {
    const data = await yt(env, "commentThreads", {
      part: "snippet,replies",
      allThreadsRelatedToChannelId: channelId,
      order: "time",
      maxResults: 100,
      pageToken
    });
    for (const thread of data.items || []) {
      const threadSnippet = thread.snippet || {};
      const top = threadSnippet.topLevelComment;
      const s = top?.snippet || {};
      const videoId = threadSnippet.videoId;
      if (!top?.id || !videoId) continue;
      const videoExists = await env.DB.prepare("SELECT id FROM videos WHERE id=?").bind(videoId).first();
      if (!videoExists) continue;
      const inlineReplies = thread.replies?.comments || [];
      const ownerReply = inlineReplies.some(reply => reply.snippet?.authorChannelId?.value === channelId);
      const status = ownerReply ? "published" : "pending";
      await env.DB.prepare(`INSERT INTO comments
        (youtube_comment_id,video_id,parent_comment_id,author_name,author_channel_id,author_avatar_url,text_display,text_original,like_count,published_at,updated_at_youtube,is_channel_owner,has_channel_reply,status,last_synced_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(youtube_comment_id) DO UPDATE SET
        text_display=excluded.text_display,text_original=excluded.text_original,like_count=excluded.like_count,updated_at_youtube=excluded.updated_at_youtube,
        has_channel_reply=MAX(comments.has_channel_reply,excluded.has_channel_reply),
        status=CASE WHEN comments.status IN ('approved','proposed','skipped','published') THEN comments.status ELSE excluded.status END,last_synced_at=datetime('now')`)
        .bind(top.id, videoId, null, s.authorDisplayName || "Usuario", s.authorChannelId?.value || null, s.authorProfileImageUrl || null,
          s.textDisplay || s.textOriginal || "", s.textOriginal || s.textDisplay || "", s.likeCount || 0, s.publishedAt || null, s.updatedAt || null,
          s.authorChannelId?.value === channelId ? 1 : 0, ownerReply ? 1 : 0, status).run();
      for (const reply of inlineReplies) await saveReply(env, videoId, top.id, reply, channelId);
      saved++;
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return saved;
}

async function syncYouTube(env, kind = "manual") {
  const started = new Date().toISOString();
  const run = await env.DB.prepare(`INSERT INTO sync_runs (kind,status,started_at) VALUES (?,'running',?)`).bind(kind, started).run();
  try {
    const connection = await youtubeConnection(env);
    if (!connection) throw new HttpError(409, "YouTube todavía no está conectado");
    const videoCount = await syncVideos(env, connection.channel_id);
    const commentCount = await syncComments(env, connection.channel_id);
    const result = { videos: videoCount, comments: commentCount };
    await env.DB.prepare(`UPDATE sync_runs SET status='success',finished_at=datetime('now'),result_json=? WHERE id=?`)
      .bind(JSON.stringify(result), run.meta.last_row_id).run();
    return result;
  } catch (error) {
    await env.DB.prepare(`UPDATE sync_runs SET status='failed',finished_at=datetime('now'),error_message=? WHERE id=?`)
      .bind(error.message || "Error", run.meta.last_row_id).run();
    throw error;
  }
}

async function publishProposal(env, user, proposalId) {
  const proposal = await env.DB.prepare(`SELECT rp.*, c.youtube_comment_id, c.id comment_id FROM reply_proposals rp
    JOIN comments c ON c.id=rp.comment_id WHERE rp.id=?`).bind(proposalId).first();
  if (!proposal) throw new HttpError(404, "Propuesta no encontrada");
  if (!["accepted", "edited"].includes(proposal.status)) throw new HttpError(409, "La propuesta debe aprobarse antes de publicar");
  const replyText = String(proposal.final_text || proposal.proposed_text || "").trim();
  const result = await yt(env, "comments", { part: "snippet" }, {
    method: "POST",
    body: JSON.stringify({ snippet: { parentId: proposal.youtube_comment_id, textOriginal: replyText } })
  });
  await env.DB.prepare(`INSERT INTO published_replies
    (proposal_id,comment_id,youtube_reply_id,reply_text,publish_status,requested_by,created_at,published_at)
    VALUES (?,?,?,?, 'published', ?, datetime('now'), datetime('now'))`)
    .bind(proposalId, proposal.comment_id, result.id || null, replyText, user.email).run();
  await env.DB.prepare("UPDATE reply_proposals SET status='published',updated_at=datetime('now') WHERE id=?").bind(proposalId).run();
  await env.DB.prepare("UPDATE comments SET status='published',has_channel_reply=1 WHERE id=?").bind(proposal.comment_id).run();
  await audit(env, user, "reply.published", "reply_proposal", proposalId, { youtubeReplyId: result.id });
  return { published: true, youtubeReplyId: result.id };
}

async function gptPending(env, url) {
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20)));
  const rows = await env.DB.prepare(`SELECT c.id comment_id, c.youtube_comment_id, c.text_original comment,
    c.author_name, c.published_at, v.id video_id, v.title video_title, v.episode_number, v.description video_description
    FROM comments c JOIN videos v ON v.id=c.video_id
    WHERE c.parent_comment_id IS NULL AND c.status='pending' AND c.is_channel_owner=0
    ORDER BY c.published_at ASC LIMIT ?`).bind(limit).all();
  return { items: rows.results || [] };
}

async function gptBatch(env, user, data) {
  const proposals = Array.isArray(data.proposals) ? data.proposals : [];
  if (!proposals.length) throw new HttpError(400, "No hay propuestas");
  const saved = [];
  for (const item of proposals.slice(0, 50)) saved.push(await createProposal(env, user, Number(item.comment_id), item, "gpt"));
  return { saved };
}

async function api(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/health") return json({ ok: true, app: env.APP_NAME, version: "0.2.0" });
  if (path === "/api/youtube/callback" && method === "GET") return oauthCallback(request, env);
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
  if (path === "/api/setup" && method === "GET") {
    const connection = await youtubeConnection(env);
    return json({
      youtubeConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY),
      youtubeConnected: Boolean(connection),
      connectedChannelId: connection?.channel_id || null,
      gptConfigured: Boolean(env.GPT_SHARED_SECRET),
      authMode: env.AUTH_MODE
    });
  }
  if (path === "/api/youtube/connect" && method === "POST") return json(await oauthStart(request, env, user));
  if (path === "/api/sync" && method === "POST") {
    const result = await syncYouTube(env, "manual");
    await audit(env, user, "sync.completed", "system", "youtube", result);
    return json({ ok: true, result, message: `${result.comments} comentarios sincronizados` });
  }

  let match = path.match(/^\/api\/comments\/(\d+)\/proposals$/);
  if (match && method === "POST") return json(await createProposal(env, user, Number(match[1]), await body(request)), 201);
  match = path.match(/^\/api\/proposals\/(\d+)\/review$/);
  if (match && method === "POST") return json(await review(env, user, Number(match[1]), await body(request)));
  match = path.match(/^\/api\/proposals\/(\d+)\/publish$/);
  if (match && method === "POST") return json(await publishProposal(env, user, Number(match[1])));
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
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(syncYouTube(env, "cron").catch(error => console.error("Scheduled sync failed", error)));
  }
};