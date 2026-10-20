import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { RealGit } from "@wuppy/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type User } from "../../src/api/app.ts";
import { CommentService } from "../../src/comments/index.ts";
import { collectionSchema } from "../../src/content-types/index.ts";
import { AutosaveStore } from "../../src/content/autosave.ts";
import { diffFields } from "../../src/content/field-diff.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { MediaService } from "../../src/media/index.ts";
import { signPreview, verifyPreview } from "../../src/publishing/index.ts";
import { RedirectService } from "../../src/redirects/service.ts";

const USER: User = { id: "u", permissions: ["content:read", "content:write", "git:read"] };
const H = { "X-Wuppy-Request": "1", "Content-Type": "application/json" };

let root: string;
let git: RealGit;
let service: ContentService;
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-rev-"));
	git = await RealGit.init(root);
	const json = new JsonStore(root, git);
	service = new ContentService(
		root,
		[collectionSchema.parse({ name: "posts", dir: "content/posts", route: "/blog/{slug}" })],
		git,
	);
	app = createApp({
		service,
		media: new MediaService(root, git),
		json,
		comments: new CommentService(new DatabaseSync(":memory:")),
		redirects: new RedirectService(json, new DatabaseSync(":memory:"), []),
		userCount: () => 1,
		autosave: new AutosaveStore(root),
		previewSecret: "x".repeat(32),
		getUser: async () => USER,
	});
});
afterEach(() => rm(root, { recursive: true, force: true }));

const send = (method: string, path: string, body?: unknown) =>
	app.request(path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });

describe("diffFields", () => {
	it("reports added, removed and changed fields and the body, sorted by name", () => {
		const changes = diffFields(
			{ data: { title: "A", draft: true, tags: ["x"] }, body: "one" },
			{ data: { title: "B", tags: ["x"], cover: "/c.png" }, body: "two" },
		);
		expect(changes).toEqual([
			{ field: "cover", after: "/c.png", kind: "added" },
			{ field: "draft", before: true, kind: "removed" },
			{ field: "title", before: "A", after: "B", kind: "changed" },
			{ field: "body", before: "one", after: "two", kind: "changed" },
		]);
		expect(diffFields({ data: { a: 1 }, body: "" }, { data: { a: 1 }, body: "" })).toEqual([]);
	});
});

describe("revisions API", () => {
	it("returns an old version and a field summary against the current one", async () => {
		await service.put("posts", "a", { data: { title: "One" }, body: "first" });
		const sha = (await service.history("posts", "a"))[0]!.sha;
		await service.put("posts", "a", { data: { title: "Two", draft: true }, body: "second" });

		const res = await send("GET", `/api/revisions/posts/${sha}/a`);
		const { revision, changes } = (await res.json()).data;
		expect(revision).toEqual({ data: { title: "One" }, body: "first" });
		expect(changes.map((c: { field: string }) => c.field)).toEqual(["draft", "title", "body"]);
		expect((await send("GET", `/api/revisions/posts/${sha}/missing`)).status).toBe(404);
		expect((await send("GET", "/api/revisions/posts/nothex/a")).status).toBe(400);
	});
});

describe("autosave", () => {
	it("keeps one recovery copy per entry without creating Git history", async () => {
		await service.put("posts", "a", { data: { title: "Saved" }, body: "x" });
		const commits = (await git.history()).length;
		expect((await (await send("GET", "/api/autosave/posts/a")).json()).data).toBeNull();

		const put = await send("PUT", "/api/autosave/posts/a", { data: { title: "Unsaved" }, body: "draft text" });
		expect((await put.json()).data).toMatchObject({ userId: "u", body: "draft text" });
		const got = (await (await send("GET", "/api/autosave/posts/a")).json()).data;
		expect(got).toMatchObject({ data: { title: "Unsaved" }, body: "draft text" });
		expect((await git.history()).length).toBe(commits);
		expect((await service.get("posts", "a"))?.data.title).toBe("Saved");

		await send("DELETE", "/api/autosave/posts/a");
		expect((await (await send("GET", "/api/autosave/posts/a")).json()).data).toBeNull();
	});

	it("rejects unknown collections and keeps odd slugs inside the autosave directory", async () => {
		expect((await send("PUT", "/api/autosave/nope/a", { data: {}, body: "" })).status).toBe(404);
		expect((await send("PUT", "/api/autosave/posts/..%2F..%2Fevil", { data: {}, body: "" })).status).toBe(200);
		expect((await send("PUT", "/api/autosave/posts/a", { data: "x" })).status).toBe(422);
	});
});

describe("preview links", () => {
	it("signs a link that verifies only for that entry, before it expires", async () => {
		await service.put("posts", "a", { data: { title: "Hidden", draft: true }, body: "" });
		const { url } = (await (await send("GET", "/api/preview-link/posts/a")).json()).data;
		expect(url).toMatch(/^\/blog\/a\?wuppy-preview=\d+\./);
		const token = new URL(url, "http://x").searchParams.get("wuppy-preview")!;
		const secret = "x".repeat(32);
		expect(verifyPreview(secret, "posts", "a", token)).toBe(true);
		expect(verifyPreview(secret, "posts", "b", token)).toBe(false);
		expect(verifyPreview(secret, "pages", "a", token)).toBe(false);
		expect(verifyPreview("y".repeat(32), "posts", "a", token)).toBe(false);
		expect(verifyPreview(secret, "posts", "a", `${token}0`)).toBe(false);
		expect(verifyPreview(secret, "posts", "a", null)).toBe(false);
		const old = signPreview(secret, "posts", "a", 1000, Date.now() - 5000).token;
		expect(verifyPreview(secret, "posts", "a", old)).toBe(false);
		expect((await send("GET", "/api/preview-link/posts/none")).status).toBe(404);
	});
});

describe("content GET carries an etag", () => {
	it("returns the same etag as the header", async () => {
		await service.put("posts", "a", { data: { title: "x" }, body: "" });
		const res = await send("GET", "/api/content/posts/a");
		expect((await res.json()).etag).toBe(res.headers.get("etag"));
	});
});
