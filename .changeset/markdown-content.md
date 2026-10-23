---
"wuppy": minor
"@wuppy/admin": minor
---

MDX for posts, pages, content types and sections, with security checks first. Bodies are parsed with Astro's own parser and saving is refused (422 `DISALLOWED_CONTENT`) for imports/exports, JavaScript expressions, unlisted components, non-JSON props, event handlers, Astro directives, dangerous tags and `javascript:`/`data:` links; Markdown bodies get the same tag/attribute/link checks. A collection can hold `.md` and `.mdx` side by side (existing files keep their extension). The starter uses `@astrojs/mdx` with MDX posts and pages, new content types default to MDX, section bodies are checked as MDX and render with `mdxContent` from `wuppy/mdx`, and an `.mdx` entry edited after the build renders on request. Runtime-compiled MDX gets the same heading ids, `headings` list and code highlighting as the build (`mdxContent` now returns `{ Content, headings }`). Custom widget bodies are MDX and HTML widget bodies are checked on save. `wuppy init` adds `@astrojs/mdx` and widens `*.md` content globs so wrapped projects get MDX too. Dependencies: hono 4.13.13 (security fixes).
