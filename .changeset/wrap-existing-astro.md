---
"wuppy": minor
"@wuppy/auth": patch
---

Wrap an existing Astro project with Wuppy. `wuppy init` reads the project's Markdown/MDX content collections, guesses their fields from the frontmatter, finds their routes, writes `wuppy.config.mjs` and adds the integration (and a Node adapter when missing). `wuppy import <git-url> <dir>` clones a repository and runs `init`; `wuppy import` with no URL lists your Astro repositories on GitHub (through the GitHub CLI, private ones included) to pick from. Edits publish instantly: pages that read Wuppy collections through `astro:content` read the files on disk and render on request, so a save shows on the next page load with no rebuild and no push (`wuppy({ live: false })` turns it off). `wuppy({ sitemap, robots, rss })` turns off routes the site already serves. The page cache skips prerendered pages. Frontmatter is no longer folded at 80 characters, so an edit changes only its own line. The auth package loads the `reflect-metadata` polyfill first, which some bundlers put after the passkey code.
