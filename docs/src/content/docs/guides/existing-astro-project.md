---
title: Existing Astro project
description: Wrap an Astro site you already have with Wuppy, without moving its content; edits publish instantly.
sidebar:
  order: 16
---

If your site is already an Astro project with Markdown content in a Git repository, Wuppy can sit on top of it. The files stay where they are, your pages and design stay as they are, and every edit in the admin becomes a commit in the same repository.

## Wrap a project

In the project root:

```sh
npx wuppy init
npm install
npm run dev   # then open /admin
```

Or clone and wrap in one step:

```sh
npx wuppy import https://github.com/acme/site.git acme-site
```

### Pick a repository from GitHub

In the admin, **Themes** does the same on the server: see [Themes from GitHub](/guides/github-themes/). On the command line, run `wuppy import` without a URL to choose from your own GitHub repositories:

```sh
npx wuppy import
```

It lists the repositories you own, collaborate on or reach through an organization, newest push first, and shows only those whose `package.json` depends on Astro. Private repositories are marked. Type the number of the one you want: it is cloned into a folder named after the repository and wrapped.

This uses the [GitHub CLI](https://cli.github.com/), so private repositories work with your own login. Install it and run `gh auth login` once. An Astro site inside a subfolder of a monorepo is not listed; pass its URL instead.

`wuppy init` does the following:

- Reads `src/content.config.ts` (or `src/content/config.ts`) and keeps every collection that holds `.md` files. JSON/YAML data collections and remote loaders are listed as skipped and left alone. Projects without a content config are read from `src/content/<name>/`.
- Guesses each field from the frontmatter already in the files: dates, booleans, numbers, string lists, images (by key name or file extension), long text and plain strings. A field present in every file becomes required. Keys it does not know are still kept when an entry is saved.
- Finds the public URL of each collection from the `[slug]` or `[...slug]` page that calls `getCollection("<name>")`.
- Writes `wuppy.config.mjs`, adds `wuppy()` to `integrations` in `astro.config`, and adds the Node adapter if there is no adapter yet.
- Adds `@astrojs/mdx`, widens `.md` globs to `.mdx`, and imports the components it finds in `.mdx` files into the allowlist. `wuppy mdx-to-md` can still convert component-free `.mdx` files to `.md`.
- Adds `wuppy` (and `@astrojs/node` when needed) to `package.json`, Wuppy's ignore lines to `.gitignore`, and a random `WUPPY_SECRET` to `.env`.

Nothing is overwritten: an existing `wuppy.config.mjs` stops the command unless you pass `--force`. When `astro.config` has a shape it cannot patch safely, it prints the line to add by hand.

Review the generated `wuppy.config.mjs`: it is a starting point. Turn a `string` into a `select`, add `help` text, or set a `route` it could not find.

## Routes the site already has

Wuppy serves `/sitemap.xml`, `/robots.txt` and `/rss.xml`. If the project already has one of these files (for example `public/robots.txt`), `init` turns Wuppy's version off. `@astrojs/sitemap` writes `/sitemap-index.xml`, so it does not clash:

```js
integrations: [wuppy({ robots: false }), sitemap()],
```

It warns if `src/pages/admin`, `src/pages/api` or `src/pages/uploads` exist, because Wuppy uses those paths.

## Instant publishing

A save in the admin shows on the public site with the next page load. There is no rebuild and nothing is pushed anywhere: the server edits the files in its own copy of the project and commits them there, so every change keeps its history and can be undone.

Your pages do not change. They keep calling `getCollection()`, `getEntry()` and `render()` from `astro:content`; for the collections in `wuppy.config.mjs` these now read the files on disk:

- A file that has not changed since the build is served exactly as Astro built it.
- A new or edited `.md` file is parsed with the collection's own schema and rendered with Astro's Markdown renderer.
- Pages that read collections are rendered on request instead of at build time. If such a page has `getStaticPaths()`, Wuppy calls it on each request to find the page's props, and answers with your 404 page when no path matches. Pages that do not read collections stay static.
- Rendered pages are cached until the next save, so the extra work happens once per change.

Astro prints `getStaticPaths() ignored in dynamic page` for these pages during the build. That is expected; do not add `prerender = true`, or the page stops updating.

To turn this off and go back to rebuilding on every change: `wuppy({ live: false })`.

To publish the edits back to your Git host, push from the server yourself when you want (`git push`). Wuppy never pushes.

## What to know

- Edited Markdown is rendered with Astro's default Markdown settings. Remark/rehype plugins from your config, and images referenced with a relative path (`./photo.jpg`), apply after the next build. Images under `public/` or uploaded through Wuppy work at once.
- A project's own `.mdx` files are not listed in the admin and are served as built.
- `@astrojs/sitemap` lists only pages built at build time. Wuppy's `/sitemap.xml` lists the collection pages, so add it to `robots.txt` next to `sitemap-index.xml`.
- The admin needs a server: the wrapped site gets server routes through the Node adapter. Pages that were static stay static.
