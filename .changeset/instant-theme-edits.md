---
"wuppycms": patch
"@wuppycms/admin": patch
---

Theme element edits on a production server now show on the live site at once, for every kind of edit (text, class, style, add, delete, duplicate, move, tag), in `.astro` and React (`.tsx`/`.jsx`) files. The edit is written to the theme's file and laid over the built pages (`.wuppy/themes/overlay.json`) until the theme is built again; new Tailwind classes get their CSS from the theme's own Tailwind. The theme rebuilds in the background after about 90 seconds without edits, into `dist-next`, and is swapped in at the end, so the site keeps working during the build; editing goes on during a build too (a build that edits came in during is dropped and made again). Text typed into a React component now escapes `>` too. A Code view change no longer blocks visual edits of the same file until the build (only the elements it changed wait), and it starts the background build itself. The editor now knows a production Tailwind theme (its CSS is a linked sheet), so styles and AI edits are written as Tailwind classes there instead of inline style.
