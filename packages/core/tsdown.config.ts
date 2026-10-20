import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		astro: "src/astro/integration.ts",
		seo: "src/seo/index.ts",
		site: "src/site/index.ts",
		publishing: "src/publishing/index.ts",
		cli: "src/cli/main.ts",
		"routes/api": "src/astro/routes/api.ts",
		"routes/admin": "src/astro/routes/admin.ts",
		"routes/icons": "src/astro/routes/icons.ts",
		"routes/uploads": "src/astro/routes/uploads.ts",
		"routes/sitemap": "src/astro/routes/sitemap.ts",
		"routes/rss": "src/astro/routes/rss.ts",
		"routes/robots": "src/astro/routes/robots.ts",
		"redirect-middleware": "src/astro/redirect-middleware.ts",
		"page-cache-middleware": "src/astro/page-cache-middleware.ts",
	},
	format: "esm",
	dts: true,
	clean: true,
	platform: "node",
});
