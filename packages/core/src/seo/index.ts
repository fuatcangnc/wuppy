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
	/** Overrides the canonical URL (absolute or site-relative). */
	canonical?: string;
	/** How the page title and site name combine; `{title}` and `{site}` are replaced. Default `{title} | {site}`. */
	titleTemplate?: string;
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

export function buildSeo({
	site,
	path,
	title,
	description,
	image,
	noindex,
	alternates,
	canonical: canonicalOverride,
	titleTemplate = "{title} | {site}",
}: SeoInput): Seo {
	const url = new URL(path, site.url);
	const canonical = canonicalOverride ? abs(site, canonicalOverride) : `${url.origin}${url.pathname}`;
	const fullTitle = title
		? titleTemplate.replace("{title}", () => title).replace("{site}", () => site.name)
		: site.name;
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
	/** 0.0 to 1.0; omitted means the protocol default (0.5). */
	priority?: number;
}

export function buildSitemap(urls: SitemapUrl[]): string {
	const items = urls.map(
		(u) =>
			`<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${esc(u.lastmod)}</lastmod>` : ""}${u.priority === undefined ? "" : `<priority>${u.priority.toFixed(1)}</priority>`}</url>`,
	);
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items.join("")}</urlset>\n`;
}

export const buildRobots = (siteUrl: string) =>
	`User-agent: *\nDisallow: /admin\nDisallow: /api\n\nSitemap: ${new URL("/sitemap.xml", siteUrl).href}\n`;

export interface FeedItem {
	link: string;
	title: string;
	date: Date;
	description?: string;
}

export function buildRss(site: { url: string; name: string }, items: FeedItem[]): string {
	const rows = items.map(
		(i) =>
			`<item><title>${esc(i.title)}</title><link>${esc(i.link)}</link><guid>${esc(i.link)}</guid><pubDate>${i.date.toUTCString()}</pubDate>${i.description ? `<description>${esc(i.description)}</description>` : ""}</item>`,
	);
	return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${esc(site.name)}</title><link>${esc(site.url)}</link><description>${esc(site.name)}</description>${rows.join("")}</channel></rss>\n`;
}

/** JSON-LD for a blog post or article. */
export function articleJsonLd(input: {
	site: Site;
	url: string;
	title: string;
	description?: string;
	image?: string;
	datePublished?: string;
	dateModified?: string;
	author?: string;
}) {
	const { site, url, title, description, image, datePublished, dateModified, author } = input;
	return {
		"@context": "https://schema.org",
		"@type": "Article",
		headline: title,
		mainEntityOfPage: abs(site, url),
		...(description ? { description } : {}),
		...(image ? { image: abs(site, image) } : {}),
		...(datePublished ? { datePublished } : {}),
		...(dateModified ? { dateModified } : {}),
		...(author ? { author: { "@type": "Person", name: author } } : {}),
		publisher: { "@type": "Organization", name: site.name },
	};
}

/** JSON-LD for the site root; `searchPath` (e.g. `/search?q={q}`) enables the sitelinks search box. */
export function websiteJsonLd(site: Site, searchPath?: string) {
	return {
		"@context": "https://schema.org",
		"@type": "WebSite",
		name: site.name,
		url: site.url,
		...(searchPath
			? {
					potentialAction: {
						"@type": "SearchAction",
						target: abs(site, searchPath).replace(/%7Bq%7D|{q}/, "{search_term_string}"),
						"query-input": "required name=search_term_string",
					},
				}
			: {}),
	};
}

export function breadcrumbJsonLd(site: Site, trail: Array<{ name: string; path: string }>) {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: trail.map((t, i) => ({
			"@type": "ListItem",
			position: i + 1,
			name: t.name,
			item: abs(site, t.path),
		})),
	};
}

/** A `<script type="application/ld+json">` tag; `<` is escaped so values can never close the script early. */
export const renderJsonLd = (data: object): string =>
	`<script type="application/ld+json">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`;
