import { isPublished } from "../publishing/index.ts";
import type { ContentService } from "../content/service.ts";
import type { FeedItem, SitemapUrl } from "./index.ts";

export interface SitemapOptions {
	/** Collections left out of the sitemap. */
	exclude?: readonly string[];
	/** Priority (0 to 1) per collection. */
	priority?: Readonly<Record<string, number>>;
}

async function publishedEntries(service: ContentService, siteUrl: string, exclude: readonly string[] = []) {
	const out: { url: string; collection: string; data: Record<string, unknown> }[] = [];
	for (const c of service.collections) {
		if (exclude.includes(c.name)) continue;
		const route = c.route ?? `/${c.name}/{slug}`;
		for (const slug of await service.list(c.name)) {
			const entry = await service.get(c.name, slug);
			if (!entry || !isPublished(entry.data)) continue;
			out.push({ url: new URL(route.replace("{slug}", slug), siteUrl).href, collection: c.name, data: entry.data });
		}
	}
	return out;
}

/** Published, indexable entries (`draft` and `noindex` are skipped). `date` becomes lastmod when it is an ISO date. */
export async function contentUrls(
	service: ContentService,
	siteUrl: string,
	{ exclude, priority = {} }: SitemapOptions = {},
): Promise<SitemapUrl[]> {
	return (await publishedEntries(service, siteUrl, exclude))
		.filter(({ data }) => data.noindex !== true)
		.map(({ url, collection, data }) => ({
			loc: url,
			...(typeof data.date === "string" ? { lastmod: data.date } : {}),
			...(priority[collection] === undefined ? {} : { priority: priority[collection] }),
		}));
}

/** Dated, published entries, newest first. Undated entries are left out: a feed needs a pubDate. */
export async function contentFeed(service: ContentService, siteUrl: string, limit = 50): Promise<FeedItem[]> {
	const items: FeedItem[] = [];
	for (const { url, data } of await publishedEntries(service, siteUrl)) {
		const date = typeof data.date === "string" || data.date instanceof Date ? new Date(data.date) : null;
		if (!date || Number.isNaN(date.getTime())) continue;
		items.push({
			link: url,
			title: typeof data.title === "string" ? data.title : url,
			date,
			...(typeof data.description === "string" ? { description: data.description } : {}),
		});
	}
	return items.toSorted((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);
}
