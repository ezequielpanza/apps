const encoder = new TextEncoder();
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function keyHash(request) {
  const key = (request.headers.get("X-Contextum-Key") || "").trim();
  if (!/^[a-f0-9]{40,128}$/i.test(key)) return null;
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(key));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function makeCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function onRequestPost({ request, env }) {
  const hash = await keyHash(request);
  if (!hash) return json({ error: "unauthorized" }, 401);

  const context = await env.CONTEXTUM_KV.get(`context:${hash}`);
  if (!context) return json({ error: "context_required" }, 409);

  let code = makeCode();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existing = await env.CONTEXTUM_KV.get(`pair:${code}`);
    if (!existing) break;
    code = makeCode();
  }

  const expiresIn = 600;
  await env.CONTEXTUM_KV.put(`pair:${code}`, hash, { expirationTtl: expiresIn });
  return json({ code, expiresIn });
}

export function onRequest() {
  return json({ error: "method_not_allowed" }, 405);
}