import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseDocument } from "../content/parsers/frontmatter.ts";
import { esc, renderJsonLd } from "../seo/index.ts";
import { loadSiteConfig, pagesDir, routedEntry, templateUrl } from "../themes/site.ts";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const absolute = (value: string, origin?: string) => {
	if (!origin) return value;
	try {
		return new URL(value, origin).href;
	} catch {
		return value;
	}
};

export interface SeoSite {
	name?: string;
	url?: string;
	image?: string;
	description?: string;
}

/** Puts a page's SEO, Open Graph, schema and custom-code fields into the `<head>` a theme page rendered. */
export function withSeo(
	html: string,
	data: Record<string, unknown>,
	origin?: string,
	site?: SeoSite,
	path?: string,
): string {
	const str = (k: string) => (typeof data[k] === "string" && data[k] ? (data[k] as string) : undefined);
	const existingTitle = html
		.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
		?.replace(/<[^>]+>/g, "")
		.trim();
	const existingDescription = html
		.match(/<meta\s+name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)?.[1]
		?.trim();
	// Page settings are authoritative when present. A theme with no page entry still gets Open Graph tags from its
	// own title/description and the site settings, so a theme never has to repeat the same boilerplate.
	const hasContext = Boolean(origin || site || path);
	const seoTitle = str("seoTitle");
	const seoDescription = str("seoDescription");
	const ogTitle = str("ogTitle") || seoTitle || (hasContext ? str("title") || existingTitle : undefined);
	const ogDescription =
		str("ogDescription") || seoDescription || (hasContext ? str("description") || existingDescription : undefined);
	const ogImage = str("ogImage") || str("cover") || (hasContext ? site?.image : undefined);
	const canonical = str("canonical");
	const publicOrigin = site?.url || origin;
	let out = html;
	const tags: string[] = [];
	const setMeta = (attribute: "name" | "property", key: string, content: string) => {
		const tag = `<meta ${attribute}="${key}" content="${esc(content)}">`;
		const re = new RegExp(`<meta\\s+${attribute}=["']${escapeRegExp(key)}["'][^>]*>`, "i");
		if (re.test(out)) out = out.replace(re, tag);
		else tags.push(tag);
	};
	const hasMeta = (attribute: "name" | "property", key: string) =>
		new RegExp(`<meta\\s+${attribute}=["']${escapeRegExp(key)}["'][^>]*>`, "i").test(out);

	if (seoTitle) out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(seoTitle)}</title>`);
	if (seoDescription) setMeta("name", "description", seoDescription);
	if (ogTitle) setMeta("property", "og:title", ogTitle);
	if (ogDescription) setMeta("property", "og:description", ogDescription);
	if (ogImage) setMeta("property", "og:image", absolute(ogImage, publicOrigin));
	if (ogTitle) setMeta("name", "twitter:title", ogTitle);
	if (ogDescription) setMeta("name", "twitter:description", ogDescription);
	if (ogImage) setMeta("name", "twitter:image", absolute(ogImage, publicOrigin));
	if (ogImage) setMeta("name", "twitter:card", "summary_large_image");
	if (site?.name) setMeta("property", "og:site_name", site.name);
	if (hasContext && !hasMeta("property", "og:type")) setMeta("property", "og:type", "website");
	let canonicalHref: string | undefined;
	if (canonical) {
		const clean = canonical.length > 1 ? canonical.replace(/\/+$/, "") : canonical;
		canonicalHref = absolute(clean, publicOrigin);
		const tag = `<link rel="canonical" href="${esc(canonicalHref)}">`;
		const re = /<link\s+rel=["']canonical["'][^>]*>/i;
		if (re.test(out)) out = out.replace(re, tag);
		else tags.push(tag);
		setMeta("property", "og:url", canonicalHref);
	} else if (hasContext && path && publicOrigin) {
		canonicalHref = absolute(path, publicOrigin);
		if (!hasMeta("property", "og:url")) setMeta("property", "og:url", canonicalHref);
	}
	if (data.noindex === true) setMeta("name", "robots", "noindex");

	if (str("schemaJson")) {
		try {
			const schema: unknown = JSON.parse(str("schemaJson")!);
			if (schema && typeof schema === "object") tags.push(renderJsonLd(schema));
		} catch {
			// Invalid JSON is ignored; the editor warns the user before saving.
		}
	}
	if (str("customHead")) tags.push(str("customHead")!);
	const at = out.search(/<\/head>/i);
	if (tags.length && at !== -1) out = out.slice(0, at) + tags.join("") + out.slice(at);

	const customBody = str("customBody");
	if (customBody) {
		const bodyAt = out.search(/<\/body>/i);
		out = bodyAt === -1 ? out + customBody : out.slice(0, bodyAt) + customBody + out.slice(bodyAt);
	}
	return out;
}

/**
 * The site's Pages entries by URL: one that stands for a theme `.astro` page at the URL that page serves, any other at
 * its own path, titled by its title when it has no SEO title (the site page route renders it in the home page's head).
 */
async function templatePages(site: string, dir: string | undefined): Promise<Map<string, Record<string, unknown>>> {
	const map = new Map<string, Record<string, unknown>>();
	if (!dir) return map;
	const names = await readdir(join(site, dir), { recursive: true }).catch(() => [] as string[]);
	for (const name of names.filter((n) => /\.mdx?$/.test(n))) {
		const { data } = parseDocument(await readFile(join(site, dir, name), "utf8"));
		if (typeof data.template === "string") map.set(templateUrl(data.template), data);
		else {
			const path = `/${name
				.split("\\")
				.join("/")
				.replace(/\.mdx?$/, "")}`;
			// shortcut: the site's title template is not applied; the page's own title stands alone.
			if (!map.has(path)) map.set(path, { ...data, seoTitle: data.seoTitle || data.title });
		}
	}
	return map;
}

/** A content type's entry shown by the site page route, titled like a page. */
async function entryTitle(site: string, theme: string, path: string): Promise<Record<string, unknown> | undefined> {
	const found = await routedEntry(site, theme, path);
	if (!found) return undefined;
	const { data } = parseDocument(found.source);
	return { ...data, seoTitle: data.seoTitle || data.title };
}

interface SiteSettings {
	siteName?: string;
	siteUrl?: string;
	description?: string;
	seo?: { image?: string; description?: string };
}

async function readSiteSettings(root: string): Promise<SiteSettings> {
	return JSON.parse(await readFile(join(root, ".wuppy/data/settings.json"), "utf8").catch(() => "{}")) as SiteSettings;
}

/** A theme run for a site: the theme's `.astro` pages get the SEO, Open Graph, schema and code fields set in the admin. */
export function createThemeSeoMiddleware(site: string, theme: string) {
	let configPromise: ReturnType<typeof loadSiteConfig> | undefined;
	let settingsPromise: Promise<SiteSettings> | undefined;
	return async (ctx: { request: Request; url: URL }, next: () => Promise<Response>): Promise<Response> => {
		if (ctx.request.method !== "GET") return next();
		const res = await next();
		if (res.status !== 200 || !(res.headers.get("content-type") ?? "").includes("text/html")) return res;
		const path = ctx.url.pathname.replace(/\/$/, "") || "/";
		const config = await (configPromise ??= loadSiteConfig(site, theme));
		const settings = await (settingsPromise ??= readSiteSettings(site));
		const data =
			(await templatePages(site, pagesDir(config.collections))).get(path) ?? (await entryTitle(site, theme, path));
		const headers = new Headers(res.headers);
		headers.delete("content-length");
		const publicUrl = settings.siteUrl || config.site?.url || ctx.url.origin;
		return new Response(
			withSeo(
				await res.text(),
				data ?? {},
				publicUrl,
				{
					name: settings.siteName || config.site?.name,
					url: publicUrl,
					image: settings.seo?.image,
					description: settings.seo?.description,
				},
				path,
			),
			{ status: res.status, headers },
		);
	};
}
