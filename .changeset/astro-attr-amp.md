---
"wuppycms": patch
---

A theme attribute edit with `&` or `"` in it (a Tailwind variant like `sm:[&>*]:h-full`) is now written as a JS string (`class={"…"}`); Astro keeps `&amp;` in a quoted attribute as is, so the class never matched on the live site.
