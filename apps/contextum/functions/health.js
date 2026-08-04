const SERVICE_VERSION = "0.4.0";

export function onRequestGet() {
  return new Response(JSON.stringify({
    ok: true,
    service: "contextum",
    version: SERVICE_VERSION,
    mcp: "/mcp",
    tools: ["get_current_context", "get_context"]
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export function onRequest() {
  return new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
