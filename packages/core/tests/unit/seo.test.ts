import { describe, expect, it } from "vitest";
import {
	articleJsonLd,
	breadcrumbJsonLd,
	buildRobots,
	buildRss,
	buildSeo,
	buildSitemap,
	renderHead,
	renderJsonLd,
	websiteJsonLd,
} from "../../src/seo/index.ts";

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

describe("buildRss", () => {
	it("emits escaped items with RFC 822 dates", () => {
		const xml = buildRss(site, [
			{ link: "https://example.com/a?x=1&y=2", title: "A <b>", date: new Date("2026-01-02T00:00:00Z") },
		]);
		expect(xml).toContain("<title>A &lt;b&gt;</title>");
		expect(xml).toContain("<link>https://example.com/a?x=1&amp;y=2</link>");
		expect(xml).toContain("<pubDate>Fri, 02 Jan 2026 00:00:00 GMT</pubDate>");
	});
});

const link = (canonical: string) =>
	buildSeo({ site, path: "/a", canonical }).links.find((l) => l.rel === "canonical")?.href;

describe("title template and canonical override", () => {
	it("applies the template and treats $ in titles literally", () => {
		expect(buildSeo({ site, path: "/a", title: "Cost $& more", titleTemplate: "{site}: {title}" }).title).toBe(
			"Example: Cost $& more",
		);
	});
	it("uses an explicit canonical, relative or absolute", () => {
		expect(link("/original")).toBe("https://example.com/original");
		expect(link("https://other.example/x")).toBe("https://other.example/x");
	});
});

describe("hreflang", () => {
	it("emits one alternate per locale with absolute URLs", () => {
		const links = buildSeo({
			site,
			path: "/en/a",
			alternates: { en: "/en/a", tr: "/tr/a", "x-default": "/en/a" },
		}).links;
		expect(links.filter((l) => l.rel === "alternate").map((l) => [l.hreflang, l.href])).toEqual([
			["en", "https://example.com/en/a"],
			["tr", "https://example.com/tr/a"],
			["x-default", "https://example.com/en/a"],
		]);
	});
});

describe("JSON-LD", () => {
	it("builds article, website and breadcrumb data with absolute URLs", () => {
		const a = articleJsonLd({
			site,
			url: "/blog/a",
			title: "A",
			image: "/i.png",
			author: "Ada",
			datePublished: "2026-01-01",
		});
		expect(a).toMatchObject({
			"@type": "Article",
			mainEntityOfPage: "https://example.com/blog/a",
			image: "https://example.com/i.png",
			author: { name: "Ada" },
		});
		expect(websiteJsonLd(site, "/search?q={q}")).toMatchObject({
			potentialAction: { target: "https://example.com/search?q={search_term_string}" },
		});
		expect(
			breadcrumbJsonLd(site, [
				{ name: "Home", path: "/" },
				{ name: "Blog", path: "/blog" },
			]).itemListElement[1],
		).toMatchObject({
			position: 2,
			item: "https://example.com/blog",
		});
	});
	it("cannot be used to close the script tag", () => {
		const html = renderJsonLd(articleJsonLd({ site, url: "/a", title: "</script><script>alert(1)</script>" }));
		expect(html.match(/<\/script>/g)).toHaveLength(1);
		expect(html).not.toContain("<script>alert");
	});
});

describe("sitemap priority", () => {
	it("writes priority with one decimal", () => {
		expect(buildSitemap([{ loc: "https://example.com/a", priority: 0.8 }])).toContain("<priority>0.8</priority>");
	});
});
