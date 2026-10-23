---
"wuppy": patch
"@wuppy/admin": patch
---

Visual editor: on a local site the canvas loads the entry's live page and edits the body in place, inside the theme's own layout, styles and scripts, so any Astro theme that renders the entry with `<Content />` looks the same in the editor as live (dark mode included). The integration marks the rendered body with `<!--wuppy:body-->` comments. Without a marked body the canvas falls back to a blank frame that copies the site's stylesheet, `<html>`/`<body>` attributes and inline head scripts.
