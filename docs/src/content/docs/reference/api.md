---
title: REST API
description: How to call the Wuppy API from scripts and other apps.
---

The admin panel uses the same REST API that you can call yourself. The full schema is published as OpenAPI 3.1 at
`/api/openapi.json`.

## Authentication

- **Browser session**: the admin's own cookie. Every request that changes something must send
  `X-Wuppy-Request: 1` (CSRF protection).
- **API token**: `Authorization: Bearer wuppy_…`, created under **Users → API tokens**.

```sh
curl -H "Authorization: Bearer $TOKEN" -H "X-Wuppy-Request: 1" \
  https://example.com/api/content/posts
```

## Conventions

- **Errors** always look like `{ "error": { "code": "SLUG_TAKEN", "message": "…" } }`. Codes are listed in the
  OpenAPI schema.
- **Permissions**: each route needs exactly one permission; see [Roles and permissions](/concepts/roles-permissions/).
- **Conflicts**: reads return an `ETag`. Send it back as `If-Match` when saving; a stale write gets
  `409 CONFLICT` with the server's version.
- **Retries**: send an `Idempotency-Key` header on a `POST` to make a retry safe.
- **Rate limits**: writes are limited per user, sign-in per client.
- **TypeScript**: `AppType` works with Hono's `hc` client for a typed API.
