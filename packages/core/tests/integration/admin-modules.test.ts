import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { RealGit } from "@wuppy/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type User } from "../../src/api/app.ts";
import { CommentService } from "../../src/comments/index.ts";
import { collectionSchema } from "../../src/content-types/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { MediaService } from "../../src/media/index.ts";
import { RedirectService } from "../../src/redirects/service.ts";

const ADMIN: User = {
	id: "admin",
	permissions: [
		"content:read",
		"content:write",
		"content:delete",
		"content:publish",
		"media:write",
		"media:delete",
		"comments:read",
		"comments:moderate",
		"menus:manage",
		"widgets:manage",
		"sections:manage",
		"taxonomies:manage",
		"bylines:manage",
		"content-types:manage",
		"themes:manage",
		"plugins:manage",
		"users:manage",
		"site:settings",
		"site:transfer",
		"import:run",
		"git:read",
		"git:revert",
		"audit:read",
	],
};

let root: string;
let git: RealGit;
let service: ContentService;
let json: JsonStore;
let comments: CommentService;
let redirects: RedirectService;
const H = { "X-Wuppy-Request": "1", "Content-Type": "application/json" };
const app = () =>
	createApp({
		service,
		media: new MediaService(root, git, undefined, json),
		json,
		comments,
		redirects,
		userCount: () => 1,
		locales: ["en", "tr"],
		getUser: async () => ADMIN,
	});

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-admin-"));
	git = await RealGit.init(root);
	json = new JsonStore(root, git);
	comments = new CommentService(new DatabaseSync(":memory:"));
	redirects = new RedirectService(json, new DatabaseSync(":memory:"), []);
	service = new ContentService(
		root,
		[collectionSchema.parse({ name: "posts", dir: "content/posts", fields: { title: "string", draft: "boolean", date: "date" } })],
		git,
	);
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("site data", () => {
	it("round-trips menus and commits the JSON file", async () => {
		const menu = { name: "main", label: "Main", location: "header", items: [{ label: "Home", href: "/", children: [] }] };
		const put = await app().request("/api/data/menus", {
			method: "PUT",
			headers: H,
			body: JSON.stringify({ data: [menu] }),
		});
		expect(put.status).toBe(200);
		const res = await app().request("/api/data/menus");
		expect((await res.json()).data).toEqual([menu]);
		expect(await readFile(join(root, ".wuppy/data/menus.json"), "utf8")).toContain('"main"');
	});

	it("rejects invalid data", async () => {
		const res = await app().request("/api/data/settings", {
			method: "PUT",
			headers: H,
			body: JSON.stringify({ data: { siteName: 1 } }),
		});
		expect(res.status).toBe(422);
	});
});

describe("comments", () => {
	it("holds moderated comments until approved, then exposes them publicly", async () => {
		const post = await app().request("/api/public/comments/posts/hello", {
			method: "POST",
			headers: H,
			body: JSON.stringify({ author: "Ada", body: "Nice post", website: "" }),
		});
		expect(post.status).toBe(201);
		const publicBefore = await app().request("/api/public/comments/posts/hello");
		expect((await publicBefore.json()).data).toEqual([]);

		const list = await app().request("/api/comments?status=pending");
		const pending = (await list.json()).data as Array<{ id: string }>;
		expect(pending).toHaveLength(1);
		const approve = await app().request(`/api/comments/${pending[0]!.id}`, {
			method: "PATCH",
			headers: H,
			body: JSON.stringify({ status: "approved" }),
		});
		expect(approve.status).toBe(200);

		const publicAfter = await app().request("/api/public/comments/posts/hello");
		expect((await publicAfter.json()).data).toHaveLength(1);
	});

	it("rejects the honeypot", async () => {
		const res = await app().request("/api/public/comments/posts/hello", {
			method: "POST",
			headers: H,
			body: JSON.stringify({ author: "Bot", body: "spam", website: "https://spam.example" }),
		});
		expect(res.status).toBe(422);
	});
});

describe("dashboard, calendar and search", () => {
	it("summarises content and recent activity", async () => {
		await service.put("posts", "hello", { data: { title: "Hello", draft: false }, body: "Body" });
		await service.put("posts", "draft", { data: { title: "Draft", draft: true }, body: "Hidden" });

		const dashboard = (await (await app().request("/api/dashboard")).json()).data;
		expect(dashboard.drafts).toBe(1);
		expect(dashboard.collections[0]).toMatchObject({ total: 2, published: 1, draft: 1 });
		expect(dashboard.recent[0].title).toBeTruthy();

		const search = (await (await app().request("/api/search?q=hello")).json()).data;
		expect(search).toHaveLength(1);
	});

	it("returns entries in a date range", async () => {
		await service.put("posts", "dated", {
			data: { title: "Dated", date: "2026-05-10T00:00:00.000Z" },
			body: "",
		});
		const res = await app().request("/api/calendar?from=2026-05-01T00:00:00.000Z&to=2026-06-01T00:00:00.000Z");
		const data = (await res.json()).data as Array<{ title: string }>;
		expect(data.map((item) => item.title)).toContain("Dated");
	});
});

describe("redirects", () => {
	it("merges saved rules and records 404s", async () => {
		await redirects.save([{ from: "/old", to: "/new", status: 301 }]);
		const list = (await (await app().request("/api/redirects")).json()).data;
		expect(list).toEqual([{ from: "/old", to: "/new", status: 301 }]);

		redirects.record404("/missing");
		const missing = (await (await app().request("/api/redirects/404")).json()).data;
		expect(missing[0]).toMatchObject({ path: "/missing", count: 1 });
	});
});
