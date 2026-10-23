import type { APIRoute } from "astro";
import { NoopGit } from "@wuppy/git";
import { loadSiteConfig, siteRoot, themeRoot } from "../../themes/site.ts";
import { ContentService } from "../../content/service.ts";
import { readData } from "../../data/read.ts";
import { settingsSchema } from "../../data/schemas.ts";
import { buildSitemap } from "../../seo/index.ts";
import { contentUrls } from "../../seo/sitemap.ts";

export const prerender = false;

export const GET: APIRoute = async () => {
	const root = siteRoot();
	const config = await loadSiteConfig(root, themeRoot());
	if (!config.site) return new Response("Set `site` in wuppy.config to enable the sitemap", { status: 404 });
	const { seo } = settingsSchema.parse((await readData("settings", {}, root)) ?? {});
	const urls = await contentUrls(
		new ContentService(root, config.collections, new NoopGit()),
		config.site.url,
		seo.sitemap,
	);
	return new Response(buildSitemap([{ loc: new URL("/", config.site.url).href }, ...urls]), {
		headers: { "content-type": "application/xml; charset=utf-8" },
	});
};
