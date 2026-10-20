import type { APIRoute } from "astro";
import { NoopGit } from "@wuppy/git";
import { loadConfig } from "../../config/index.ts";
import { ContentService } from "../../content/service.ts";
import { buildSitemap } from "../../seo/index.ts";
import { contentUrls } from "../../seo/sitemap.ts";

export const prerender = false;

export const GET: APIRoute = async () => {
	const root = process.cwd();
	const config = await loadConfig(root);
	if (!config.site) return new Response("Set `site` in wuppy.config to enable the sitemap", { status: 404 });
	const urls = await contentUrls(new ContentService(root, config.collections, new NoopGit()), config.site.url);
	return new Response(buildSitemap([{ loc: new URL("/", config.site.url).href }, ...urls]), {
		headers: { "content-type": "application/xml; charset=utf-8" },
	});
};
