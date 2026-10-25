---
title: Themes from GitHub
description: Pick an Astro site from your GitHub in the admin and run it as this site's design.
sidebar:
  order: 21
---

**Themes** in the admin sidebar lists the Astro sites in your GitHub account. Pick one and Wuppy clones it on the server, wraps it like [`wuppycms init`](/guides/existing-astro-project/), builds it and switches the site over to it. The theme is the design only: your posts, pages, media and menus stay in the site, so switching themes keeps them.

## Connect GitHub

In **Themes**, click **Connect GitHub**. GitHub's consent page opens and asks you to allow Wuppy access to all your repositories, public and private (the `repo` scope). Approve it and you are back in **Themes** with your repositories listed.

Each admin connects their own GitHub account. The token is stored encrypted (with `WUPPY_SECRET`) in the site's database and never sent to the browser. **Disconnect** removes it; you can also revoke it on GitHub under Settings → Applications. When GitHub no longer accepts the token (revoked, or replaced by a newer sign-in), Wuppy forgets it and **Connect GitHub** shows again.

### Server setup

The server needs the GitHub OAuth app's secret, once:

1. In the OAuth app (GitHub → Settings → Developer settings → OAuth Apps), set **Authorization callback URL** to `<WUPPY_URL>/api/themes/github/callback`. An app has one callback host, so each domain needs its own app.
2. Set `WUPPY_GITHUB_CLIENT_SECRET` on the server, and `WUPPY_GITHUB_CLIENT_ID` when it is not Wuppy's app. Restart the server.

## Pick a repository

The list shows repositories you own, collaborate on or reach through an organization, newest push first, and only those whose `package.json` depends on Astro. Click **Install**:

1. **Cloning**: the repository goes to `.wuppy/themes/<owner>__<name>/` on the server.
2. **Wrapping**: `wuppycms init` finds the content collections and writes `wuppy.config.mjs`.
3. **Installing packages**: `npm install`. A theme on Astro older than 7.4 is moved to `^7.4.0` first: older Astro does not mark elements with their source line, so the visual editor could not list or select the theme's elements. If npm still installs an older Astro (an `overrides` entry, say), the install stops with a message instead of giving a theme the editor cannot edit. A theme that turns Astro's dev toolbar off gets it back while it runs for a site, since the marks come with it. For a theme installed before this, use **Rebuild** once.
4. **Building**: the site is built with the Node adapter, whatever adapter its own config uses (Cloudflare, Vercel…).
5. **Importing sample content**: the theme's own `.md` entries are copied into the site once, like a WordPress demo import. An entry the site already has (same file name) is never overwritten.

When the build succeeds the theme becomes active and the server restarts; the page reloads by itself. Accounts, passwords and sessions stay the same. If a step fails, the error is shown and the current site keeps running.

**Active** lists the built-in site and every theme built here. **Activate** switches between them without a new build. **Rebuild** first pulls what was pushed to GitHub since, then builds the theme again. Edits made on the server (visual editor, Code view) are kept. Where GitHub changed or deleted the same file, GitHub's version wins, and the server's version stays in the theme folder's `git stash`. Changes to `package.json`, the lockfile and `astro.config` are made again after the pull; `wuppy.config.mjs` is kept.

## Where content lives

```
site/
├─ content/posts/, content/pages/   ← your entries (Posts, Pages)
├─ content/<name>/                  ← other theme collections
├─ public/uploads/, .wuppy/data/    ← media, menus, settings
└─ .wuppy/themes/<owner>__<name>/   ← the theme: layouts, components, sample content
```

The theme's `wuppy.config.mjs` says which of its collections reads which site collection:

```js
{ name: "blog", dir: "src/content/blog", kind: "posts", map: { pubDate: "date" }, route: "/{slug}", fields: { … } }
```

