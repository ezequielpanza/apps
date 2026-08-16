# Wander Google Apps Script persistence

This Apps Script is the temporary write bridge used by Wander for Google Sheets + Drive persistence.

## One-time deployment

1. Open the Wander spreadsheet.
2. Extensions → Apps Script.
3. Replace `Code.gs` with the repository `Code.gs` contents.
4. In Project Settings, enable `appsscript.json` visibility and replace it with the repository manifest if desired.
5. Deploy → New deployment → Web app.
6. Execute as: **Me**.
7. Who has access: **Anyone**.
8. Authorize Sheets + Drive access.
9. Open the deployed `/exec` URL once.

On the first GET/POST the script automatically writes `appsScriptUrl`, `persistenceProvider`, `appsScriptUpdatedAt` and `tracksFolderId` into the `_Meta` sheet. Wander's Cloudflare persistence proxy discovers that URL from the public `_Meta` sheet, so no APK rebuild or Cloudflare secret is required after deployment.

The mobile app remains offline-first: writes are queued locally and retried in the background until the script is available.
