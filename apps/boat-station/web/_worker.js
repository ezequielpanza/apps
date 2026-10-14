const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Cache-Control",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/APK_VERSION") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return env.ASSETS.fetch(request);
  },
};
