# create-wuppy

## 0.3.0

### Patch Changes

- Publish a site on Cloudflare: `wuppycms export` saves the built site as static files, and new sites get a `build:cloudflare` script and a `wrangler.jsonc`.
- A site created with `npm create wuppycms` and installed with pnpm now serves `/admin` (it answered 404: the admin files were looked up only in the site's own `node_modules`). New sites also get their `.gitignore` back (npm drops it from the published template) and `site.url` set to the `--url` given.

## 0.2.4

No changes in this release.

## 0.2.3

No changes in this release.

## 0.2.2

### Patch Changes

- Every package has a README, description, keywords and links on npm.

## 0.2.1

No changes in this release.

## 0.2.0

### Minor Changes

- Packages are published as WuppyCMS: `wuppycms` (import `wuppycms/astro`, integration `wuppycms()`, CLI `wuppycms`), `npm create wuppycms`, the `@wuppycms/*` scope and the `wuppycms-plugin` CLI. The create-wuppy template now ships only the starter files tracked in Git.

## 0.1.0

### Minor Changes

- 3c848cd: New sites start with a designed starter theme built on Tailwind CSS 4 and bejamas/ui. It includes a dark top bar, a sticky header with a bejamas navigation menu and drop-downs, a hero, numbered post cards, a call-to-action band and a dark footer, set in Space Grotesk with an orange accent. Brand tokens live in `src/styles/theme.css`, and more bejamas components can be added with `npx bejamas add`.
