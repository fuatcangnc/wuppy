import type { APIRoute } from "astro";
import { loadConfig } from "../../config/index.ts";
import { buildRobots } from "../../seo/index.ts";
import { siteRoot } from "../../themes/site.ts";

export const prerender = false;

export const GET: APIRoute = async () => {
	const { site } = await loadConfig(siteRoot());
	if (!site) return new Response("Set `site` in wuppy.config to enable robots.txt", { status: 404 });
	return new Response(buildRobots(site.url), { headers: { "content-type": "text/plain; charset=utf-8" } });
};
