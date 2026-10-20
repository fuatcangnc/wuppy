export interface Site {
	url: string;
	name: string;
}

export interface SeoInput {
	site: Site;
	path: string;
	title?: string;
	description?: string;
	image?: string;
	noindex?: boolean;
	/** locale -> path, for hreflang */
	alternates?: Record<string, string>;
}

export type MetaTag = { name: string; content: string } | { property: string; content: string };
export interface LinkTag {
	rel: string;
	href: string;
	hreflang?: string;
}
export interface Seo {
	title: string;
	meta: MetaTag[];
	links: LinkTag[];
}

const abs = (site: Site, pathOrUrl: string) => new URL(pathOrUrl, site.url).href;

export function buildSeo({ site, path, title, description, image, noindex, alternates }: SeoInput): Seo {
	const url = new URL(path, site.url);
	const canonical = `${url.origin}${url.pathname}`;
	const fullTitle = title ? `${title} | ${site.name}` : site.name;
	const meta: MetaTag[] = [
		...(description ? [{ name: "description", content: description }] : []),
		...(noindex ? [{ name: "robots", content: "noindex, nofollow" }] : []),
		{ property: "og:title", content: title ?? site.name },
		{ property: "og:site_name", content: site.name },
		{ property: "og:url", content: canonical },
		{ property: "og:type", content: "website" },
		...(description ? [{ property: "og:description", content: description }] : []),
		...(image ? [{ property: "og:image", content: abs(site, image) }] : []),
		{ name: "twitter:card", content: image ? "summary_large_image" : "summary" },
	];
	const links: LinkTag[] = [
		{ rel: "canonical", href: canonical },
		...Object.entries(alternates ?? {}).map(([hreflang, p]) => ({ rel: "alternate", hreflang, href: abs(site, p) })),
	];
	return { title: fullTitle, meta, links };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** HTML for non-Astro consumers; every value is escaped. */
export function renderHead(seo: Seo): string {
	const meta = seo.meta.map((m) => {
		const [key, attr] = "name" in m ? ["name", m.name] : ["property", m.property];
		return `<meta ${key}="${esc(attr)}" content="${esc(m.content)}">`;
	});
	const links = seo.links.map(
		(l) => `<link rel="${esc(l.rel)}"${l.hreflang ? ` hreflang="${esc(l.hreflang)}"` : ""} href="${esc(l.href)}">`,
	);
	return [`<title>${esc(seo.title)}</title>`, ...meta, ...links].join("\n");
}

export interface SitemapUrl {
	loc: string;
	lastmod?: string;
}

export function buildSitemap(urls: SitemapUrl[]): string {
	const items = urls.map(
		(u) => `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${esc(u.lastmod)}</lastmod>` : ""}</url>`,
	);
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items.join("")}</urlset>\n`;
}

export const buildRobots = (siteUrl: string) =>
	`User-agent: *\nDisallow: /admin\nDisallow: /api\n\nSitemap: ${new URL("/sitemap.xml", siteUrl).href}\n`;
