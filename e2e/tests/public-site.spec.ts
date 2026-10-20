import { expect, test } from "@playwright/test";

test("sitemap lists published content, robots hides admin, redirects work", async ({ request }) => {
	const sitemap = await (await request.get("/sitemap.xml")).text();
	expect(sitemap).toContain("<loc>http://127.0.0.1:4444/posts/hello</loc>");

	const rss = await request.get("/rss.xml");
	expect(rss.headers()["content-type"]).toContain("application/rss+xml");
	expect(await rss.text()).toContain('<rss version="2.0">');

	const robots = await (await request.get("/robots.txt")).text();
	expect(robots).toContain("Disallow: /admin");
	expect(robots).toContain("Sitemap: http://127.0.0.1:4444/sitemap.xml");

	const redirect = await request.get("/old-hello", { maxRedirects: 0 });
	expect(redirect.status()).toBe(301);
	expect(redirect.headers()["location"]).toBe("/posts/hello");
});

test("a published post renders with SEO tags and a missing one is a 404", async ({ page, request }) => {
	await page.goto("/posts/hello");
	await expect(page.getByRole("heading", { name: "Hello Wuppy" })).toBeVisible();
	await expect(page).toHaveTitle("Hello Wuppy | Wuppy Starter");
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "http://127.0.0.1:4444/posts/hello");
	const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
	expect(ld).toMatchObject({ "@type": "Article", headline: "Hello Wuppy" });
	await expect(page.getByText(/\d+ min read/)).toBeVisible();
	await expect(page.getByRole("link", { name: "Skip to content" })).toBeAttached();
	expect((await request.get("/posts/nope")).status()).toBe(404);
});

test("unknown URLs get the designed 404 page with the 404 status", async ({ page }) => {
	const res = await page.goto("/no-such-page");
	expect(res?.status()).toBe(404);
	await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("a visitor can submit a moderated comment", async ({ page }) => {
	await page.goto("/posts/hello");
	await page.getByLabel("Name").fill("Ada");
	await page.getByLabel("Comment").fill("Lovely post");
	await page.getByRole("button", { name: "Post comment" }).click();
	await expect(page.getByText("Thanks. Your comment is awaiting moderation.")).toBeVisible();
});
