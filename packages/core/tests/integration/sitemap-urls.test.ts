import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NoopGit } from "@wuppy/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectionSchema } from "../../src/content-types/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { contentUrls } from "../../src/seo/sitemap.ts";

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
