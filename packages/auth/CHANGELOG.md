# @wuppycms/auth

## 0.2.3

No changes in this release.

## 0.2.2

### Patch Changes

- Every package has a README, description, keywords and links on npm.

## 0.2.1

### Patch Changes

- better-auth and its passkey plugin moved to 1.7.12 together, so `npm install` of a new site no longer loops resolving `better-call`.

## 0.2.0

### Minor Changes

- Packages are published as WuppyCMS: `wuppycms` (import `wuppycms/astro`, integration `wuppycms()`, CLI `wuppycms`), `npm create wuppycms`, the `@wuppycms/*` scope and the `wuppycms-plugin` CLI. The create-wuppy template now ships only the starter files tracked in Git.

## 0.1.0

### Patch Changes

- 3c848cd: Themes from GitHub: Admin → Themes lists the Astro sites in your GitHub account (Connect GitHub opens GitHub's consent page for all repositories, `repo` scope; the server needs `WUPPY_GITHUB_CLIENT_SECRET`; tokens are sealed per user) and installs the one you pick as this site's design. The server clones it under `.wuppy/themes/`, wraps it, installs and builds it with the Node adapter, then switches to it and restarts; accounts are shared and a failed build leaves the current site running. The starter starts with `node serve.mjs`, which runs the active theme (the Docker image uses it). Linked OAuth tokens are now stored encrypted.
- 3c848cd: Wrap an existing Astro project with Wuppy. `wuppy init` reads the project's Markdown/MDX content collections, guesses their fields from the frontmatter, finds their routes, writes `wuppy.config.mjs` and adds the integration (and a Node adapter when missing). `wuppy import <git-url> <dir>` clones a repository and runs `init`; `wuppy import` with no URL lists your Astro repositories on GitHub (through the GitHub CLI, private ones included) to pick from. Edits publish instantly: pages that read Wuppy collections through `astro:content` read the files on disk and render on request, so a save shows on the next page load with no rebuild and no push (`wuppy({ live: false })` turns it off). `wuppy({ sitemap, robots, rss })` turns off routes the site already serves. The page cache skips prerendered pages. Frontmatter is no longer folded at 80 characters, so an edit changes only its own line. The auth package loads the `reflect-metadata` polyfill first, which some bundlers put after the passkey code.
