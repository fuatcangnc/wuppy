---
"wuppy": patch
"@wuppy/admin": patch
---

Visual editor: the theme's own `.astro` markup on a live page can be edited. Click an element outside the blocks to edit its text, classes and inline style, move, duplicate or delete it, or open its file in Code view; changes are written to the theme file (`POST /api/themes/element`) and the page reloads. Works on the dev server, where Astro marks each element with its source. Theme files now reload on edit even though the theme runs inside the site's `.wuppy/` folder.
