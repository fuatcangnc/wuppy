---
title: Docker
description: Run a Wuppy site as a single Node container.
---

The repository ships a `Dockerfile` and `docker-compose.yml` that build the starter site as a Node standalone server.

```sh
export WUPPY_SECRET=$(openssl rand -base64 32)
export WUPPY_URL=https://example.com
docker compose up --build
```

- `WUPPY_SECRET` (32+ characters) signs sessions and preview links. Keep it stable across restarts.
- `WUPPY_URL` is the public origin; sign-in only accepts requests from it.
- Two volumes hold the state: `content` (your Markdown and its Git history) and `.wuppy` (auth database, site data).
  Back both up, or use Settings -> Backups.
- The container runs as the unprivileged `node` user and has a health check on `/api/setup`.
- Put a reverse proxy in front for TLS and set `WUPPY_TRUSTED_PROXIES` to its address so rate limits use the real client IP.
