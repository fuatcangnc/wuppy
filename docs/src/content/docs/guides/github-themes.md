---
title: Themes from GitHub
description: Pick an Astro site from your GitHub in the admin and run it as this site's design.
sidebar:
  order: 21
---

**Themes** in the admin sidebar lists the Astro sites in your GitHub account. Pick one and Wuppy clones it on the server, wraps it like [`wuppy init`](/guides/existing-astro-project/), builds it and switches the site over to it. Content in the repository becomes editable in the admin, and edits publish at once.

## Connect GitHub

In **Themes**, click **Connect GitHub**. GitHub's consent page opens and asks you to allow Wuppy access to all your repositories, public and private (the `repo` scope). Approve it and you are back in **Themes** with your repositories listed.

Each admin connects their own GitHub account. The token is stored encrypted (with `WUPPY_SECRET`) in the site's database and never sent to the browser. **Disconnect** removes it; you can also revoke it on GitHub under Settings → Applications.

### Server setup

The server needs the GitHub OAuth app's secret, once:

1. In the OAuth app (GitHub → Settings → Developer settings → OAuth Apps), set **Authorization callback URL** to `<WUPPY_URL>/api/themes/github/callback`. An app has one callback host, so each domain needs its own app.
2. Set `WUPPY_GITHUB_CLIENT_SECRET` on the server, and `WUPPY_GITHUB_CLIENT_ID` when it is not Wuppy's app. Restart the server.

## Pick a repository

The list shows repositories you own, collaborate on or reach through an organization, newest push first, and only those whose `package.json` depends on Astro. Click **Install**:

1. **Cloning**: the repository goes to `.wuppy/themes/<owner>__<name>/` on the server.
2. **Wrapping**: `wuppy init` finds the content collections and writes `wuppy.config.mjs`.
3. **Installing packages**: `npm install`.
4. **Building**: the site is built with the Node adapter, whatever adapter its own config uses (Cloudflare, Vercel…).

When the build succeeds the theme becomes active and the server restarts; the page reloads by itself. Accounts, passwords and sessions stay the same. If a step fails, the error is shown and the current site keeps running.

**Active** lists the built-in site and every theme built here. **Activate** switches between them without a new build. **Rebuild** builds an installed theme again.

## Requirements

- The server must be started with `node serve.mjs` (the Docker image does this) and a process manager that starts it again after it exits, such as Docker's `restart: unless-stopped`. Under `astro dev` the choice is saved and takes effect on the next start.
- `git` and `npm` on the server, and network access to GitHub and the npm registry.
- The repository must be an Astro 7 site with Markdown or MDX content collections.

## What to know

- Only admins can use Themes: installing runs the repository's install scripts and build on the server. Install only repositories you trust.
- Content edits are committed in the theme's own folder on the server and never pushed back to GitHub.
- If the build fails because of the repository (for example a post missing a field its content schema requires), fix it on GitHub and click **Install** again: a theme that never built is cloned afresh.
- **Rebuild** does not pull new commits from GitHub. To update, delete `.wuppy/themes/<owner>__<name>/` on the server and install again.
- A theme build contains the Wuppy version it was built with. After upgrading Wuppy, click **Rebuild**.
- If the active theme cannot start, `serve.mjs` logs the error and runs the built-in site instead.
- Only the site's root `package.json` is checked, so an Astro site inside a monorepo folder is not listed.
