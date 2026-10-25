import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createThemeSeoMiddleware, withSeo } from "../../src/astro/theme-seo.ts";
import { templateUrl } from "../../src/themes/site.ts";

describe("theme page SEO", () => {
	it("maps a theme page file to its URL", () => {
		expect(templateUrl("src/pages/index.astro")).toBe("/");
		expect(templateUrl("src/pages/tags/index.astro")).toBe("/tags");
		expect(templateUrl("src/pages/404.astro")).toBe("/404");
	});

	it("puts the entry's title, description and noindex into the head", () => {
		const html = '<html><head><title>Old</title><meta name="description" content="old"></head><body></body></html>';
		const out = withSeo(html, { seoTitle: "New <1>", seoDescription: 'Say "hi"', noindex: true });
		expect(out).toContain("<title>New &lt;1&gt;</title>");
		expect(out).toContain('<meta name="description" content="Say &quot;hi&quot;">');
		expect(out).not.toContain("old");
		expect(out).toContain('<meta name="robots" content="noindex"></head>');
		expect(withSeo(html, { title: "x" })).toBe(html);
	});

	it("titles a page added in the admin by its title, and a theme page by its SEO title only", async () => {
		const site = await mkdtemp(join(tmpdir(), "wuppy-seo-"));
		const theme = join(site, "theme");
		await mkdir(join(site, "content/pages"), { recursive: true });
		await mkdir(theme);
		await writeFile(
			join(site, "wuppy.config.mjs"),
			'export default { collections: [{ name: "pages", kind: "pages", dir: "content/pages", format: "md", route: "/{slug}", fields: { title: "string" } }] };',
		);
		await writeFile(join(theme, "wuppy.config.mjs"), "export default { collections: [] };");
		await writeFile(join(site, "content/pages/test.md"), "---\ntitle: Test page\n---\n");
		await writeFile(join(site, "content/pages/index.md"), "---\ntitle: Home\ntemplate: src/pages/index.astro\n---\n");
		const seo = createThemeSeoMiddleware(site, theme);
		const page = async (path: string) =>
			(
				await seo(
					{ request: new Request(`http://x${path}`), url: new URL(`http://x${path}`) },
					async () =>
						new Response("<html><head><title>Theme</title></head></html>", {
							headers: { "content-type": "text/html" },
						}),
				)
			).text();
		expect(await page("/test")).toContain("<title>Test page</title>");
		expect(await page("/")).toContain("<title>Theme</title>");
	});
});
