---
"wuppycms": patch
"@wuppycms/admin": patch
---

The visual editor selects one use of a theme component at a time (a `<SectionHeader />` used three times in a section no longer selects all three). Class edits, move, duplicate, delete and adding next to its outer element change only that use, through the call's `className`/`class` (a component class is replaced with the theme's `tailwind-merge`). A class list built by code (`className={cn("flex gap-5", …)}`) can now be edited; its string literals change.
