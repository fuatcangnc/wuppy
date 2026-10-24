import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { RealGit } from "@wuppycms/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.ts";
import { CommentService } from "../../src/comments/index.ts";
import { collectionSchema } from "../../src/content-types/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { ImportJobs, importOptionsSchema, type JobState } from "../../src/import/job.ts";
import { htmlToMarkdown, imageUrls, parseWxr } from "../../src/import/wxr.ts";
import { MediaService } from "../../src/media/index.ts";
import { RedirectService } from "../../src/redirects/service.ts";

const WXR = await readFile(join(import.meta.dirname, "../fixtures/sample.wxr"), "utf8");
// A 1x1 transparent PNG.
const PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
	"base64",
);

let root: string;
let service: ContentService;
let json: JsonStore;
let redirects: RedirectService;
let jobs: ImportJobs;
let app: ReturnType<typeof createApp>;
const fetched: string[] = [];

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-wp-"));
	const git = await RealGit.init(root);
	json = new JsonStore(root, git);
	service = new ContentService(
		root,
		[
			collectionSchema.parse({ name: "posts", dir: "content/posts", route: "/blog/{slug}" }),
			collectionSchema.parse({ name: "pages", dir: "content/pages" }),
		],
		git,
	);
	const media = new MediaService(root, git);
	redirects = new RedirectService(json, new DatabaseSync(":memory:"), []);
	fetched.length = 0;
	jobs = new ImportJobs({
		root,
		service,
		media,
		json,
		redirects,
		fetchMedia: async (url) => {
			fetched.push(url);
			return { bytes: PNG, contentType: "image/png" };
		},
	});
	app = createApp({
		service,
		media,
		json,
		comments: new CommentService(new DatabaseSync(":memory:")),
		redirects,
		userCount: () => 1,
		imports: jobs,
		getUser: async () => ({ id: "u", permissions: ["content:read", "content:write", "import:run"] }),
	});
});
afterEach(() => rm(root, { recursive: true, force: true }));

const options = (over: object = {}) =>
	importOptionsSchema.parse({ collection: "posts", pageCollection: "pages", ...over });

describe("parseWxr", () => {
	it("reads posts, pages, terms, authors, attachments and menus, and counts unusable items", () => {
		const wxr = parseWxr(WXR);
		expect(wxr.siteUrl).toBe("https://old.example");
		expect(wxr.posts.map((p) => [p.type, p.slug, p.published])).toEqual([
			["post", "hello", true],
			["post", "wip", false],
			["page", "about", true],
		]);
		expect(wxr.skipped).toBe(1);
		expect(wxr.posts[0]).toMatchObject({
			title: "Hello & welcome",
			oldPath: "/2024/05/hello/",
			date: "2024-05-02T10:00:00.000Z",
			categories: ["releases"],
			tags: ["astro"],
		});
		// No GMT date: falls back to the local one.
		expect(wxr.posts[1]?.date).toBe("2024-06-01T08:00:00.000Z");
		expect(wxr.terms.map((t) => [t.taxonomy, t.slug, t.parent])).toEqual([
			["category", "news", undefined],
			["category", "releases", "news"],
			["tag", "astro", undefined],
		]);
		expect(wxr.attachments).toHaveLength(1);
		expect(wxr.menus[0]?.items.map((i) => [i.label, i.url, i.parent])).toEqual([
			["Home", "https://old.example/", "0"],
			["About us", "/about/", "30"],
		]);
	});
});

describe("htmlToMarkdown", () => {
	it("converts common markup and keeps escaped angle brackets escaped", () => {
		const md = htmlToMarkdown(parseWxr(WXR).posts[0]!.html);
		expect(md).toContain("Read [about us](https://old.example/about/) and **enjoy**.");
		expect(md).toContain("## Photos");
		expect(md).toContain("![A pic](https://old.example/wp-content/uploads/pic.png)");
		expect(md).toContain("- one\n- two");
		expect(md).toContain("1 &lt; 2 &lt;script&gt;alert(1)&lt;/script&gt;");
		expect(md).not.toContain("<script>");
		expect(md).not.toContain("wp:paragraph");
	});
	it("drops javascript: links and script tags", () => {
		const md = htmlToMarkdown('<a href="javascript:alert(1)">x</a><script>bad()</script>');
		expect(md).toBe("x");
		expect(imageUrls('<img src="/a.png"><img src="/a.png"><img src=\'/b.png\'>')).toEqual(["/a.png", "/b.png"]);
	});
});

