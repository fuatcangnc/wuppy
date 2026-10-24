---
title: Getting started
description: Create a Wuppy site, run it locally and sign in to the admin.
---

Wuppy is a CMS for [Astro](https://astro.build). Content lives in your repository as Markdown files, the admin panel
is served at `/admin`, and every change is a Git commit.

## Requirements

- Node.js 22.16 or newer
- Git
- pnpm (recommended) or npm

## Create a site

```sh
npm create wuppycms my-site
cd my-site
```

The new project is a copy of the starter template: an Astro site with **Pages** and **Posts** collections, a menu,
SEO tags, a sitemap, RSS, search and a 404 page.

Already have an Astro site on GitHub? Run `npx wuppycms import` instead and pick it from the list; see [Existing Astro project](/guides/existing-astro-project/).

## Set the environment

Create `.env` next to `package.json`:

```sh
# 32+ random characters; signs sessions and preview links. Keep it stable.
WUPPY_SECRET=...   # openssl rand -base64 32
# The public origin of the site (required in production).
WUPPY_URL=http://localhost:4321
```

All other settings are optional. See [Environment variables](/reference/environment/).

## Run it

```sh
pnpm install
pnpm dev
```

Open `http://localhost:4321/admin`. The first visit asks you to name the site and create the **owner** account.
Optionally it creates a sample "Hello world" post. After this, public sign-up closes: new people join only by
invitation.

:::tip
Passkeys need a real host name. Open the admin at `http://localhost:4321`, not `127.0.0.1`.
:::

## Check the setup

```sh
pnpm wuppycms doctor
```

`doctor` checks that the config loads, the content folders exist, Git is ready and `WUPPY_SECRET` is long enough.

## Next steps

- [How Wuppy works](/concepts/how-it-works/)
- [Configure collections and fields](/concepts/configuration/)
- [Write and publish content](/guides/content/)
- [Deploy with Docker](/deployment/docker/)
