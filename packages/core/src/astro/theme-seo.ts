import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseDocument } from "../content/parsers/frontmatter.ts";
import { esc } from "../seo/index.ts";
import { loadSiteConfig, pagesDir, templateUrl } from "../themes/site.ts";

/** Puts a Pages entry's SEO fields into the `<head>` a theme page rendered. */
export function withSeo(html: string, data: Record<string, unknown>): string {
	const str = (k: string) => (typeof data[k] === "string" && data[k] ? (data[k] as string) : undefined);
	const title = str("seoTitle");
	const description = str("seoDescription");
	let out = html;
	if (title) out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
	const tags: string[] = [];
	if (description) {
		const meta = /<meta\s+name=["']description["'][^>]*>/i;
		const tag = `<meta name="description" content="${esc(description)}">`;
		if (meta.test(out)) out = out.replace(meta, tag);
		else tags.push(tag);
	}
	if (data.noindex === true) tags.push('<meta name="robots" content="noindex">');
	const at = out.search(/<\/head>/i);
	return tags.length && at !== -1 ? out.slice(0, at) + tags.join("") + out.slice(at) : out;
}

/** The site's Pages entries that stand for a theme `.astro` page, by the URL that page serves. */
async function templatePages(site: string, dir: string | undefined): Promise<Map<string, Record<string, unknown>>> {
	const map = new Map<string, Record<string, unknown>>();
	if (!dir) return map;
	const names = await readdir(join(site, dir), { recursive: true }).catch(() => [] as string[]);
	for (const name of names.filter((n) => /\.mdx?$/.test(n))) {
		const { data } = parseDocument(await readFile(join(site, dir, name), "utf8"));
		if (typeof data.template === "string") map.set(templateUrl(data.template), data);
	}
	return map;
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
		const data = (
			await templatePages(site, await (dir ??= loadSiteConfig(site, theme).then((c) => pagesDir(c.collections))))
		).get(path);
		if (!data) return res;
		const headers = new Headers(res.headers);
		headers.delete("content-length");
		return new Response(withSeo(await res.text(), data), { status: res.status, headers });
	};
}
