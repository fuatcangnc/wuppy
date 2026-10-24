---
"wuppycms": patch
---

`wuppycms init` and GitHub theme installs no longer fail on an Astro site without Markdown/MDX content collections: the site is wrapped with `collections: []` and a warning.
