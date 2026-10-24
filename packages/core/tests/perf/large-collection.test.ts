import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { NoopGit } from "@wuppycms/git";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/api/app.ts";
import { CommentService } from "../../src/comments/index.ts";
import { collectionSchema } from "../../src/content-types/index.ts";
import { FilesystemContent } from "../../src/content/adapters/filesystem.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { MediaService } from "../../src/media/index.ts";
import { RedirectService } from "../../src/redirects/service.ts";
import { SearchIndex } from "../../src/search/index.ts";

// Budgets are generous (3 to 10 times what a laptop needs) so a slow CI box does not flake;
// they exist to catch an accidental O(n) read per request or per page, not to benchmark.
const N = 10_000;
let root: string;
let service: ContentService;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-perf-"));
	await mkdir(join(root, "content/posts"), { recursive: true });
	await Promise.all(
		Array.from({ length: N }, (_, i) =>
			writeFile(
				join(root, `content/posts/p${String(i).padStart(5, "0")}.md`),
				`---\ntitle: Post ${i}\ndraft: ${i % 10 === 0}\n---\nBody of post ${i} about topic${i % 50}.\n`,
			),
		),
	);
	service = new ContentService(root, [collectionSchema.parse({ name: "posts", dir: "content/posts" })], new NoopGit());
	const json = new JsonStore(root, new NoopGit());
	app = createApp({
		service,
		media: new MediaService(root, new NoopGit()),
		json,
		comments: new CommentService(new DatabaseSync(":memory:")),
		redirects: new RedirectService(json, new DatabaseSync(":memory:"), []),
		userCount: () => 1,
		getUser: async () => ({ id: "u", permissions: ["content:read"] }),
	});
}, 60_000);
afterAll(() => rm(root, { recursive: true, force: true }));

describe("10,000 entries", () => {
	it("pages through the whole collection without repeats, reading each file once", async () => {
		const read = vi.spyOn(FilesystemContent.prototype, "get");
		const seen = new Set<string>();
		let cursor: string | null = "";
		let pages = 0;
		const started = performance.now();
		while (cursor !== null) {
			const res = await app.request(`/api/content/posts?limit=200&sort=slug${cursor ? `&cursor=${cursor}` : ""}`);
			const body = (await res.json()) as { data: Array<{ slug: string }>; total: number; nextCursor: string | null };
			expect(body.total).toBe(N);
			for (const e of body.data) seen.add(e.slug);
			cursor = body.nextCursor;
			pages++;
		}
		expect(seen.size).toBe(N);
		expect(pages).toBe(N / 200);
		expect(read).toHaveBeenCalledTimes(N); // one read per file for all 50 pages: the listing is reused
		expect(performance.now() - started).toBeLessThan(10_000);
		read.mockRestore();
	}, 30_000);

	it("filters and sorts a large collection quickly", async () => {
		const started = performance.now();
		const res = await app.request("/api/content/posts?status=draft&limit=50&sort=-title&q=topic0");
		const body = (await res.json()) as { total: number; data: unknown[] };
		expect(body.total).toBeGreaterThan(0);
		expect(body.data).toHaveLength(Math.min(50, body.total));
		expect(performance.now() - started).toBeLessThan(2_000);
	});

	it("builds the search index and answers a query within budget", async () => {
		const index = new SearchIndex(service);
		const started = performance.now();
		const hits = await index.search({ q: "topic7", limit: 20 });
		expect(hits.length).toBe(20);
		expect(performance.now() - started).toBeLessThan(10_000);
		const again = performance.now();
		await index.search({ q: "topic8", limit: 20 });
		expect(performance.now() - again).toBeLessThan(500); // the index is reused until content changes
	}, 30_000);

	it("serves the dashboard for the whole collection within budget", async () => {
		const started = performance.now();
		const res = await app.request("/api/dashboard");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { collections: Array<{ name: string; total: number }> } };
		expect(body.data.collections.find((c) => c.name === "posts")?.total).toBe(N);
		expect(performance.now() - started).toBeLessThan(3_000);
	});
});
