---
"wuppycms": patch
---

The Astro compiler used for theme element edits now loads only when an edit happens, so a production server bundled in a pnpm workspace no longer fails on `/api` with "Cannot find native binding".
