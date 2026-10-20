import type { AstroIntegration } from "astro";

// Source runs as .ts (workspace dev); the published build is .mjs. Entrypoints sit next to this file in both layouts.
const ext = import.meta.url.endsWith(".ts") ? "ts" : "mjs";
const entry = (path: string) => new URL(`./${path}.${ext}`, import.meta.url);

export default function wuppy(): AstroIntegration {
	return {
		name: "wuppy",
		hooks: {
			"astro:config:setup": ({ injectRoute, addMiddleware, updateConfig }) => {
				// Workspace siblings are TypeScript sources: let Vite compile them instead of handing them to Node. Published builds are plain JS.
				if (ext === "ts") updateConfig({ vite: { ssr: { noExternal: [/^@wuppy\//] } } });
				addMiddleware({ entrypoint: entry("redirect-middleware"), order: "pre" });
				addMiddleware({ entrypoint: entry("page-cache-middleware"), order: "post" });
				injectRoute({ pattern: "/sitemap.xml", entrypoint: entry("routes/sitemap") });
				injectRoute({ pattern: "/robots.txt", entrypoint: entry("routes/robots") });
				injectRoute({ pattern: "/rss.xml", entrypoint: entry("routes/rss") });
				injectRoute({ pattern: "/api/[...path]", entrypoint: entry("routes/api") });
				injectRoute({ pattern: "/uploads/[...path]", entrypoint: entry("routes/uploads") });
				injectRoute({ pattern: "/admin/[...path]", entrypoint: entry("routes/admin") });
				injectRoute({ pattern: "/icons.svg", entrypoint: entry("routes/icons") });
			},
		},
	};
}
