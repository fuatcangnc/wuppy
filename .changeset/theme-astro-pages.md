---
"wuppy": patch
"@wuppy/admin": patch
---

GitHub themes: a theme's static `.astro` pages (`index.astro`, `tags/index.astro`, `404.astro`) are listed in the site's Pages as **Theme page** entries that name their file (`template`). Blocks and theme components added to the entry's body render at the end of the page's `<main>` (edited in place in the visual editor), "Open in Code view" opens its `.astro` file, and the entry's SEO title, description and noindex are applied to the page the theme serves. Preview links and "View on site" use the page's own URL.

Theme pages are imported with the theme's required text fields (such as `description`) set empty, so they save. A failed validation now names the fields (`Invalid input: description`).
