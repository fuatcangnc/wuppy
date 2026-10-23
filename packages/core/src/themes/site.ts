import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadConfig, type WuppyConfig } from "../config/index.ts";
import type { Collection } from "../content-types/index.ts";
import { parseDocument, serializeDocument } from "../content/parsers/frontmatter.ts";
import { stripComponentImports } from "../markdown/index.ts";

/**
 * A GitHub theme is design only; content belongs to the site. A theme's collections are stored in the site:
 * one with `kind: "posts"`/`"pages"` (its `blog`, `about`) in the site's Posts/Pages collection, any other one in
 * `content/<name>`. `map` renames the theme's fields to the site's (`pubDate` -> `date`).
 */

/** The site's folder (content, media, data, accounts); a theme runs from its own folder with this set. */
export const siteRoot = (): string => process.env.WUPPY_BASE_ROOT || process.cwd();

/** The running theme's folder, or undefined when the site runs itself. */
export const themeRoot = (): string | undefined =>
	resolve(process.cwd()) === resolve(siteRoot()) ? undefined : process.cwd();

const kindOf = (c: Collection) => c.kind ?? (c.name === "posts" || c.name === "pages" ? c.name : undefined);

/** One theme collection and where its entries live, relative to the site. `rename` is site field -> theme field. */
export interface ThemeLink {
	name: string;
	dir: string;
	rename: Record<string, string>;
}

/** The site's collections with the theme's routes and extra fields added, and where each theme collection reads. */
export function linkTheme(site: Collection[], theme: Collection[]): { collections: Collection[]; links: ThemeLink[] } {
	const collections = site.map((c) => ({ ...c, fields: { ...c.fields } }));
	const links: ThemeLink[] = [];
	for (const t of theme) {
		const kind = kindOf(t);
		const found = collections.find((c) => (kind ? kindOf(c) === kind : c.name === t.name));
		const name = kind ?? t.name;
		const target = found ?? { name, dir: `content/${name}`, format: t.format, fields: {} };
		if (!found) collections.push(target);
		const map = t.map ?? {};
		// The site's own field definitions win; fields only the theme reads are added so editors can fill them.
		for (const [field, type] of Object.entries(t.fields)) target.fields[map[field] ?? field] ??= type;
		// The theme decides the public URLs.
		if (t.route) target.route = t.route;
		links.push({
			name: t.name,
			dir: target.dir,
			rename: Object.fromEntries(Object.entries(map).map(([from, to]) => [to, from])),
		});
	}
	return { collections, links };
}

/** The site's config; with a theme, its collections linked in (`links` says where the theme reads). */
export async function loadSiteConfig(site: string, theme?: string): Promise<WuppyConfig & { links: ThemeLink[] }> {
	const config = await loadConfig(site);
	if (!theme) return { ...config, links: [] };
	const linked = linkTheme(config.collections, (await loadConfig(theme)).collections);
	return { ...config, collections: linked.collections, links: linked.links };
}

/** Theme frontmatter as the site stores it, or the reverse with an inverted map. */
export function renameFields(data: Record<string, unknown>, rename: Record<string, string>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data)) out[rename[key] ?? key] = value;
	return out;
}

/**
 * Copies a theme's sample entries into the site once, when it is installed: like a WordPress theme's demo import.
 * Existing site entries are never overwritten; `.md` and `.mdx` files keep their extension.
 */
export async function importDemo(site: string, theme: string): Promise<string[]> {
	const siteConfig = await loadConfig(site);
	const themeConfig = await loadConfig(theme);
	const { links } = linkTheme(siteConfig.collections, themeConfig.collections);
	const copied: string[] = [];
	for (const [i, t] of themeConfig.collections.entries()) {
		const link = links[i]!;
		const from = join(theme, t.dir);
		const names = await readdir(from, { recursive: true }).catch(() => [] as string[]);
		for (const name of names.filter((n) => /\.mdx?$/.test(n)).toSorted()) {
			const target = join(site, link.dir, name);
			const taken = await access(target).then(
				() => true,
				() => false,
			);
			if (taken) continue;
			const doc = parseDocument(await readFile(join(from, name), "utf8"));
			await mkdir(dirname(target), { recursive: true });
			await writeFile(
				target,
				serializeDocument({
					data: renameFields(doc.data, t.map ?? {}),
					body: name.endsWith(".mdx") ? stripComponentImports(doc.body) : doc.body,
				}),
			);
			copied.push(join(link.dir, name));
		}
	}
	return copied;
}

