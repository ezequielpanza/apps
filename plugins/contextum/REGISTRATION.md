# ChatGPT registration

1. Open ChatGPT on the web and enable Developer Mode for plugins.
2. Add the remote MCP endpoint: `https://contextum.pages.dev/mcp`.
3. Complete the registration and copy the technical Contextum app ID assigned by ChatGPT.
4. Copy `.app.json.example` to `.app.json` and replace `REPLACE_WITH_CHATGPT_CONTEXTUM_APP_ID` with that exact ID.
5. Add `"apps": "./.app.json"` to `.codex-plugin/plugin.json` before packaging the ChatGPT-bound release.

Do not use an app or connector ID copied from another workspace.
