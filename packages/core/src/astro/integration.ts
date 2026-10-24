import { fileURLToPath } from "node:url";
import type { AstroConfig, AstroIntegration } from "astro";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { listThemeComponents } from "../themes/components.ts";
import { isLiveRoute, liveContentPlugin } from "./live-content.ts";
import { quietHmrPlugin } from "./quiet-hmr.ts";
import { mapSource, themeComponentsPlugin } from "./theme-components.ts";
import { themePageRel, themePagesPlugin } from "./theme-pages.ts";

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

export default function wuppycms(options: WuppyIntegrationOptions = {}): AstroIntegration {
	let root = process.cwd();
	let markdown: AstroConfig["markdown"] | undefined;
	let image: AstroConfig["image"] | undefined;
	const liveRoutes = new Set<string>();
	let live = false;
	let site: string | undefined;
	// Plugins (functions) cannot cross into the runtime module; the rest of the settings can.
	const settings = () =>
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
		) as Record<string, unknown>;
	return {
		name: "wuppycms",
		hooks: {
			"astro:config:setup": async ({ config, injectRoute, addMiddleware, updateConfig }) => {
				root = fileURLToPath(config.root);
				// Reading wuppy.config here is not possible (Astro's config loader is closed by now); the runtime reads it.
				live = options.live !== false && CONFIG_FILES.some((f) => existsSync(join(root, f)));
				const runtime = fileURLToPath(entry("live-runtime"));
				site =
					process.env.WUPPY_BASE_ROOT && resolve(process.env.WUPPY_BASE_ROOT) !== resolve(root)
						? process.env.WUPPY_BASE_ROOT
						: undefined;
				if (live)
					updateConfig({
						vite: {
							plugins: [
								liveContentPlugin({ root, runtime, liveRoutes, markdown: settings }),
								// A theme run for a site: its Markdown pages render the site's Pages entries.
								...(site ? [themePagesPlugin({ root, runtime, markdown: settings })] : []),
							],
						},
					});
				// The visual editor finds a theme's elements by the source marks Astro adds only while its dev toolbar is on.
				if (site) updateConfig({ devToolbar: { enabled: true } });
				// Themes expose their Astro components to MDX through a generated components map. The plugin is a no-op
				// when there are none, so sites that never use components pay nothing at runtime.
				updateConfig({ vite: { plugins: [themeComponentsPlugin(root), quietHmrPlugin()] } });
				// .wuppy/ holds the auth database and GitHub themes (whole Astro projects): watching it would restart
				// `astro dev` while a theme is cloned and lose the install in progress.
				// Only the project's own .wuppy/: a theme runs from inside the site's, and its files must still reload on edit.
				updateConfig({ vite: { server: { watch: { ignored: [`${join(root, ".wuppy")}/**`] } } } });
				// Workspace siblings are TypeScript sources: let Vite compile them instead of handing them to Node. Published builds are plain JS.
				if (ext === "ts") updateConfig({ vite: { ssr: { noExternal: [/^@wuppycms\//] } } });
				addMiddleware({ entrypoint: entry("redirect-middleware"), order: "pre" });
				addMiddleware({ entrypoint: entry("page-cache-middleware"), order: "post" });
				// After the page cache, so cached pages already carry the visual CSS.
				addMiddleware({ entrypoint: entry("visual-middleware"), order: "post" });
				if (site) addMiddleware({ entrypoint: entry("theme-seo-middleware"), order: "post" });
				if (options.sitemap !== false) injectRoute({ pattern: "/sitemap.xml", entrypoint: entry("routes/sitemap") });
				if (options.robots !== false) injectRoute({ pattern: "/robots.txt", entrypoint: entry("routes/robots") });
				if (options.rss !== false) injectRoute({ pattern: "/rss.xml", entrypoint: entry("routes/rss") });
				injectRoute({ pattern: "/api/[...path]", entrypoint: entry("routes/api") });
				injectRoute({ pattern: "/uploads/[...path]", entrypoint: entry("routes/uploads") });
				injectRoute({ pattern: "/admin/[...path]", entrypoint: entry("routes/admin") });
				injectRoute({ pattern: "/icons.svg", entrypoint: entry("routes/icons") });
				const preview = await componentPreview(root);
				if (preview) injectRoute({ pattern: "/_wuppy/component/[name]", entrypoint: preview });
			},
			"astro:route:setup": ({ route }) => {
				if (!live) return;
				// A theme Markdown page backed by a site entry renders it on request, like other live pages.
				if (site && themePageRel(root, join(root, route.component))) route.prerender = false;
				if (!isLiveRoute(root, route.component)) return;
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

/**
 * A page that renders one of the project's Astro components by name, without props, for the visual editor's canvas.
 * It is generated (one static import per component) so the project's own Astro compiles it, styles included. It only
 * renders design code the site already ships, and takes no input but a name from that list, so it needs no sign-in.
 */
export async function componentPreview(root: string): Promise<string | undefined> {
	const list = await listThemeComponents(root);
	if (!list.length) return undefined;
	const file = join(root, "node_modules", ".wuppy", "component-preview.astro");
	await mkdir(join(file, ".."), { recursive: true });
	await writeFile(
		file,
		[
			"---",
			mapSource(list.map((c) => ({ ...c, path: join(root, c.path) }))),
			"export const prerender = false;",
			"const map = __wuppyComponents;",
			'const name = Astro.params.name ?? "";',
			"const Component = Object.hasOwn(map, name) ? map[name] : undefined;",
			"if (!Component) return new Response(null, { status: 404 });",
			'Astro.response.headers.set("x-robots-tag", "noindex");',
			"---",
			"<Component />",
			"",
		].join("\n"),
	);
	return file;
}