/** The site's Pages collection folder (`kind: "pages"`, or the collection named `pages`), if it has one. */
export const pagesDir = (collections: Collection[]): string | undefined =>
	collections.find((c) => kindOf(c) === "pages")?.dir;

/** A theme's static pages (`src/pages/about.md`, `index.astro`): no `[param]` routes, `_partials` or endpoints. */
export async function themePageFiles(theme: string): Promise<string[]> {
	const names = await readdir(join(theme, "src/pages"), { recursive: true }).catch(() => [] as string[]);
	return names
		.map((n) => n.split("\\").join("/"))
		.filter((n) => /\.(mdx?|astro)$/.test(n) && !n.includes("[") && !n.split("/").some((part) => part.startsWith("_")))
		.toSorted();
}

/** A page's title from its path: `index` is Home, `tags/index` is Tags, `about-me` is About me. */
export const pageTitle = (rel: string): string => {
	const name =
		rel
			.replace(/(^|\/)index$/, "")
			.split("/")
			.at(-1) ?? "";
	return name ? name.charAt(0).toUpperCase() + name.slice(1).replaceAll("-", " ") : "Home";
};

/** The URL a theme page file serves: `src/pages/tags/index.astro` → `/tags`. */
export const templateUrl = (template: string): string =>
	"/" +
	template
		.replace(/^src\/pages\//, "")
		.replace(/\.astro$/, "")
		.replace(/(^|\/)index$/, "");

/**
 * A theme's pages become entries of the site's Pages collection, so they are listed and edited in the admin like any
 * page. Markdown pages bring their text; the theme keeps serving them at their URL with its own layout (see
 * theme-pages.ts), and the theme-specific `layout` stays in the theme file. An `.astro` page keeps its text in code: its
 * entry only names it (`template`), so the admin opens that file and edits the page's SEO fields. Existing site pages
 * are never overwritten.
 */
export async function importPages(site: string, theme: string): Promise<string[]> {
	const pages = (await loadSiteConfig(site, theme)).collections.find((c) => kindOf(c) === "pages");
	if (!pages) return [];
	const { dir } = pages;
	// The theme may require fields its pages do not carry (an `.astro` page has no `description`): start them empty so
	// the entry can be saved, and the field shows in the admin to fill in.
	const required = Object.entries(pages.fields).flatMap(([k, f]) =>
		typeof f === "object" && f.required && (f.type === "string" || f.type === "text") ? [k] : [],
	);
	const copied: string[] = [];
	for (const name of await themePageFiles(theme)) {
		const rel = name.replace(/\.(mdx?|astro)$/, "");
		const base = join(site, dir, rel);
		const taken = await Promise.any([".md", ".mdx"].map((ext) => access(base + ext))).then(
			() => true,
			() => false,
		);
		if (taken) continue;
		const astro = name.endsWith(".astro");
		const file = astro ? `${rel}.md` : name;
		const doc = astro
			? { data: { title: pageTitle(rel), template: `src/pages/${name}` }, body: "" }
			: parseDocument(await readFile(join(theme, "src/pages", name), "utf8"));
		const { layout: _layout, ...rest } = doc.data;
		for (const k of required) rest[k] ??= "";
		await mkdir(dirname(base), { recursive: true });
		await writeFile(join(site, dir, file), serializeDocument({ data: rest, body: doc.body }));
		copied.push(join(dir, file));
	}
	return copied;
}
