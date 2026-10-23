---
title: Docker
description: Run a Wuppy site as a single Node container.
sidebar:
  order: 1
---

The repository ships a `Dockerfile` and `docker-compose.yml` that build the starter site as a Node standalone server.

```sh
export WUPPY_SECRET=$(openssl rand -base64 32)
export WUPPY_URL=https://example.com
docker compose up --build
```

- `WUPPY_SECRET` (32+ characters) signs sessions and preview links. Keep it stable across restarts.
- `WUPPY_URL` is the public origin; sign-in only accepts requests from it.
- Volumes hold the state: `content` (your Markdown), `uploads`, `history` (Git history) and `state` (`.wuppy`: auth
  database, site data). Back them up, or use Settings → Backups.
- The container runs as the unprivileged `node` user and has a health check on `/api/setup`.
- It starts with `node serve.mjs`, which runs the theme picked in [Themes from GitHub](/guides/github-themes/) when there is one. Keep `restart: unless-stopped`: switching themes exits the server so Docker starts it again. Themes are built into the `state` volume.
- Put a reverse proxy in front for TLS and set `WUPPY_TRUSTED_PROXIES` to its address so rate limits use the real client IP.

## HTTPS with Caddy

[Caddy](https://caddyserver.com) gets certificates automatically. Run it next to Wuppy in the same compose file:

```txt
example.com {
	encode zstd gzip
	reverse_proxy wuppy:4321
}
```

and set `WUPPY_TRUSTED_PROXIES: 172.16.0.0/12` on the Wuppy service so it trusts Caddy on the Docker network.

## Several sites on one server

Each site is its own container with its own `.env` file, `WUPPY_URL` and volumes. Add one Caddy block per domain.
Connect them to a hub to manage them together; see [Managed sites](/sites/managed-sites/).
