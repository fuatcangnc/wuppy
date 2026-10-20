import { isPublished } from "../publishing/index.ts";
import type { ContentService } from "../content/service.ts";
import type { SitemapUrl } from "./index.ts";

/** Published entries only (`draft: true` is skipped). `date` becomes lastmod when it is an ISO date. */
export async function contentUrls(service: ContentService, siteUrl: string): Promise<SitemapUrl[]> {
	const urls: SitemapUrl[] = [];
	for (const c of service.collections) {
		const route = c.route ?? `/${c.name}/{slug}`;
		for (const slug of await service.list(c.name)) {
			const entry = await service.get(c.name, slug);
			if (!entry || !isPublished(entry.data)) continue;
			const date = entry.data.date;
			urls.push({
				loc: new URL(route.replace("{slug}", slug), siteUrl).href,
				...(typeof date === "string" ? { lastmod: date } : {}),
			});
		}
	}
	return urls;
}
