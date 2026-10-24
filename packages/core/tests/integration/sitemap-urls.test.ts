import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NoopGit } from "@wuppycms/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectionSchema } from "../../src/content-types/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { contentFeed, contentUrls } from "../../src/seo/sitemap.ts";

let root: string;
beforeEach(async () => void (root = await mkdtemp(join(tmpdir(), "wuppy-sm-"))));
afterEach(() => rm(root, { recursive: true, force: true }));

describe("contentUrls", () => {
	it("maps entries through the collection route, skips drafts, uses date as lastmod", async () => {
		const posts = collectionSchema.parse({
			name: "posts",
			dir: "content/posts",
			route: "/blog/{slug}",
			fields: { draft: "boolean", date: "date" },
		});
		const pages = collectionSchema.parse({ name: "pages", dir: "content/pages" });
		const svc = new ContentService(root, [posts, pages], new NoopGit());
		await svc.put("posts", "hello", { data: { date: "2026-01-02" }, body: "" });
		await svc.put("posts", "wip", { data: { draft: true }, body: "" });
		await svc.put("posts", "later", { data: { publishAt: "2999-01-01" }, body: "" });
		await svc.put("pages", "about", { data: {}, body: "" });

		const urls = await contentUrls(svc, "https://example.com");
		expect(urls).toEqual([
			{ loc: "https://example.com/blog/hello", lastmod: "2026-01-02" },
			{ loc: "https://example.com/pages/about" },
		]);
	});
});

describe("contentUrls options", () => {
	it("skips noindex entries and excluded collections, and adds priority", async () => {
		const posts = collectionSchema.parse({ name: "posts", dir: "content/posts", route: "/blog/{slug}" });
		const pages = collectionSchema.parse({ name: "pages", dir: "content/pages" });
		const svc = new ContentService(root, [posts, pages], new NoopGit());
		await svc.put("posts", "a", { data: {}, body: "" });
		await svc.put("posts", "hidden", { data: { noindex: true }, body: "" });
		await svc.put("pages", "about", { data: {}, body: "" });
		const urls = await contentUrls(svc, "https://example.com", { exclude: ["pages"], priority: { posts: 0.9 } });
		expect(urls).toEqual([{ loc: "https://example.com/blog/a", priority: 0.9 }]);
	});
});

describe("contentFeed", () => {
	it("lists dated, published entries newest first and skips drafts and undated ones", async () => {
		const posts = collectionSchema.parse({
			name: "posts",
			dir: "content/posts",
			fields: { draft: "boolean", date: "date" },
		});
		const svc = new ContentService(root, [posts], new NoopGit());
		await svc.put("posts", "old", { data: { title: "Old", date: "2026-01-01" }, body: "" });
		await svc.put("posts", "new", { data: { title: "New", date: "2026-02-01", description: "d" }, body: "" });
		await svc.put("posts", "wip", { data: { date: "2026-03-01", draft: true }, body: "" });
		await svc.put("posts", "nodate", { data: { title: "x" }, body: "" });
		const items = await contentFeed(svc, "https://example.com");
		expect(items.map((i) => i.title)).toEqual(["New", "Old"]);
		expect(items[0]?.description).toBe("d");
	});
});
