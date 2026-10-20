import type { APIRoute } from "astro";
import { NoopGit } from "@wuppy/git";
import { loadConfig } from "../../config/index.ts";
import { ContentService } from "../../content/service.ts";
import { buildRss } from "../../seo/index.ts";
import { contentFeed } from "../../seo/sitemap.ts";

export const prerender = false;

export const GET: APIRoute = async () => {
	const root = process.cwd();
	const config = await loadConfig(root);
	if (!config.site) return new Response("Set `site` in wuppy.config to enable the RSS feed", { status: 404 });
	const items = await contentFeed(new ContentService(root, config.collections, new NoopGit()), config.site.url);
	return new Response(buildRss(config.site, items), {
		headers: { "content-type": "application/rss+xml; charset=utf-8" },
	});
};
