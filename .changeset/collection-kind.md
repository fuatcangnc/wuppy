---
"wuppy": minor
"@wuppy/admin": minor
---

A GitHub theme is design only; content stays in the site. Posts, pages, media, menus and settings are read and written in the site's folder also while a theme runs, so switching or updating a theme keeps them and edits are committed to the site's Git. The theme's collections are linked to the site's: `kind: "posts" | "pages"` (its `blog`, `about`) reads the site's Posts/Pages, `map` renames fields (`{ pubDate: "date" }`), and its `route` sets the public URLs; fields only the theme uses are added to the site's collection. Installing a theme copies its `.md` and `.mdx` sample entries into the site once, never over existing ones. `wuppy init` writes `kind` and `map` for common field names. The admin keeps fixed Posts and Pages sections. The visual editor's Code view shows the site's files under `site` and, for admins, the active theme's code under `theme: owner/repo` (editable, with Rebuild); the theme's sample-content folders are not listed since content lives in the site. A GitHub token that GitHub rejects (401) is dropped and the Themes page asks to connect again.
