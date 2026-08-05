(() => {
  "use strict";

  const button = document.getElementById("mcpTestButton");
  const pairCode = document.getElementById("pairCode");
  const box = document.getElementById("mcpTestBox");
  const state = document.getElementById("mcpTestState");
  const tool = document.getElementById("mcpTool");
  const version = document.getElementById("mcpVersion");
  const freshness = document.getElementById("mcpFreshness");
  const accuracy = document.getElementById("mcpAccuracy");
  const raw = document.getElementById("mcpTestRaw");

  if (!button || !pairCode || !box) return;

  function resetResult() {
    tool.textContent = "—";
    version.textContent = "—";
    freshness.textContent = "—";
    accuracy.textContent = "—";
    raw.textContent = "";
  }

  async function callMcp(code) {
    const response = await fetch("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "get_current_context",
          arguments: { code }
        }
      }),
      cache: "no-store"
    });

    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return JSON.parse(text);
  }

  button.addEventListener("click", async () => {
    const code = pairCode.textContent.trim().toUpperCase();
    box.hidden = false;
    resetResult();

    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
      state.textContent = "Código inválido";
      state.className = "error";
      return;
    }

    button.disabled = true;
    button.textContent = "Probando…";
    state.textContent = "Consultando";
    state.className = "pending";

    try {
      const rpc = await callMcp(code);
      const result = rpc?.result;
      if (result?.isError) {
        const message = result.content?.[0]?.text || "Error MCP";
        throw new Error(message);
      }

      const data = result?.structuredContent;
      const context = data?.context;
      if (!data || !context) throw new Error("Respuesta MCP incompleta");

      tool.textContent = "get_current_context";
      version.textContent = context.appVersion || "—";
      freshness.textContent = data.freshness?.status || "unknown";
      accuracy.textContent = Number.isFinite(context.location?.accuracyM)
        ? `±${Math.round(context.location.accuracyM)} m`
        : "—";
      raw.textContent = JSON.stringify(data, null, 2);
      state.textContent = data.freshness?.isStale ? "Correcto, desactualizado" : "Correcto";
      state.className = data.freshness?.isStale ? "pending" : "active";
    } catch (error) {
      state.textContent = "Falló";
      state.className = "error";
      raw.textContent = error instanceof Error ? error.message : "Error desconocido";
    } finally {
      button.disabled = false;
      button.textContent = "Probar MCP";
    }
  });
})();