- `kind: "posts"` / `"pages"`: the theme's `blog` shows the site's Posts, its `about` the site's Pages. A collection without `kind` is stored in the site's `content/<name>`.
- `map`: the theme's field name and the site's. The theme reads `pubDate`, the site stores `date`. `wuppycms init` fills it for common names (`pubDate`, `publishDate` → `date`; `heroImage`, `image` → `cover`).
- `route`: the theme decides the public URLs.
- Fields only the theme uses (`description`, `pinned`) are added to the site's collection, so editors can fill them. An entry missing a field the theme requires is not shown by the theme until it is filled in.

## Theme pages

A theme's Markdown pages (`src/pages/about.md`, `src/pages/docs/intro.mdx`) are content too. When the theme is
activated they are copied into the site's **Pages** (without the theme's `layout` line), so they are edited in the
admin like any page. The theme keeps serving them at the same URL with its own layout, and reads the site's entry on
each request: a save shows at once, no rebuild. A page the site has no entry for shows the theme's own text.

The theme's `.astro` pages (`index.astro`, `about.astro`, `tags/index.astro`, `404.astro`) are listed in **Pages** too,
marked **Theme page**, so every page of the site is in one place. Their own text is in the theme's code; the entry
holds the page's title, its `template` (the file, e.g. `src/pages/index.astro`), its SEO fields and a body:

- Blocks and theme components added to the body (in the visual editor or the Body field) render at the end of the
  page's `<main>`, or inside its last element when it has none. The visual editor edits them in place on the live page.
- **Edit** shows an **Open in Code view** button that opens the page's `.astro` file in the visual editor's Code view,
  for changes to the page's own markup.
- **SEO title**, **SEO description** and **noindex** set there replace the page's `<title>`, description and robots
  tags when the theme serves it.

A site page with the same name is kept and the theme page is not listed for it. Pages with parameters
(`[slug].astro`), files starting with `_` and endpoints (`rss.xml.js`) are not listed: edit them in Code view.

A page added in **Pages** that the theme has no page for (say `/test`) is shown in the layout of the theme's home page
(`src/pages/index.astro`): its header and footer stay, and the page's body takes the place of what the home page has in
its `<main>`. Its title is the page's title (or its SEO title). Build it with blocks and theme components in the visual
editor. A theme whose home page has no `<main>`, or is not an `.astro` file, answers 404 for such pages; a draft or
scheduled page is 404 until it is published.

## Requirements

- The server must be started with `node serve.mjs` (the Docker image does this) and a process manager that starts it again after it exits, such as Docker's `restart: unless-stopped`. In development, `pnpm dev` (`node dev.mjs`) runs `astro dev` inside the active theme with the site's content, so the preview is the theme; switching themes in the admin restarts it in the new theme by itself.
- `git` and `npm` on the server, and network access to GitHub and the npm registry.
- The repository must be an Astro 7 site. Markdown/MDX content collections are optional: without them the theme still installs, and its pages are edited in the visual editor. Its `.md` and `.mdx` sample entries are imported; component imports in `.mdx` are removed because the theme's components map is provided automatically. An entry the active theme cannot render (a component it does not have, such as another theme's `<Callout>`, or an import from a package) is shown without its body, and the server log names the file; the rest of the page still renders.

## What to know

- Only admins can use Themes: installing runs the repository's install scripts and build on the server. Install only repositories you trust.
- Content edits are committed in the site's Git repository. Theme code edited in the visual editor's Code view (root **theme: owner/repo**) is saved in the theme's folder only; nothing is pushed to GitHub.
- Sample images the theme references by a relative path (`../../assets/x.png`) do not come along with the imported entries; replace them from Media.
- If the build fails because of the repository (for example a post missing a field its content schema requires), fix it on GitHub and click **Install** again: a theme that never built is cloned afresh.
- A theme build contains the Wuppy version it was built with. After upgrading Wuppy, click **Rebuild**.
- If the active theme cannot start, `serve.mjs` logs the error and runs the built-in site instead.
- Only the site's root `package.json` is checked, so an Astro site inside a monorepo folder is not listed.
