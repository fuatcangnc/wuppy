import { describe, expect, it } from "vitest";
import { withSeo } from "../../src/astro/theme-seo.ts";
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
});
