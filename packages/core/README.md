# wuppycms

A file-based, Git-backed CMS for [Astro](https://astro.build). WuppyCMS adds an admin panel to your Astro site: content
stays in Markdown and MDX files in your repository, every save is a Git commit, and editors get a visual editor.

## Start a new site

```sh
npm create wuppycms my-site
cd my-site
npm install
npm run dev
```

Open `http://localhost:4321/admin` and create the first account.

## Add it to an existing Astro site

```sh
npm install wuppycms
npx wuppycms init
```

`wuppycms init` finds your content collections, writes `wuppy.config.mjs` and adds the integration:

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import wuppycms from "wuppycms/astro";

export default defineConfig({
	integrations: [wuppycms()],
});
```

## Use content in templates

```astro
---
import { getMenu, readData } from "wuppycms";
const menu = await getMenu("main");
---
```

## What you get

- Collections and fields from `wuppy.config.mjs`; forms are built from them
- Revisions, diffs and restore from Git history
- A visual editor for blocks and for your theme's own markup
- Users and roles, two-factor sign-in, passkeys and a security log
- Media with focal points and crops, menus, redirects, SEO and sitemaps
- Plugins in a WebAssembly sandbox, webhooks, an AI assistant and managed sites

## CLI

| Command | Does |
| --- | --- |
| `wuppycms init` | wrap an existing Astro project |
| `wuppycms upgrade` | migrate project data after updating the package |
| `wuppycms types` | generate TypeScript types for your collections |
| `wuppycms doctor` | check the setup |

Requires Node.js 22.16 or later and Astro 7.4 or later.

## Links

- Website: [wuppycms.com](https://wuppycms.com)
- Documentation: [docs.wuppycms.com](https://docs.wuppycms.com)
- Source: [GitHub](https://github.com/fuatcangnc/wuppy)
