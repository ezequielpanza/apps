function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

export async function onRequestGet({ params, env }) {
  const code = String(params.code || "").trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) return json({ error: "invalid_code" }, 400);

  const hash = await env.CONTEXTUM_KV.get(`pair:${code}`);
  if (!hash) return json({ error: "expired_or_unknown" }, 404);

  const value = await env.CONTEXTUM_KV.get(`context:${hash}`);
  if (!value) return json({ error: "context_not_found" }, 404);

  let context;
  try {
    context = JSON.parse(value);
  } catch (_) {
    return json({ error: "invalid_context" }, 500);
  }

  return json({
    source: "contextum",
    access: "temporary-read-only",
    context
  });
}

export function onRequest() {
  return json({ error: "method_not_allowed" }, 405);
}