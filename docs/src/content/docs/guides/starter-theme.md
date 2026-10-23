---
title: Starter theme
description: The design every new Wuppy site starts with, and how to change it.
sidebar:
  order: 20
---

Every site made with `create-wuppy` starts with the **starter theme**: a dark top bar, a boxed header that turns dark and sticks to the top as you scroll, a large hero, numbered post cards, a dark call-to-action band and a dark footer. The typeface is Space Grotesk, the accent colour is orange and corners are square.

## What it reads from Wuppy

| Part of the page | Comes from |
| --- | --- |
| Site name, top bar text, logo | **Settings** → site name, description, logo (with no logo, the first letter of the site name is shown in an orange square) |
| Header links and drop-downs | The menu assigned to the **header** location; nested items become drop-downs, and a menu button on phones |
| Footer link column | The menu assigned to the **footer** location (the header menu if there is none) |
| Footer boxes | The **footer** widget area |
| Page `lang` | **Settings** → locale |
| Title, description, social cards | **SEO** settings and each entry's SEO fields |

Posts, pages, author, category and tag pages, search, comments and the 404 page all use the same design. Inline title editing, preview links and the **Edit this page** button keep working.

## Change the look

The theme is built with **Tailwind CSS 4** and **bejamas/ui** components. The header menu is bejamas `NavigationMenu`, and the buttons are bejamas `Button`.

- `src/styles/theme.css` loads Tailwind, `tw-animate-css` and the bejamas styles, then sets the brand tokens. Change the brand here:

```css
:root {
	--primary: #dd641e; /* accent: buttons, highlights, card numbers */
	--ink: #111111; /* text */
	--navy: #121820; /* top bar, inner-page hero, footer */
	--font: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
}
```

- `src/ui/` holds the bejamas components. To add another one, run `npx bejamas add <component>` (the settings are in `components.json`, and the `@/` alias points to `src/`).
- `src/layouts/Base.astro` is the layout and `src/components/SiteHeader.astro` is the header. Inner pages use `PageHero.astro` and lists use `PostCard.astro`.
- Use Tailwind classes in your own pages as usual.
