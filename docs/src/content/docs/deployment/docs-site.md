---
title: This documentation site
description: How the docs are built, translated and published.
sidebar:
  order: 30
---

These docs live in the `docs/` folder of the Wuppy repository and are built with
[Starlight](https://starlight.astro.build). English is the main language; every page has a Turkish twin under
`tr/`, and `pnpm --filter @wuppycms/docs test` fails if one is missing.

```sh
pnpm --filter @wuppycms/docs dev     # local preview
DOCS_SITE=https://docs.example.com pnpm --filter @wuppycms/docs build
```

`DOCS_SITE` is the only place the public address is set (it defaults to `https://docs.wuppycms.com`). The build in
`docs/dist` is static HTML; any web server can host it. With Caddy:

```txt
docs.example.com {
	root * /srv/docs
	encode zstd gzip
	file_server
	handle_errors {
		rewrite * /404.html
		file_server
	}
}
```

## The WuppyCMS addresses

| Address | What it serves |
| --- | --- |
| `wuppycms.com` | The landing page that introduces WuppyCMS (English at `/`, Turkish at `/tr/`). `www` redirects here. |
| `docs.wuppycms.com` | These docs. |
| `test.wuppycms.com` | Our own install of open-source WuppyCMS; sign in at `/admin`. |
| `app.wuppycms.com` | Reserved for WuppyCMS Cloud, the paid hosted service; until it opens, it redirects to `test`. |

The landing page is the `landing/` package of the repository, a static Astro site (Tailwind CSS 4 + bejamas/ui) whose
address is set by `LANDING_SITE`:

```sh
pnpm --filter @wuppycms/landing dev
LANDING_SITE=https://wuppycms.com pnpm --filter @wuppycms/landing build   # static HTML in landing/dist
```

Caddy serves `landing/dist` the same way as the docs, from its own folder (`root * /srv/landing`).
