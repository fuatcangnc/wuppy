// THEME_GUIDE is the body of skills/wuppy-theme/SKILL.md (a test keeps them equal); `wuppycms init` writes it to AGENTS.md.
export const THEME_GUIDE =
	'# Working on a WuppyCMS theme\n\nWuppyCMS (https://docs.wuppycms.com) manages this Astro site. Editors change posts, menus and settings in `/admin`; the theme only renders them. Keep the design in the theme and the editable data in Wuppy.\n\n## Ground rules\n\n- The theme must still build and run on its own (`npm run dev`, `npm run build`), without Wuppy data. Every value read from Wuppy needs a fallback: the theme\'s current hard-coded links and texts.\n- Do not edit `wuppy.config.mjs`, `astro.wuppy.config.mjs` or anything under `.wuppy/`; do not commit `.wuppy/` or `.env`.\n- Style with Tailwind CSS classes written in the markup. Keep `class` values literal strings where you can: the visual editor edits them in place, but cannot edit a class list built by code.\n- Text from props or data arrays stays editable in the visual editor when the string appears once in the theme.\n\n## Site data\n\nWuppy stores site data as JSON in `.wuppy/data/<name>.json` under the site folder. Wuppy builds and runs the theme with that folder in `WUPPY_BASE_ROOT`; on its own the theme has no such files. Read them on the server (frontmatter of a `.astro` file), never in client scripts.\n\n```ts\n// src/lib/wuppy.ts\nimport { readFile } from "node:fs/promises";\nimport { join } from "node:path";\n\n/** A Wuppy data file, or `fallback` when the theme runs without Wuppy. */\nexport async function wuppyData<T>(name: string, fallback: T): Promise<T> {\n\tconst file = join(process.env.WUPPY_BASE_ROOT || process.cwd(), ".wuppy/data", `${name}.json`);\n\treturn readFile(file, "utf8").then(\n\t\t(text) => JSON.parse(text) as T,\n\t\t(error: NodeJS.ErrnoException) => {\n\t\t\tif (error.code === "ENOENT") return fallback;\n\t\t\tthrow error;\n\t\t},\n\t);\n}\n```\n\nIf the project lists `wuppycms` in its dependencies, `readData`, `getMenu`, `getSection` and `getWidgetArea` from `"wuppycms"` do the same.\n\n### Menus (`menus`)\n\nAdmin › Menus. Each menu: `{ name, label, location, locale?, items }`. `location` is `header`, `footer` or `sidebar`. An item: `{ label, href, description?, children: [{ label, href, description? }] }` (one level of children). `href` is a path (`/about`, `/#pricing`) or an `http(s)` URL.\n\n```ts\ntype Link = { label: string; href: string; description?: string };\ntype Menu = { label: string; location?: string; locale?: string; items: (Link & { children?: Link[] })[] };\n\n/** The menu set for a location, in the page\'s language when it has one. */\nexport async function menuAt(location: string, locale?: string): Promise<Menu | null> {\n\tconst menus = (await wuppyData<Menu[]>("menus", [])).filter((m) => m.location === location && m.items.length);\n\treturn menus.find((m) => locale && m.locale === locale) ?? menus.find((m) => !m.locale) ?? menus[0] ?? null;\n}\n```\n\nIn the header component: `const menu = await menuAt("header", Astro.currentLocale);` and map `menu.items` to the existing markup, keeping the old hard-coded list when `menu` is null. Map `children` to the dropdown and show `description` only when it is set; open `http(s)` links in a new tab if the theme did. Do the same for the footer with `"footer"`: top-level items as column titles and their children as links, or a flat menu as one column.\n\n### Settings (`settings`)\n\nAdmin › Settings: `siteName`, `description`, `logo` (a URL), `locale`, `seo.title`, `seo.description`, `seo.image`. Use them for the logo, site name and default meta tags, with the theme\'s own values as fallback.\n\n### Sections and widgets (`sections`, `widgets`)\n\nSections are reusable Markdown blocks (`{ slug, title, body, draft, locale? }`); widget areas are lists of widgets (`{ name, label, widgets }`). Use `getSection`/`getWidgetArea` from `"wuppycms"` when it is installed: they pick the language and sanitize HTML. Do not render a section or widget `body` as raw HTML yourself.\n\n## Content\n\nCollections are listed in `wuppy.config.mjs`; posts and pages edited in the admin are the Markdown files in those folders. Keep reading them with `getCollection`/`getEntry` from `astro:content`: Wuppy renders such pages on request, so new posts show without a build. Pages built ahead (no `astro:content`) pick up menu and settings changes when Wuppy builds the theme again, which it does by itself after a change in the admin.\n\n## Check\n\n- `npm run build` passes with no `.wuppy/` folder: the fallbacks work.\n- With a `.wuppy/data/menus.json` (point `WUPPY_BASE_ROOT` at a folder holding one), the header and footer show its links.\n';

/** Tasks for a coding agent, copied in Admin › AI › Theme prompts and listed in the docs (a test keeps them equal). */
export const THEME_PROMPTS = [
	{
		id: "adapt",
		label: "Adapt the whole theme",
		prompt:
			"Adapt this Astro theme to WuppyCMS following the WuppyCMS theme guide (AGENTS.md): read the header and footer menus, the site settings (name, logo, meta tags) and the content collections from Wuppy, keep every current value as a fallback, and check that `npm run build` passes without a `.wuppy` folder.",
	},
	{
		id: "menus",
		label: "Connect the menus",
		prompt:
			"Following the WuppyCMS theme guide (AGENTS.md), make the header and footer use the WuppyCMS menus for the `header` and `footer` locations, with the current links as fallback. Show a link's description in dropdowns when it is set, and keep the existing markup and classes.",
	},
	{
		id: "settings",
		label: "Use the site settings",
		prompt:
			"Following the WuppyCMS theme guide (AGENTS.md), use the WuppyCMS site settings for the site name, logo and default title, description and social image, with the theme's current values as fallback.",
	},
	{
		id: "widgets",
		label: "Add a widget area",
		prompt:
			'Following the WuppyCMS theme guide (AGENTS.md), render the WuppyCMS widget area named "sidebar" (created under Admin › Widgets) in the blog sidebar with `getWidgetArea` from "wuppycms", and show nothing when it has no widgets.',
	},
] as const;
