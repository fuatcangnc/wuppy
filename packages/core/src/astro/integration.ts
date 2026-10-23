import { fileURLToPath } from "node:url";
import type { AstroConfig, AstroIntegration } from "astro";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { isLiveRoute, liveContentPlugin } from "./live-content.ts";

// Source runs as .ts (workspace dev); the published build is .mjs. Entrypoints sit next to this file in both layouts.
const ext = import.meta.url.endsWith(".ts") ? "ts" : "mjs";
const CONFIG_FILES = ["wuppy.config.ts", "wuppy.config.mjs", "wuppy.config.js"];
const entry = (path: string) => new URL(`./${path}.${ext}`, import.meta.url);

/** Turn off a route the site already serves itself (e.g. `sitemap: false` next to @astrojs/sitemap). */
export interface WuppyIntegrationOptions {
	sitemap?: boolean;
	robots?: boolean;
	rss?: boolean;
	/** Read Wuppy collections from disk on each request so edits show without a rebuild (default true). */
	live?: boolean;
}

export default function wuppy(options: WuppyIntegrationOptions = {}): AstroIntegration {
	let root = process.cwd();
	let markdown: AstroConfig["markdown"] | undefined;
	let image: AstroConfig["image"] | undefined;
	const liveRoutes = new Set<string>();
	let live = false;
	return {
		name: "wuppy",
		hooks: {
			"astro:config:setup": ({ config, injectRoute, addMiddleware, updateConfig }) => {
				root = fileURLToPath(config.root);
				// Reading wuppy.config here is not possible (Astro's config loader is closed by now); the runtime reads it.
				live = options.live !== false && CONFIG_FILES.some((f) => existsSync(join(root, f)));
				if (live)
					updateConfig({
						vite: {
							plugins: [
								liveContentPlugin({
									root,
									runtime: fileURLToPath(entry("live-runtime")),
									liveRoutes,
									// Plugins (functions) cannot cross into the runtime module; the rest of the settings can.
									markdown: () =>
										JSON.parse(
											JSON.stringify({
												features: (markdown?.processor?.options as { features?: unknown } | undefined)?.features ?? {},
												shared: {
													image,
													syntaxHighlight: markdown?.syntaxHighlight,
													shikiConfig: markdown?.shikiConfig,
													gfm: markdown?.gfm,
													smartypants: markdown?.smartypants,
												},
											}),
										),
								}),
							],
						},
					});
				// .wuppy/ holds the auth database and GitHub themes (whole Astro projects): watching it would restart
				// `astro dev` while a theme is cloned and lose the install in progress.
				updateConfig({ vite: { server: { watch: { ignored: ["**/.wuppy/**"] } } } });
				// Workspace siblings are TypeScript sources: let Vite compile them instead of handing them to Node. Published builds are plain JS.
				if (ext === "ts") updateConfig({ vite: { ssr: { noExternal: [/^@wuppy\//] } } });
				addMiddleware({ entrypoint: entry("redirect-middleware"), order: "pre" });
				addMiddleware({ entrypoint: entry("page-cache-middleware"), order: "post" });
				// After the page cache, so cached pages already carry the visual CSS.
				addMiddleware({ entrypoint: entry("visual-middleware"), order: "post" });
				if (options.sitemap !== false) injectRoute({ pattern: "/sitemap.xml", entrypoint: entry("routes/sitemap") });
				if (options.robots !== false) injectRoute({ pattern: "/robots.txt", entrypoint: entry("routes/robots") });
				if (options.rss !== false) injectRoute({ pattern: "/rss.xml", entrypoint: entry("routes/rss") });
				injectRoute({ pattern: "/api/[...path]", entrypoint: entry("routes/api") });
				injectRoute({ pattern: "/uploads/[...path]", entrypoint: entry("routes/uploads") });
				injectRoute({ pattern: "/admin/[...path]", entrypoint: entry("routes/admin") });
				injectRoute({ pattern: "/icons.svg", entrypoint: entry("routes/icons") });
			},
			"astro:route:setup": ({ route }) => {
				if (!live || !isLiveRoute(root, route.component)) return;
				route.prerender = false;
				liveRoutes.add(route.component);
			},
			"astro:config:done": ({ config, logger }) => {
				markdown = config.markdown;
				image = config.image;
				if (live && config.markdown.processor?.name !== "satteri")
					logger.warn(
						`Live content renders edited Markdown with Astro's default processor, not "${config.markdown.processor?.name}"; plugins from it apply after the next build.`,
					);
			},
		},
	};
}
