# Wander cloud backup (test channel)

This backup is intentionally limited to Android builds. The public WebApp ships with `backup/config.js` disabled and never contains the shared token.

## One-time activation

1. Create an R2 bucket named `wander-travel-backups`.
2. Open the `wander-travel` Pages project.
3. Add an R2 binding for production and preview:
   - Variable name: `WANDER_BACKUP_BUCKET`
   - Bucket: `wander-travel-backups`
4. Create a GitHub Actions repository secret named `WANDER_BACKUP_SPACE_TOKEN`.

Use a randomly generated value with at least 32 bytes of entropy, for example:

```bash
openssl rand -hex 32
```

The deployment workflow copies that GitHub secret into the encrypted Cloudflare Pages secret with the same name before publishing. It then verifies that `/api/backup` can access R2. The release APK workflow refuses to publish an APK when the repository secret is missing.

The Android build passes the token only to `mobile/build-web.mjs`. The build writes an enabled `mobile-dist/backup/config.js` into the APK. The committed WebApp configuration stays disabled.

## Behavior

- The APK remains local-first and works without connectivity.
- On startup it checks Cloudflare before uploading anything.
- A new or reinstalled APK restores the existing snapshot and reloads once.
- Changes to personal POIs, sessions/routes, recording settings, travel-log entries, and plans schedule an automatic backup.
- Stale installations cannot silently overwrite a newer snapshot; they merge the current cloud data before retrying.
- The endpoint retains the latest snapshot and one previous snapshot in R2.
- There is no remote delete endpoint.

## Test-only security model

Every APK built with the shared token belongs to the same backup space. A technically capable person can extract a bundled token from an APK, so this mechanism must be replaced by real accounts, device enrollment, or platform attestation before public distribution.
