import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { RealGit } from "@wuppycms/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type User } from "../../src/api/app.ts";
import { CommentService } from "../../src/comments/index.ts";
import { collectionSchema } from "../../src/content-types/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { MediaService } from "../../src/media/index.ts";
import { RedirectService } from "../../src/redirects/service.ts";
import type { GithubThemes } from "../../src/themes/github.ts";

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
const app = (themes?: GithubThemes) =>
	createApp({
		themes,
		service,
		media: new MediaService(root, git, undefined, json),
		json,
		comments,
		redirects,
		userCount: () => 1,
		locales: ["en", "tr"],
		getUser: async () => ADMIN,
	});

const putSection = (body: string) =>
	app().request("/api/data/sections", {
		method: "PUT",
		headers: H,
		body: JSON.stringify({ data: [{ slug: "cta", title: "CTA", body }] }),
	});

const putWidgets = (widgets: unknown[]) =>
	app().request("/api/data/widgets", {
		method: "PUT",
		headers: H,
		body: JSON.stringify({ data: [{ name: "sidebar", label: "Sidebar", widgets }] }),
	});

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-admin-"));
	git = await RealGit.init(root);
	json = new JsonStore(root, git);
	comments = new CommentService(new DatabaseSync(":memory:"));
	redirects = new RedirectService(json, new DatabaseSync(":memory:"), []);
	service = new ContentService(
		root,
		[
			collectionSchema.parse({
				name: "posts",
				dir: "content/posts",
				fields: { title: "string", draft: "boolean", date: "date" },
			}),
		],
		git,
	);
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("site data", () => {
	it("round-trips menus and commits the JSON file", async () => {
		const menu = {
			name: "main",
			label: "Main",
			location: "header",
			items: [{ label: "Home", href: "/", children: [] }],
		};
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

	it("keeps link descriptions and has the theme built again after a change of data it renders", async () => {
		let changed = 0;
		const themes = { dataChanged: () => changed++ } as unknown as GithubThemes;
		const items = [
			{
				label: "Product",
				href: "/#top",
				description: "All of it",
				children: [{ label: "AI", href: "/#ai", description: "Agents" }],
			},
		];
		const put = await app(themes).request("/api/data/menus", {
			method: "PUT",
			headers: H,
			body: JSON.stringify({ data: [{ name: "main", label: "Main", location: "header", items }] }),
		});
		expect(put.status).toBe(200);
		expect((await put.json()).data[0].items).toEqual(items);
		expect(changed).toBe(1);
		const put2 = (name: string, data: unknown) =>
			app(themes).request(`/api/data/${name}`, { method: "PUT", headers: H, body: JSON.stringify({ data }) });
		expect((await put2("sections", [{ slug: "cta", title: "CTA", body: "Hi" }])).status).toBe(200);
		expect(changed).toBe(2);
		expect((await put2("taxonomies", [])).status).toBe(200);
		expect(changed).toBe(2);
	});

	it("checks section bodies as Markdown: markup is saved, unsafe HTML and components are refused", async () => {
		expect((await putSection('## Join us\n\n<div class="note">**Free**</div>')).status).toBe(200);
		const bad = await putSection('<img src="x" onError="alert(1)" /> <Callout />');
		expect(bad.status).toBe(422);
		expect(JSON.stringify(await bad.json())).toMatch(/cta: onError.*cta: Callout/);
	});

	it("checks widget bodies: custom ones as Markdown, HTML ones for dangerous markup; text is left alone", async () => {
		const ok = await putWidgets([
			{ id: "a", type: "custom", body: "**Hello** <div>there</div>" },
			{ id: "b", type: "html", body: "<p>Hi</p>" },
			{ id: "c", type: "text", body: "{not code} <script>shown as text</script>" },
		]);
		expect(ok.status).toBe(200);
		const bad = await putWidgets([
			{ id: "a", type: "custom", body: "<script>alert(1)</script>" },
			{ id: "b", type: "html", body: '<img src="x" onerror="alert(1)">' },
		]);
		expect(bad.status).toBe(422);
		expect(JSON.stringify(await bad.json())).toMatch(/a: script/);
		const html = await putWidgets([{ id: "b", type: "html", body: '<a href="javascript:alert(1)">x</a>' }]);
		expect(JSON.stringify(await html.json())).toMatch(/b: javascript:/);
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

const move = (slug: string, at: string) =>
	app().request(`/api/calendar/posts/${slug}`, { method: "PATCH", headers: H, body: JSON.stringify({ at }) });

describe("calendar status and rescheduling", () => {
	it("labels drafts, scheduled and live entries by the same rule as isPublished", async () => {
		await service.put("posts", "live", { data: { title: "Live", date: "2020-01-01T00:00:00.000Z" }, body: "" });
		await service.put("posts", "wip", {
			data: { title: "Wip", draft: true, date: "2020-01-02T00:00:00.000Z" },
			body: "",
		});
		await service.put("posts", "later", { data: { title: "Later", publishAt: "2999-01-01T00:00:00.000Z" }, body: "" });
		const items = (await (await app().request("/api/calendar")).json()).data as Array<{
			slug: string;
			status: string;
			field: string;
		}>;
		expect(Object.fromEntries(items.map((i) => [i.slug, [i.status, i.field]]))).toEqual({
			live: ["published", "date"],
			wip: ["draft", "date"],
			later: ["scheduled", "publishAt"],
		});
	});

	it("moves an entry to another day through the field it is dated by, keeping date-only values date-only", async () => {
		await service.put("posts", "a", { data: { title: "A", publishAt: "2999-01-01T09:30:00.000Z" }, body: "Body" });
		await service.put("posts", "b", { data: { title: "B", date: "2026-05-10" }, body: "" });
		expect((await move("a", "2999-01-05T09:30:00.000Z")).status).toBe(200);
		expect((await service.get("posts", "a"))?.data.publishAt).toBe("2999-01-05T09:30:00.000Z");
		expect((await service.get("posts", "a"))?.body).toBe("Body");
		await move("b", "2026-05-12T00:00:00.000Z");
		expect((await service.get("posts", "b"))?.data.date).toBe("2026-05-12");
		expect((await move("nope", "2026-05-12T00:00:00.000Z")).status).toBe(404);
		expect((await move("a", "yesterday")).status).toBe(422);
	});
});

describe("redirects", () => {
	it("merges saved rules and records 404s", async () => {
		await redirects.save([{ from: "/old", to: "/new", status: 301 }]);
		const list = (await (await app().request("/api/redirects")).json()).data;
		expect(list).toMatchObject([{ from: "/old", to: "/new", status: 301, match: "exact", enabled: true }]);

		redirects.record404("/missing");
		const missing = (await (await app().request("/api/redirects/404")).json()).data;
		expect(missing[0]).toMatchObject({ path: "/missing", count: 1 });
	});
});

const send = (path: string, body?: unknown) =>
	app().request(path, { method: body ? "POST" : "GET", headers: H, body: body ? JSON.stringify(body) : undefined });

describe("redirect import/export", () => {
	it("exports CSV, imports with merge or replace, and rejects a bad row without saving anything", async () => {
		await redirects.save([{ from: "/old", to: "/new" }]);

		const csv = await (await send("/api/redirects/export?format=csv")).text();
		expect(csv.split("\n")[0]).toBe("from,to,status,match,enabled,note");
		expect(csv).toContain("/old,/new,301,exact,true");

		const merged = await send("/api/redirects/import", { format: "csv", text: "/a,/b\n/old,/newer" });
		expect((await merged.json()).data).toEqual({ imported: 2, total: 2 });
		expect((await redirects.list()).map((r) => `${r.from}>${r.to}`).toSorted()).toEqual(["/a>/b", "/old>/newer"]);

		const bad = await send("/api/redirects/import", {
			format: "csv",
			text: "/ok,/fine\n/bad,javascript:x",
			mode: "replace",
		});
		expect(bad.status).toBe(422);
		expect(await redirects.list()).toHaveLength(2);

		const replaced = await send("/api/redirects/import", {
			format: "json",
			text: JSON.stringify([{ from: "/only", to: "/one" }]),
			mode: "replace",
		});
		expect(replaced.status).toBe(200);
		expect((await redirects.list()).map((r) => r.from)).toEqual(["/only"]);
	});
});
