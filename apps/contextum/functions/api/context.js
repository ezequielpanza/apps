const encoder = new TextEncoder();

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

function sanitizeSnapshot(input) {
  if (!input || typeof input !== "object") return null;
  const sourceLocation = input.location && typeof input.location === "object" ? input.location : null;
  const numberOrNull = (value) => Number.isFinite(value) ? value : null;
  const location = sourceLocation ? {
    latitude: numberOrNull(sourceLocation.latitude),
    longitude: numberOrNull(sourceLocation.longitude),
    accuracyM: numberOrNull(sourceLocation.accuracyM),
    speedKmh: numberOrNull(sourceLocation.speedKmh),
    headingDeg: numberOrNull(sourceLocation.headingDeg),
    altitudeM: numberOrNull(sourceLocation.altitudeM),
    timestamp: typeof sourceLocation.timestamp === "string" ? sourceLocation.timestamp.slice(0, 64) : null
  } : null;

  if (location && (location.latitude === null || location.longitude === null)) return null;
  if (location && (Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180)) return null;

  const note = input.context && typeof input.context.activeNote === "string"
    ? input.context.activeNote.trim().slice(0, 500)
    : null;

  const runtime = input.runtime && typeof input.runtime === "object" ? input.runtime : {};
  return {
    schemaVersion: 1,
    appVersion: typeof input.appVersion === "string" ? input.appVersion.slice(0, 24) : null,
    capturedAt: typeof input.capturedAt === "string" ? input.capturedAt.slice(0, 64) : new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    location,
    context: { activeNote: note || null },
    runtime: {
      visible: runtime.visible === true,
      focused: runtime.focused === true,
      companionMode: runtime.companionMode === true
    }
  };
}

export async function onRequestPost({ request, env }) {
  const hash = await keyHash(request);
  if (!hash) return json({ error: "unauthorized" }, 401);

  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 16384) return json({ error: "payload_too_large" }, 413);

  let input;
  try {
    input = await request.json();
  } catch (_) {
    return json({ error: "invalid_json" }, 400);
  }

  const snapshot = sanitizeSnapshot(input);
  if (!snapshot) return json({ error: "invalid_snapshot" }, 400);

  await env.CONTEXTUM_KV.put(`context:${hash}`, JSON.stringify(snapshot), { expirationTtl: 2592000 });
  return json({ ok: true, receivedAt: snapshot.receivedAt });
}

export async function onRequestGet({ request, env }) {
  const hash = await keyHash(request);
  if (!hash) return json({ error: "unauthorized" }, 401);
  const value = await env.CONTEXTUM_KV.get(`context:${hash}`);
  if (!value) return json({ error: "not_found" }, 404);
  return new Response(value, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export function onRequest() {
  return json({ error: "method_not_allowed" }, 405);
}