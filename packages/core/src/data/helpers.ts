import { sanitizeHtml } from "../security/sanitize.ts";
import { readData } from "./read.ts";
import { creditsOf } from "../bylines/index.ts";
import type { Byline, Menu, Section, Taxonomy, WidgetArea } from "./schemas.ts";

/** Template helpers: read the site data files under `.wuppy/data`. All take `root` for tests; templates omit it. */

/** The menu `name` in `locale`, else the menu without a locale. */
export async function getMenu(name: string, locale?: string, root?: string): Promise<Menu | null> {
	const menus = await readData<Menu[]>("menus", [], root);
	const named = menus.filter((m) => m.name === name);
	return named.find((m) => locale && m.locale === locale) ?? named.find((m) => !m.locale) ?? null;
}

const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

/** `/blog/*` matches the blog and everything below it; any other pattern must equal the path (trailing slash ignored). */
export function pathMatches(pattern: string, path: string): boolean {
	if (pattern.endsWith("/*")) {
		const base = trimSlash(pattern.slice(0, -2)) || "";
		return trimSlash(path) === (base || "/") || trimSlash(path).startsWith(`${base}/`);
	}
	return trimSlash(pattern) === trimSlash(path);
}

/** Widgets of an area visible for the given locale, collection and page path, with HTML widgets already sanitized. */
export async function getWidgetArea(
	name: string,
	where: { locale?: string; collection?: string; path?: string } = {},
	root?: string,
): Promise<WidgetArea["widgets"]> {
	const area = (await readData<WidgetArea[]>("widgets", [], root)).find((a) => a.name === name);
	return (area?.widgets ?? [])
		.filter((w) => !w.locales?.length || (where.locale !== undefined && w.locales.includes(where.locale)))
		.filter(
			(w) => !w.collections?.length || (where.collection !== undefined && w.collections.includes(where.collection)),
		)
		.filter((w) => !w.paths?.length || (where.path !== undefined && w.paths.some((p) => pathMatches(p, where.path!))))
		.map((w) => (w.type === "html" ? { ...w, body: sanitizeHtml(w.body) } : w));
}

const localized = (b: Byline, locale?: string): Byline => {
	const t = locale ? b.translations[locale] : undefined;
	return t ? { ...b, name: t.name || b.name, bio: t.bio ?? b.bio } : b;
};

/** A byline, with the name and bio of `locale` when translated. The email is never returned. */
export async function getByline(slug: string, root?: string, locale?: string): Promise<Byline | null> {
	const found = (await readData<Byline[]>("bylines", [], root)).find((b) => b.slug === slug);
	return found ? localized({ ...found, email: "" }, locale) : null;
}

/** Credits of a `byline` field value, resolved to profiles; unknown slugs are skipped. */
export async function getCredits(
	value: unknown,
	root?: string,
	locale?: string,
): Promise<Array<{ byline: Byline; role?: string | undefined }>> {
	const all = await readData<Byline[]>("bylines", [], root);
	return creditsOf(value).flatMap(({ byline, role }) => {
		const found = all.find((b) => b.slug === byline);
		return found ? [{ byline: localized({ ...found, email: "" }, locale), role }] : [];
	});
}

/** The published section `slug`; the variant for `locale` wins over the language-neutral one. */
export async function getSection(slug: string, root?: string, locale?: string): Promise<Section | null> {
	const all = (await readData<Section[]>("sections", [], root)).filter((s) => s.slug === slug && !s.draft);
	return (locale && all.find((s) => s.locale === locale)) || all.find((s) => !s.locale) || null;
}

/** Published sections in the order of `slugs`; unknown and draft ones are skipped. */
export async function getSections(slugs: readonly string[], root?: string, locale?: string): Promise<Section[]> {
	return (await Promise.all(slugs.map((slug) => getSection(slug, root, locale)))).flatMap((s) => s ?? []);
}

export async function getTaxonomy(name: string, root?: string): Promise<Taxonomy | null> {
	return (await readData<Taxonomy[]>("taxonomies", [], root)).find((t) => t.name === name) ?? null;
}
