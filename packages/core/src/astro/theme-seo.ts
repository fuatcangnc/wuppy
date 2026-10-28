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

/** Puts a Pages entry's SEO, Open Graph, schema and custom-code fields into the `<head>` a theme page rendered. */
export function withSeo(html: string, data: Record<string, unknown>, origin?: string): string {
	const str = (k: string) => (typeof data[k] === "string" && data[k] ? (data[k] as string) : undefined);
	const seoTitle = str("seoTitle");
	const seoDescription = str("seoDescription");
	const ogTitle = str("ogTitle") || seoTitle;
	const ogDescription = str("ogDescription") || seoDescription;
	const ogImage = str("ogImage") || str("cover");
	const canonical = str("canonical");
	let out = html;
	const tags: string[] = [];
	const setMeta = (attribute: "name" | "property", key: string, content: string) => {
		const tag = `<meta ${attribute}="${key}" content="${esc(content)}">`;
		const re = new RegExp(`<meta\\s+${attribute}=["']${escapeRegExp(key)}["'][^>]*>`, "i");
		if (re.test(out)) out = out.replace(re, tag);
		else tags.push(tag);
	};

	if (seoTitle) out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(seoTitle)}</title>`);
	if (seoDescription) setMeta("name", "description", seoDescription);
	if (ogTitle) setMeta("property", "og:title", ogTitle);
	if (ogDescription) setMeta("property", "og:description", ogDescription);
	if (ogImage) setMeta("property", "og:image", absolute(ogImage, origin));
	if (canonical) {
		const clean = canonical.length > 1 ? canonical.replace(/\/+$/, "") : canonical;
		const href = absolute(clean, origin);
		const tag = `<link rel="canonical" href="${esc(href)}">`;
		const re = /<link\s+rel=["']canonical["'][^>]*>/i;
		if (re.test(out)) out = out.replace(re, tag);
		else tags.push(tag);
		setMeta("property", "og:url", href);
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

/** A theme run for a site: the theme's `.astro` pages get the SEO title, description and noindex set in the admin. */
export function createThemeSeoMiddleware(site: string, theme: string) {
	let dir: Promise<string | undefined> | undefined;
	return async (ctx: { request: Request; url: URL }, next: () => Promise<Response>): Promise<Response> => {
		if (ctx.request.method !== "GET") return next();
		const res = await next();
		if (res.status !== 200 || !(res.headers.get("content-type") ?? "").includes("text/html")) return res;
		const path = ctx.url.pathname.replace(/\/$/, "") || "/";
		// shortcut: reads the Pages folder per HTML request; cache it if a site grows many pages.
		const data =
			(await templatePages(site, await (dir ??= loadSiteConfig(site, theme).then((c) => pagesDir(c.collections))))).get(
				path,
			) ?? (await entryTitle(site, theme, path));
		if (!data) return res;
		const headers = new Headers(res.headers);
		headers.delete("content-length");
		return new Response(withSeo(await res.text(), data, ctx.url.origin), { status: res.status, headers });
	};
}
