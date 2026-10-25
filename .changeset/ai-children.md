---
"wuppycms": patch
"@wuppycms/admin": patch
---

The visual editor's AI now sees a picked theme element's children and styles them from the parent with Tailwind variants (`md:[&>:nth-child(1)]:col-span-2`), so "make this a bento grid" also sizes the cards, even ones made by `.map()`. An AI answer without edits shows as its reply instead of failing.