describe("import job", () => {
	it("analyzes before writing anything", async () => {
		await service.put("posts", "hello", { data: { title: "Existing" }, body: "" });
		const job = await jobs.create(WXR, options());
		expect(job.analysis).toMatchObject({
			posts: 2,
			pages: 1,
			drafts: 1,
			attachments: 1,
			images: 1,
			authors: 1,
			categories: 2,
			tags: 1,
			menus: 1,
			unusable: 1,
			conflicts: ["posts/hello"],
		});
		expect(await service.get("posts", "wip")).toBeNull();
	});

	it("imports in batches with authors, terms, redirects, menus, media and a report", async () => {
		const job = await jobs.create(WXR, options({ downloadMedia: true }));
		let state = await jobs.step(job.id, 2);
		expect(state).toMatchObject({ status: "running", cursor: 2 });
		state = await jobs.step(job.id, 2);
		expect(state).toMatchObject({ status: "done", cursor: 3, errors: [] });

		const hello = await service.get("posts", "hello");
		expect(hello?.data).toMatchObject({
			title: "Hello & welcome",
			author: "ada",
			categories: ["releases"],
			tags: ["astro"],
		});
		expect(hello?.body).toMatch(/!\[A pic\]\(\/uploads\/\d{4}\/\d{2}\/[\w-]+\.png\)/);
		expect(hello?.body).toContain("[about us](/about/)");
		expect(fetched).toEqual(["https://old.example/wp-content/uploads/pic.png"]);
		expect((await service.get("posts", "wip"))?.data.draft).toBe(true);
		expect(await service.get("pages", "about")).not.toBeNull();

		expect(await json.read("bylines", [])).toMatchObject([{ slug: "ada", name: "Ada Lovelace" }]);
		const tax = (await json.read("taxonomies", [])) as Array<{
			name: string;
			terms: Array<{ slug: string; parent?: string }>;
		}>;
		expect(tax.find((t) => t.name === "categories")?.terms).toMatchObject([
			{ slug: "news" },
			{ slug: "releases", parent: "news" },
		]);
		expect(await redirects.listStored()).toMatchObject([
			{ from: "/2024/05/hello", to: "/blog/hello", status: 301 },
			{ from: "/about", to: "/pages/about" },
		]);
		expect(await json.read("menus", [])).toMatchObject([
			{ name: "main", items: [{ label: "Home", href: "/", children: [{ label: "About us", href: "/about/" }] }] },
		]);
	});

	it("skips or renames conflicts, and leaves pages out without a page collection", async () => {
		await service.put("posts", "hello", { data: { title: "Existing" }, body: "" });
		const skipped = await jobs.step((await jobs.create(WXR, { ...options(), pageCollection: undefined })).id, 10);
		expect(skipped.skipped).toEqual(["posts/hello: already exists", "about: pages are not being imported"]);
		expect((await service.get("posts", "hello"))?.data.title).toBe("Existing");

		const renamed = await jobs.step((await jobs.create(WXR, options({ onConflict: "rename" }))).id, 10);
		expect(renamed.created.map((c) => c.slug)).toContain("hello-2");
	});

	it("keeps the post when its image cannot be downloaded, and reports the image", async () => {
		const failing = new ImportJobs({
			root,
			service,
			media: new MediaService(root, await RealGit.ensure(root)),
			json,
			redirects,
			fetchMedia: async () => {
				throw new Error("Download failed (404)");
			},
		});
		const state = await failing.step((await failing.create(WXR, options({ downloadMedia: true }))).id, 10);
		expect(state.status).toBe("done");
		expect(state.errors).toEqual(["https://old.example/wp-content/uploads/pic.png: Download failed (404)"]);
		expect((await service.get("posts", "hello"))?.body).toContain("https://old.example/wp-content/uploads/pic.png");
	});

	it("downloads no media unless asked", async () => {
		await jobs.step((await jobs.create(WXR, options())).id, 10);
		expect(fetched).toEqual([]);
	});

	it("rolls everything back: entries, media, bylines, taxonomies, redirects and menus", async () => {
		await json.write("menus", [{ name: "old", label: "Old", location: "header", items: [] }], "seed");
		const job = await jobs.create(WXR, options({ downloadMedia: true }));
		await jobs.step(job.id, 10);
		expect((await jobs.get(job.id))?.media).toHaveLength(1);

		const after = await jobs.rollback(job.id);
		expect(after.status).toBe("rolled-back");
		expect(await service.get("posts", "hello")).toBeNull();
		expect(await service.get("pages", "about")).toBeNull();
		expect(await json.read("bylines", [])).toEqual([]);
		expect(await json.read("taxonomies", [])).toEqual(
			[{ name: "tags", label: "Tags", hierarchical: false, collections: ["posts"], terms: [] }]
				.slice(0, 0)
				.concat((await json.read("taxonomies", [])) as never[])
				.slice(0, 0),
		);
		expect(await redirects.listStored()).toEqual([]);
		expect((await json.read("menus", [])) as unknown[]).toHaveLength(1);
	});
});

const send = (path: string, body?: unknown) =>
	app.request(path, {
		method: body === undefined ? "GET" : "POST",
		headers: { "X-Wuppy-Request": "1", "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});

describe("import API", () => {
	it("creates, runs, reports progress and rolls back", async () => {
		const created = await send("/api/import/wordpress/jobs", {
			xml: WXR,
			collection: "posts",
			pageCollection: "pages",
		});
		expect(created.status).toBe(201);
		const { data: job } = (await created.json()) as { data: JobState };
		const run = (await (await send(`/api/import/wordpress/jobs/${job.id}/run`, { batch: 2 })).json()) as {
			data: JobState;
		};
		expect(run.data).toMatchObject({ status: "running", cursor: 2 });
		const status = (await (await send(`/api/import/wordpress/jobs/${job.id}`)).json()) as { data: JobState };
		expect(status.data.cursor).toBe(2);
		await send(`/api/import/wordpress/jobs/${job.id}/run`, {});
		const undone = (await (await send(`/api/import/wordpress/jobs/${job.id}/rollback`, {})).json()) as {
			data: JobState;
		};
		expect(undone.data.status).toBe("rolled-back");
		expect(await service.get("posts", "hello")).toBeNull();
	});

	it("rejects files that are not WXR, unknown collections and unknown or malformed job ids", async () => {
		expect((await send("/api/import/wordpress/jobs", { xml: "<rss></rss>", collection: "posts" })).status).toBe(422);
		expect((await send("/api/import/wordpress/jobs", { xml: WXR, collection: "nope" })).status).toBe(422);
		expect((await send("/api/import/wordpress/jobs/not-an-id")).status).toBe(404);
		expect((await send("/api/import/wordpress/jobs/00000000-0000-0000-0000-000000000000/run", {})).status).toBe(404);
	});
});
