const MCP_VERSION = "0.4.0";
const DEFAULT_PROTOCOL = "2025-03-26";
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
const LIVE_SECONDS = 120;
const RECENT_SECONDS = 600;

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, accept, authorization, mcp-session-id",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extra
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders({ "Content-Type": "application/json; charset=utf-8" })
  });
}

function rpcResult(id, result) {
  return json({ jsonrpc: "2.0", id, result });
}

function rpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return json({ jsonrpc: "2.0", id: id ?? null, error });
}

const contextInputSchema = {
  type: "object",
  properties: {
    code: {
      type: "string",
      description: "Temporary 8-character pairing code shown by Contextum.",
      minLength: 8,
      maxLength: 8,
      pattern: "^[A-HJ-NP-Z2-9]{8}$"
    }
  },
  required: ["code"],
  additionalProperties: false
};

const contextOutputSchema = {
  type: "object",
  properties: {
    source: { type: "string" },
    access: { type: "string" },
    freshness: {
      type: "object",
      properties: {
        basedOn: { type: ["string", "null"] },
        ageSeconds: { type: ["integer", "null"] },
        status: { type: "string", enum: ["live", "recent", "stale", "unknown"] },
        isStale: { type: "boolean" }
      },
      required: ["basedOn", "ageSeconds", "status", "isStale"],
      additionalProperties: false
    },
    context: { type: "object", additionalProperties: true }
  },
  required: ["source", "access", "freshness", "context"],
  additionalProperties: false
};

const getCurrentContextTool = {
  name: "get_current_context",
  title: "Get current Contextum context",
  description: "Reads the latest Contextum snapshot associated with a temporary pairing code. Use for the user's current coordinates, GPS accuracy, movement data, active note, and runtime state. Always tell the user how fresh the snapshot is and warn when it is stale.",
  inputSchema: contextInputSchema,
  outputSchema: contextOutputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

const legacyGetContextTool = {
  ...getCurrentContextTool,
  name: "get_context",
  title: "Get Contextum context (legacy)",
  description: "Legacy alias for get_current_context. Prefer get_current_context for new calls."
};

function freshnessFor(snapshot) {
  const timestamp = snapshot?.receivedAt || snapshot?.capturedAt || snapshot?.location?.timestamp || null;
  if (!timestamp) {
    return { basedOn: null, ageSeconds: null, status: "unknown", isStale: true };
  }

  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return { basedOn: timestamp, ageSeconds: null, status: "unknown", isStale: true };
  }

  const ageSeconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
  if (ageSeconds <= LIVE_SECONDS) {
    return { basedOn: timestamp, ageSeconds, status: "live", isStale: false };
  }
  if (ageSeconds <= RECENT_SECONDS) {
    return { basedOn: timestamp, ageSeconds, status: "recent", isStale: false };
  }
  return { basedOn: timestamp, ageSeconds, status: "stale", isStale: true };
}

async function readContextByCode(env, rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    return { ok: false, error: "invalid_code", message: "The pairing code must contain 8 valid characters." };
  }

  const hash = await env.CONTEXTUM_KV.get(`pair:${code}`);
  if (!hash) {
    return { ok: false, error: "expired_or_unknown", message: "The pairing code is expired or unknown." };
  }

  const value = await env.CONTEXTUM_KV.get(`context:${hash}`);
  if (!value) {
    return { ok: false, error: "context_not_found", message: "No Contextum snapshot is available for this code." };
  }

  try {
    const context = JSON.parse(value);
    return {
      ok: true,
      value: {
        source: "contextum",
        access: "temporary-read-only",
        freshness: freshnessFor(context),
        context
      }
    };
  } catch (_) {
    return { ok: false, error: "invalid_context", message: "The stored Contextum snapshot is invalid." };
  }
}

async function callContextTool(id, env, args) {
  const result = await readContextByCode(env, args?.code);
  if (!result.ok) {
    return rpcResult(id, {
      isError: true,
      content: [{ type: "text", text: `${result.error}: ${result.message}` }]
    });
  }

  return rpcResult(id, {
    structuredContent: result.value,
    content: [{ type: "text", text: JSON.stringify(result.value) }]
  });
}

async function handleRpc(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch (_) {
    return rpcError(null, -32700, "Parse error");
  }

  if (Array.isArray(payload)) {
    return rpcError(null, -32600, "Batch requests are not supported");
  }

  const id = payload?.id;
  const method = payload?.method;
  const params = payload?.params || {};

  if (payload?.jsonrpc !== "2.0" || typeof method !== "string") {
    return rpcError(id, -32600, "Invalid Request");
  }

  if (method.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: corsHeaders() });
  }

  if (method === "initialize") {
    const requestedProtocol = typeof params.protocolVersion === "string" ? params.protocolVersion : DEFAULT_PROTOCOL;
    return rpcResult(id, {
      protocolVersion: requestedProtocol,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "contextum", version: MCP_VERSION },
      instructions: "Contextum provides temporary read-only access to live personal context. Ask for a current 8-character pairing code when one is not already present. Prefer get_current_context and always report snapshot freshness."
    });
  }

  if (method === "ping") {
    return rpcResult(id, {});
  }

  if (method === "tools/list") {
    return rpcResult(id, { tools: [getCurrentContextTool, legacyGetContextTool] });
  }

  if (method === "tools/call") {
    if (params.name === "get_current_context" || params.name === "get_context") {
      return callContextTool(id, env, params.arguments);
    }
    return rpcError(id, -32602, "Unknown tool");
  }

  return rpcError(id, -32601, "Method not found");
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method === "POST") {
    return handleRpc(request, env);
  }

  if (request.method === "GET") {
    return json({
      name: "contextum",
      version: MCP_VERSION,
      transport: "streamable-http",
      endpoint: "/mcp",
      tools: ["get_current_context", "get_context"]
    });
  }

  if (request.method === "DELETE") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  return json({ error: "method_not_allowed" }, 405);
}
