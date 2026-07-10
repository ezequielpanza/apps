const MCP_VERSION = "0.3.0";
const DEFAULT_PROTOCOL = "2025-03-26";
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, accept, mcp-session-id",
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

const getContextTool = {
  name: "get_context",
  title: "Get current Contextum context",
  description: "Reads the latest temporary read-only Contextum snapshot for a user-provided 8-character pairing code. Use when the user asks about current location, movement, active note, or Contextum runtime state.",
  inputSchema: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "Temporary 8-character Contextum pairing code shown by the Contextum app.",
        minLength: 8,
        maxLength: 8
      }
    },
    required: ["code"],
    additionalProperties: false
  },
  outputSchema: {
    type: "object",
    properties: {
      source: { type: "string" },
      access: { type: "string" },
      context: { type: "object", additionalProperties: true }
    },
    required: ["source", "access", "context"],
    additionalProperties: false
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

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
    return {
      ok: true,
      value: {
        source: "contextum",
        access: "temporary-read-only",
        context: JSON.parse(value)
      }
    };
  } catch (_) {
    return { ok: false, error: "invalid_context", message: "The stored Contextum snapshot is invalid." };
  }
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
      instructions: "Contextum provides temporary read-only access to live personal context. Ask the user for a current pairing code before calling get_context."
    });
  }

  if (method === "ping") {
    return rpcResult(id, {});
  }

  if (method === "tools/list") {
    return rpcResult(id, { tools: [getContextTool] });
  }

  if (method === "tools/call") {
    if (params.name !== "get_context") {
      return rpcError(id, -32602, "Unknown tool");
    }

    const result = await readContextByCode(env, params.arguments?.code);
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
      tools: ["get_context"]
    });
  }

  if (request.method === "DELETE") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  return json({ error: "method_not_allowed" }, 405);
}
