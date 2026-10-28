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

	it("writes Open Graph, canonical, schema and custom page code", () => {
		const html =
			'<html><head><title>Old</title><meta name="description" content="old"><meta property="og:title" content="Old share"><link rel="canonical" href="https://x/old"></head><body><p>Body</p></body></html>';
		const out = withSeo(
			html,
			{
				seoTitle: "SEO title",
				seoDescription: "SEO description",
				ogTitle: "Share title",
				ogDescription: "Share description",
				ogImage: "/share.png",
				canonical: "/canonical",
				noindex: true,
				schemaJson: '{"@context":"https://schema.org","@type":"WebPage","name":"Hello"}',
				customHead: '<meta name="custom" content="yes">',
				customBody: "<script data-custom>ok</script>",
			},
			"https://example.com",
		);
		expect(out).toContain('<meta property="og:title" content="Share title">');
		expect(out).toContain('<meta property="og:description" content="Share description">');
		expect(out).toContain('<meta property="og:image" content="https://example.com/share.png">');
		expect(out).toContain('<link rel="canonical" href="https://example.com/canonical">');
		expect(out).toContain('<meta property="og:url" content="https://example.com/canonical">');
		expect(out).toContain('<meta name="robots" content="noindex">');
		expect(out).toContain("application/ld+json");
		expect(out).toContain('"name":"Hello"');
		expect(out).toContain('<meta name="custom" content="yes">');
		expect(out).toContain("<script data-custom>ok</script></body>");
	});

	it("adds complete Open Graph tags to a theme page that has none", () => {
		const html =
			'<html><head><title>Theme page</title><meta name="description" content="Theme description"></head><body></body></html>';
		const out = withSeo(
			html,
			{},
			"http://localhost:4321",
			{ name: "Example", url: "https://example.com", image: "/site.png" },
			"/about",
		);
		expect(out).toContain('<meta property="og:title" content="Theme page">');
		expect(out).toContain('<meta property="og:description" content="Theme description">');
		expect(out).toContain('<meta property="og:url" content="https://example.com/about">');
		expect(out).toContain('<meta property="og:image" content="https://example.com/site.png">');
		expect(out).toContain('<meta property="og:site_name" content="Example">');
		expect(out).toContain('<meta name="twitter:card" content="summary_large_image">');
	});

	it("ignores invalid schema JSON and leaves an untouched head alone", () => {
		const html = "<html><head></head><body></body></html>";
		expect(withSeo(html, { schemaJson: "not json" })).toBe(html);
		expect(withSeo(html, { customBody: "<p>after</p>" })).toBe("<html><head></head><body><p>after</p></body></html>");
	});

	it("titles a page added in the admin by its title, and a theme page by its SEO title only", async () => {
		const site = await mkdtemp(join(tmpdir(), "wuppy-seo-"));
		const theme = join(site, "theme");
		await mkdir(join(site, "content/pages"), { recursive: true });
		await mkdir(theme);
		await writeFile(
			join(site, "wuppy.config.mjs"),
			'export default { collections: [{ name: "pages", kind: "pages", dir: "content/pages", format: "md", route: "/{slug}", fields: { title: "string" } }, { name: "posts", kind: "posts", dir: "content/posts", format: "md", route: "/posts/{slug}", fields: { title: "string" } }] };',
		);
		await writeFile(join(theme, "wuppy.config.mjs"), "export default { collections: [] };");
		await writeFile(join(site, "content/pages/test.md"), "---\ntitle: Test page\n---\n");
		await writeFile(join(site, "content/pages/index.md"), "---\ntitle: Home\ntemplate: src/pages/index.astro\n---\n");
		await mkdir(join(site, "content/posts"), { recursive: true });
		await writeFile(
			join(site, "content/posts/hello.md"),
			"---\ntitle: Hello\nogTitle: Shared hello\ncustomBody: <p data-custom>Hello</p>\n---\n",
		);
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
		const post = await page("/posts/hello");
		expect(post).toContain('<meta property="og:title" content="Shared hello">');
		expect(post).toContain("<p data-custom>Hello</p>");
	});
});
