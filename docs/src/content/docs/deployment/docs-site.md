---
title: This documentation site
description: How the docs are built, translated and published.
sidebar:
  order: 30
---

These docs live in the `docs/` folder of the Wuppy repository and are built with
[Starlight](https://starlight.astro.build). English is the main language; every page has a Turkish twin under
`tr/`, and `pnpm --filter @wuppy/docs test` fails if one is missing.

```sh
pnpm --filter @wuppy/docs dev     # local preview
DOCS_SITE=https://docs.example.com pnpm --filter @wuppy/docs build
```

`DOCS_SITE` is the only place the public address is set (it defaults to `https://docs.cigce.com.tr`). The build in
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
