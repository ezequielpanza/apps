# Wander Web Acquisition

Policy-gated dynamic-page acquisition service for Wander Travel.

## Purpose

This Worker uses Cloudflare Browser Run only for sources whose explicit Wander source policy allows automated acquisition. The service is intentionally deny-by-default.

Google Maps and Tripadvisor are hard-blocked server-side and remain external-discovery-only sources in Wander.

## Runtime requirements

- Cloudflare Browser Run binding named `BROWSER`
- Worker secret `ACQUISITION_TOKEN`
- `ALLOWED_SOURCES_JSON` containing explicit per-source policies

Example policy value:

```json
{
  "example-source": {
    "automatedAcquisition": true,
    "allowedHosts": ["example.org"],
    "maxWaitMs": 8000
  }
}
```

An empty object means no source can be captured.

## Endpoints

### `GET /health`

Returns service status, whether capture authentication is configured, the default policy mode, and hard-blocked source IDs.

### `POST /capture`

Requires:

```text
Authorization: Bearer <ACQUISITION_TOKEN>
Content-Type: application/json
```

Body:

```json
{
  "sourceId": "example-source",
  "url": "https://example.org/page"
}
```

The Worker validates:

1. authentication token exists and matches
2. source is explicitly enabled
3. source is not hard-blocked
4. URL uses HTTP(S)
5. host matches the source allowlist
6. private-network targets are rejected
7. final URL after navigation still matches the allowlist

## Deployment

CI validates syntax and performs a Wrangler dry-run bundle. The Worker is not automatically deployed yet because production deployment requires an `ACQUISITION_TOKEN` secret and an explicit non-empty source allowlist.
