---
name: wuppy-theme
description: Adapt or change an Astro site that WuppyCMS manages — make its menus, site settings and content come from the Wuppy admin while it still builds on its own. Use when editing a theme with a wuppy.config.mjs, or when asked to make an Astro theme work with WuppyCMS.
---

# Working on a WuppyCMS theme

WuppyCMS (https://docs.wuppycms.com) manages this Astro site. Editors change posts, menus and settings in `/admin`; the theme only renders them. Keep the design in the theme and the editable data in Wuppy.

## Ground rules

- The theme must still build and run on its own (`npm run dev`, `npm run build`), without Wuppy data. Every value read from Wuppy needs a fallback: the theme's current hard-coded links and texts.
- Do not edit `wuppy.config.mjs`, `astro.wuppy.config.mjs` or anything under `.wuppy/`; do not commit `.wuppy/` or `.env`.
- Style with Tailwind CSS classes written in the markup. Keep `class` values literal strings where you can: the visual editor edits them in place, but cannot edit a class list built by code.
- Text from props or data arrays stays editable in the visual editor when the string appears once in the theme.

## Site data

Wuppy stores site data as JSON in `.wuppy/data/<name>.json` under the site folder. Wuppy builds and runs the theme with that folder in `WUPPY_BASE_ROOT`; on its own the theme has no such files. Read them on the server (frontmatter of a `.astro` file), never in client scripts.

```ts
// src/lib/wuppy.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** A Wuppy data file, or `fallback` when the theme runs without Wuppy. */
export async function wuppyData<T>(name: string, fallback: T): Promise<T> {
	const file = join(process.env.WUPPY_BASE_ROOT || process.cwd(), ".wuppy/data", `${name}.json`);
	return readFile(file, "utf8").then(
		(text) => JSON.parse(text) as T,
		(error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return fallback;
			throw error;
		},
	);
}
```

If the project lists `wuppycms` in its dependencies, `readData`, `getMenu`, `getSection` and `getWidgetArea` from `"wuppycms"` do the same.

### Menus (`menus`)

Admin › Menus. Each menu: `{ name, label, location, locale?, items }`. `location` is `header`, `footer` or `sidebar`. An item: `{ label, href, description?, children: [{ label, href, description? }] }` (one level of children). `href` is a path (`/about`, `/#pricing`) or an `http(s)` URL.

```ts
type Link = { label: string; href: string; description?: string };
type Menu = { label: string; location?: string; locale?: string; items: (Link & { children?: Link[] })[] };

/** The menu set for a location, in the page's language when it has one. */
export async function menuAt(location: string, locale?: string): Promise<Menu | null> {
	const menus = (await wuppyData<Menu[]>("menus", [])).filter((m) => m.location === location && m.items.length);
	return menus.find((m) => locale && m.locale === locale) ?? menus.find((m) => !m.locale) ?? menus[0] ?? null;
}
```

In the header component: `const menu = await menuAt("header", Astro.currentLocale);` and map `menu.items` to the existing markup, keeping the old hard-coded list when `menu` is null. Map `children` to the dropdown and show `description` only when it is set; open `http(s)` links in a new tab if the theme did. Do the same for the footer with `"footer"`: top-level items as column titles and their children as links, or a flat menu as one column.

### Settings (`settings`)

Admin › Settings: `siteName`, `description`, `logo` (a URL), `locale`, `seo.title`, `seo.description`, `seo.image`. Use them for the logo, site name and default meta tags, with the theme's own values as fallback.

### Sections and widgets (`sections`, `widgets`)

Sections are reusable Markdown blocks (`{ slug, title, body, draft, locale? }`); widget areas are lists of widgets (`{ name, label, widgets }`). Use `getSection`/`getWidgetArea` from `"wuppycms"` when it is installed: they pick the language and sanitize HTML. Do not render a section or widget `body` as raw HTML yourself.

## Content

Collections are listed in `wuppy.config.mjs`; posts and pages edited in the admin are the Markdown files in those folders. Keep reading them with `getCollection`/`getEntry` from `astro:content`: Wuppy renders such pages on request, so new posts show without a build. Pages built ahead (no `astro:content`) pick up menu and settings changes when Wuppy builds the theme again, which it does by itself after a change in the admin.

## Check

- `npm run build` passes with no `.wuppy/` folder: the fallbacks work.
- With a `.wuppy/data/menus.json` (point `WUPPY_BASE_ROOT` at a folder holding one), the header and footer show its links.
