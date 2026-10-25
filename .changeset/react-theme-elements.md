---
"wuppycms": patch
---

The visual editor now edits the elements of a theme's React components (`.tsx`/`.jsx` rendered on the server), not only `.astro` files: text, classes (written as `className`), inline style (written as a style object), tag, insert, duplicate, move and delete. `typescript` is now a runtime dependency of `wuppycms` (it parses those files).

Theme element edits on a production server no longer fail with "__filename is not defined in ES module scope" (or a missing native binding): the Astro compiler and TypeScript are loaded from where `wuppycms` is installed instead of being bundled into the theme's build.

On a production server a theme element edit now rebuilds the theme by itself a few seconds after the last edit, instead of asking for Rebuild.
