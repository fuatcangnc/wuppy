import { describe, expect, it } from "vitest";
import { buildRobots, buildSeo, buildSitemap, renderHead } from "../../src/seo/index.ts";

const site = { url: "https://example.com", name: "Example" };

describe("buildSeo", () => {
	it("builds title, canonical (no query/hash) and Open Graph tags", () => {
		const seo = buildSeo({
			site,
			path: "/blog/hello?utm=x#top",
			title: "Hello",
			description: "A post",
			image: "/uploads/a.png",
		});
		expect(seo.title).toBe("Hello | Example");
		expect(seo.links).toContainEqual({ rel: "canonical", href: "https://example.com/blog/hello" });
		expect(seo.meta).toContainEqual({ property: "og:image", content: "https://example.com/uploads/a.png" });
		expect(seo.meta).toContainEqual({ name: "description", content: "A post" });
		expect(seo.meta).toContainEqual({ name: "twitter:card", content: "summary_large_image" });
	});
	it("uses the site name alone on the home page and summary card without image", () => {
		const seo = buildSeo({ site, path: "/" });
		expect(seo.title).toBe("Example");
		expect(seo.meta).toContainEqual({ name: "twitter:card", content: "summary" });
	});
	it("adds noindex and hreflang alternates", () => {
		const seo = buildSeo({ site, path: "/en/a", noindex: true, alternates: { tr: "/tr/a" } });
		expect(seo.meta).toContainEqual({ name: "robots", content: "noindex, nofollow" });
		expect(seo.links).toContainEqual({ rel: "alternate", hreflang: "tr", href: "https://example.com/tr/a" });
	});
});

describe("renderHead", () => {
	it("escapes attribute and text content", () => {
		const html = renderHead(buildSeo({ site, path: "/", title: '"><script>alert(1)</script>', description: "a & b" }));
		expect(html).not.toContain("<script>");
		expect(html).toContain("a &amp; b");
	});
});

describe("sitemap and robots", () => {
	it("emits valid, escaped XML", () => {
		const xml = buildSitemap([{ loc: "https://example.com/a?x=1&y=2", lastmod: "2026-01-02" }]);
		expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
		expect(xml).toContain("<loc>https://example.com/a?x=1&amp;y=2</loc>");
		expect(xml).toContain("<lastmod>2026-01-02</lastmod>");
	});
	it("robots points at the sitemap and never lists /admin or /api as crawlable", () => {
		const txt = buildRobots(site.url);
		expect(txt).toContain("Sitemap: https://example.com/sitemap.xml");
		expect(txt).toContain("Disallow: /admin");
		expect(txt).toContain("Disallow: /api");
	});
});
