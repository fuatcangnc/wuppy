---
title: Cloudflare
description: Publish a Wuppy site on Cloudflare Workers as static files, built from your Git repository.
sidebar:
  order: 2
---

Cloudflare Workers cannot run the Wuppy admin: it needs Node, a disk and Git. What Cloudflare can host is the public
site. `wuppycms export` turns the built site into plain files, and Cloudflare serves them from its network.

The workflow:

1. Edit on your computer: `npm run dev`, then `/admin`. Every save is a Git commit.
2. `git push` to GitHub (or GitLab).
3. Cloudflare sees the push, runs `npm run build:cloudflare` and publishes the result.

You do not need to install Wrangler yourself; Cloudflare runs it during the build.

## Sites made with `npm create wuppycms`

New sites already have what Cloudflare needs: a `build:cloudflare` script and a `wrangler.jsonc` named after the site.

1. Push the site to a GitHub repository.
2. In the Cloudflare dashboard, open **Workers & Pages → Create → Import a repository** and pick it.
3. Set **Build command** to `npm run build:cloudflare` and keep **Deploy command** `npx wrangler deploy`.
4. Under **Variables**, add `NODE_VERSION` = `24`.
5. Deploy. Add your domain under the Worker's **Settings → Domains & Routes**, and set `site.url` in
   `wuppy.config.mjs` to it so the sitemap and feed have the right links.

## Older sites

Update Wuppy (`npm install wuppycms@latest`), then add the script to `package.json`:

```json
"build:cloudflare": "astro build && wuppycms export"
```

and a `wrangler.jsonc` next to it:

```jsonc
{
	"name": "my-site",
	"compatibility_date": "2026-10-01",
	"assets": { "directory": "./dist-static", "not_found_handling": "404-page" }
}
```

Add `dist-static` and `.wrangler` to `.gitignore`.

## What `wuppycms export` does

It starts the built server (`dist/server/entry.mjs`) on a free local port and saves every page it can reach from `/`,
the sitemap and the RSS feed, with the uploads they use, into `dist-static/` (`--out <dir>` to change it).

- Drafts and scheduled posts are left out, as on the live site. A scheduled post appears with the next build: push
  again, or add a **Deploy Hook** in Cloudflare and call it on a schedule.
- Your 404 page becomes `404.html`. Exact and wildcard redirects become `_redirects`; regex redirects are left out.
- Images are saved at their original size: resized variants (`?w=`) need the Node server.
- Pages only linked from client-side code are not found. Link them from a page or list them in the sitemap.

## What stays on the Node server

The static copy has no `/admin`, no API, no comments form, no visual editor and no AI assistant. For those, run Wuppy
on a server ([Docker](/deployment/docker/)). You can still put that server behind Cloudflare's proxy for caching.
