---
"wuppy": patch
---

GitHub themes: a theme's static Markdown pages (`src/pages/about.md`) are copied into the site's Pages when the theme is activated and edited there like any page. The theme keeps serving them at the same URL with its own `layout`, reading the site's entry on each request (with `<!--wuppy:body-->` markers for the visual editor); without a site entry the theme's own text is shown.
