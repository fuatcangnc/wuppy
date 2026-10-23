import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { RealGit } from "@wuppy/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditLog } from "../../src/audit/index.ts";
import { createApp, type User } from "../../src/api/app.ts";
import { CommentService } from "../../src/comments/index.ts";
import { collectionSchema } from "../../src/content-types/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { MediaService } from "../../src/media/index.ts";
import { RedirectService } from "../../src/redirects/service.ts";
import { GithubAccounts, GithubThemes } from "../../src/themes/github.ts";

const ALL: User = {
	id: "u1",
	permissions: ["content:read", "content:write", "content:delete", "content:publish", "git:read", "git:revert"],
};
const ADMIN_AUDIT = "audit:read";
const READER: User = { id: "u2", permissions: ["content:read"] };

let root: string;
let svc: ContentService;
let git: RealGit;
let audit: AuditLog;
let user: User | null;
let json: JsonStore;
let comments: CommentService;
let redirects: RedirectService;
const app = () =>
	createApp({
		service: svc,
		audit,
		locales: ["en", "tr"],
		media: new MediaService(root, git),
		json,
		comments,
		redirects,
		userCount: () => 1,
		getUser: async () => user,
	});
const H = { "X-Wuppy-Request": "1", "Content-Type": "application/json" };
const put = (slug: string, body: unknown, headers: Record<string, string> = H) =>
	app().request(`/api/content/posts/${slug}`, { method: "PUT", headers, body: JSON.stringify(body) });
const create = (body: unknown, headers: Record<string, string> = H) =>
	app().request("/api/content/posts", { method: "POST", headers, body: JSON.stringify(body) });

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-api-"));
	git = await RealGit.init(root);
	audit = new AuditLog(new DatabaseSync(":memory:"));
	json = new JsonStore(root, git);
	comments = new CommentService(new DatabaseSync(":memory:"));
	redirects = new RedirectService(json, new DatabaseSync(":memory:"), []);
	svc = new ContentService(
		root,
		[collectionSchema.parse({ name: "posts", dir: "content/posts", fields: { title: "string", draft: "boolean" } })],
		git,
		{ components: ["Callout"] },
	);
	user = ALL;
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("content API", () => {
	it("401 without a user", async () => {
		user = null;
		const res = await app().request("/api/content/posts");
		expect(res.status).toBe(401);
		expect(await res.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
	});

	it("403 without the permission", async () => {
		user = READER;
		expect((await put("a", { data: {}, body: "" })).status).toBe(403);
	});

	it("403 on mutation without the CSRF header", async () => {
		const res = await put("a", { data: {}, body: "" }, { "Content-Type": "application/json" });
		expect(res.status).toBe(403);
	});

	it("PUT then GET round-trips, nested slug works", async () => {
		expect((await put("a/b", { data: { title: "T" }, body: "hi\n" })).status).toBe(200);
		const res = await app().request("/api/content/posts/a/b");
		expect(await res.json()).toMatchObject({ data: { slug: "a/b", data: { title: "T" }, body: "hi\n" } });
		const list = (await (await app().request("/api/content/posts")).json()) as {
			data: Array<{ slug: string }>;
		};
		expect(list.data.map((e) => e.slug)).toEqual(["a/b"]);
	});

	it("POST creates an entry and refuses to overwrite an existing slug", async () => {
		const first = await create({ slug: "new-post", data: { title: "One" }, body: "one\n" });
		expect(first.status).toBe(201);
		expect(await first.json()).toMatchObject({ data: { ok: true, slug: "new-post" } });

		const conflict = await create({ slug: "new-post", data: { title: "Two" }, body: "two\n" });
		expect(conflict.status).toBe(409);
		expect(await conflict.json()).toMatchObject({ error: { code: "SLUG_TAKEN" } });

		const entry = (await (await app().request("/api/content/posts/new-post")).json()) as {
			data: { data: { title: string }; body: string };
		};
		expect(entry.data).toEqual({ slug: "new-post", data: { title: "One" }, body: "one\n" });
	});

	it("authors can create drafts but not published entries", async () => {
		user = { id: "author", permissions: ["content:read", "content:write"] };
		expect((await create({ slug: "published", data: {}, body: "" })).status).toBe(403);
		expect((await create({ slug: "draft", data: { draft: true }, body: "" })).status).toBe(201);
	});

	it("404 for missing entry, 404 for unknown collection", async () => {
		expect((await app().request("/api/content/posts/nope")).status).toBe(404);
		expect((await app().request("/api/content/nope")).status).toBe(404);
	});

	it("422 on invalid body, 400 on unsafe slug", async () => {
		expect((await put("a", { data: { title: 42 }, body: "" })).status).toBe(422);
		const bad = await put("a", { data: "nope" });
		expect(bad.status).toBe(422);
		expect(await bad.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
		const evil = await app().request("/api/content/posts/%2e%2e/x", {
			method: "PUT",
			headers: H,
			body: JSON.stringify({ data: {}, body: "" }),
		});
		expect([400, 404]).toContain(evil.status);
	});

	it("history, diff and revert via API", async () => {
		await put("a", { data: { title: "1" }, body: "" });
		await put("a", { data: { title: "2" }, body: "" });
		const hist = (await (await app().request("/api/history/posts/a")).json()) as { data: { sha: string }[] };
		expect(hist.data).toHaveLength(2);
		const sha = hist.data[0]!.sha;
		const diff = (await (await app().request(`/api/commits/${sha}/diff`)).json()) as { data: string };
		expect(diff.data).toContain('+title: "2"');
		expect((await app().request(`/api/commits/${sha}/revert`, { method: "POST", headers: H })).status).toBe(200);
		const now = (await (await app().request("/api/content/posts/a")).json()) as { data: { data: { title: unknown } } };
		expect(now.data.data.title).toBe("1");
	});

	it("500 hides internals", async () => {
		const broken = new ContentService(root, [], {
			commit: async () => "",
			history: async () => [],
			diff: async () => "",
			show: async () => null,
			revert: async () => "",
		});
		broken.listEntries = async () => {
			throw new Error("secret db path /etc/x");
		};
		const res = await createApp({
			service: broken,
			media: new MediaService(root, git),
			json,
			comments,
			redirects,
			userCount: () => 1,
			getUser: async () => ALL,
		}).request("/api/content/posts");
		expect(res.status).toBe(500);
		expect(JSON.stringify(await res.json())).not.toContain("secret");
	});

	it("translation status per collection", async () => {
		await put("en/hi", { data: {}, body: "" });
		await put("tr/hi", { data: {}, body: "" });
		await put("en/solo", { data: {}, body: "" });
		const res = await app().request("/api/i18n/posts");
		const { data, locales } = (await res.json()) as { data: { key: string; missing: string[] }[]; locales: string[] };
		expect(locales).toEqual(["en", "tr"]);
		expect(data).toEqual([
			{ key: "hi", translations: { en: "en/hi", tr: "tr/hi" }, missing: [], stale: [] },
			{ key: "solo", translations: { en: "en/solo" }, missing: ["tr"], stale: [] },
		]);
	});

	it("422 when the body contains disallowed MDX/HTML, 200 for allowed components", async () => {
		const bad = await put("x", { data: {}, body: "<script>alert(1)</script>" });
		expect(bad.status).toBe(422);
		expect(await bad.json()).toMatchObject({ error: { code: "DISALLOWED_CONTENT", details: ["script"] } });
		expect((await put("y", { data: {}, body: '<Callout type="note">ok</Callout>' })).status).toBe(200);
		expect((await put("z", { data: {}, body: "<Evil />" })).status).toBe(422);
	});

	it("audit log needs audit:read", async () => {
		audit.record({ type: "auth.sign_in", ok: true, at: "2026-01-01T00:00:00.000Z" });
		expect((await app().request("/api/audit")).status).toBe(403);
		user = { id: "a", permissions: [ADMIN_AUDIT] };
		const res = await app().request("/api/audit");
		expect(res.status).toBe(200);
		expect(((await res.json()) as { data: unknown[] }).data).toHaveLength(1);
	});

	it("export/import need site:transfer and round-trip", async () => {
		await put("a", { data: { title: "A" }, body: "x" });
		expect((await app().request("/api/export")).status).toBe(403);
		user = { id: "t", permissions: ["site:transfer"] };
		const exp = await app().request("/api/export");
		expect(exp.status).toBe(200);
		expect(exp.headers.get("content-disposition")).toContain("attachment");
		const bundle = await exp.json();
		expect((bundle as { collections: { posts: object } }).collections.posts).toHaveProperty("a");

		const bad = await app().request("/api/import", {
			method: "POST",
			headers: H,
			body: JSON.stringify({ version: 9 }),
		});
		expect(bad.status).toBe(422);
		const ok = await app().request("/api/import", { method: "POST", headers: H, body: JSON.stringify(bundle) });
		expect(await ok.json()).toEqual({ data: { imported: 1, errors: [] } });
	});

	it("API responses are never cached or sniffed, including errors", async () => {
		for (const res of [await app().request("/api/collections"), await app().request("/api/content/nope")]) {
			expect(res.headers.get("cache-control")).toBe("no-store");
			expect(res.headers.get("x-content-type-options")).toBe("nosniff");
		}
		user = null;
		expect((await app().request("/api/collections")).headers.get("cache-control")).toBe("no-store");
	});

	it("authors can only save drafts; publishing (and editing published pages) needs content:publish", async () => {
		const AUTHOR: User = { id: "a", permissions: ["content:read", "content:write"] };
		user = AUTHOR;
		expect((await put("wip", { data: { draft: true }, body: "x" })).status).toBe(200);
		expect((await put("wip", { data: { draft: true, title: "again" }, body: "x" })).status).toBe(200);
		const publish = await put("wip", { data: { draft: false }, body: "x" });
		expect(publish.status).toBe(403);
		expect(await publish.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
		expect((await put("nodraft", { data: {}, body: "x" })).status).toBe(403);

		user = ALL;
		await put("live", { data: { title: "Live" }, body: "x" });
		user = AUTHOR;
		expect((await put("live", { data: { draft: true }, body: "hijack" })).status).toBe(403);

		user = { id: "e", permissions: ["content:read", "content:write", "content:publish"] };
		expect((await put("wip", { data: { draft: false }, body: "x" })).status).toBe(200);
	});
});

describe("user security API", () => {
	const USERS_ADMIN: User = { id: "u-admin", permissions: ["users:manage"] };
	const securityApp = (
		resetTwoFactor: (userId: string) => { email: string; deleted: boolean } | null,
		as: User = USERS_ADMIN,
	) =>
		createApp({
			service: svc,
			audit,
			locales: ["en"],
			media: new MediaService(root, git),
			json,
			comments,
			redirects,
			userCount: () => 2,
			getUser: async () => as,
			resetTwoFactor,
		});

	it("resets two-factor for another user and audits it", async () => {
		const calls: string[] = [];
		const res = await securityApp((id) => {
			calls.push(id);
			return { email: "target@x.test", deleted: true };
		}).request("/api/users/u-target/reset-two-factor", { method: "POST", headers: H });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ data: { ok: true } });
		expect(calls).toEqual(["u-target"]);
		expect(audit.list()[0]).toMatchObject({
			type: "user.reset_2fa",
			ok: true,
			actor: "u-admin",
			email: "target@x.test",
		});
	});

	it("refuses self-reset, missing users and users without 2FA", async () => {
		const self = await securityApp(() => ({ email: "admin@x.test", deleted: true }), {
			id: "u-self",
			permissions: ["users:manage"],
		}).request("/api/users/u-self/reset-two-factor", { method: "POST", headers: H });
		expect(self.status).toBe(400);

		const missing = await securityApp(() => null).request("/api/users/nope/reset-two-factor", {
			method: "POST",
			headers: H,
		});
		expect(missing.status).toBe(404);

		const disabled = await securityApp(() => ({ email: "target@x.test", deleted: false })).request(
			"/api/users/u-target/reset-two-factor",
			{ method: "POST", headers: H },
		);
		expect(disabled.status).toBe(400);
	});

	it("requires users:manage", async () => {
		const res = await securityApp(() => ({ email: "target@x.test", deleted: true }), READER).request(
			"/api/users/u-target/reset-two-factor",
			{ method: "POST", headers: H },
		);
		expect(res.status).toBe(403);
	});
});

const get = (path: string, headers: Record<string, string> = {}) => app().request(path, { headers });

describe("list, conflicts and request guards", () => {
	beforeEach(() => {
		user = ALL;
	});

	it("filters, sorts and paginates with a cursor", async () => {
		for (const [slug, title, draft] of [
			["a", "Apple", false],
			["b", "Banana", true],
			["c", "Cherry", false],
		] as const) {
			await put(slug, { data: { title, draft }, body: `about ${title}` });
		}
		const first = await (await get("/api/content/posts?sort=title&limit=2")).json();
		expect(first.data.map((e: { slug: string }) => e.slug)).toEqual(["a", "b"]);
		expect(first.total).toBe(3);
		const second = await (await get(`/api/content/posts?sort=title&limit=2&cursor=${first.nextCursor}`)).json();
		expect(second.data.map((e: { slug: string }) => e.slug)).toEqual(["c"]);
		expect(second.nextCursor).toBeNull();
		expect((await (await get("/api/content/posts?status=draft")).json()).data).toHaveLength(1);
		expect((await (await get("/api/content/posts?q=cherry")).json()).data).toHaveLength(1);
		expect((await (await get("/api/content/posts")).json()).data).toHaveLength(3);
	});

	it("serves an ETag, answers 304, and rejects a stale If-Match with 409", async () => {
		await put("a", { data: { title: "One", draft: false }, body: "x" });
		const res = await get("/api/content/posts/a");
		const etag = res.headers.get("etag")!;
		expect((await get("/api/content/posts/a", { "If-None-Match": etag })).status).toBe(304);
		await put("a", { data: { title: "Two", draft: false }, body: "x" });
		const stale = await put("a", { data: { title: "Mine", draft: false }, body: "x" }, { ...H, "If-Match": etag });
		expect(stale.status).toBe(409);
		const body = await stale.json();
		expect(body.error.code).toBe("CONFLICT");
		expect(body.error.details.current.data.title).toBe("Two");
		const fresh = (await get("/api/content/posts/a")).headers.get("etag")!;
		expect(
			(await put("a", { data: { title: "Mine", draft: false }, body: "x" }, { ...H, "If-Match": fresh })).status,
		).toBe(200);
	});

	it("replays a repeated POST with the same Idempotency-Key instead of creating twice", async () => {
		const headers = { ...H, "Idempotency-Key": "k1" };
		const body = { slug: "once", data: { title: "Once", draft: true }, body: "" };
		const a = app(); // the replay cache lives in the app instance
		const post = () => a.request("/api/content/posts", { method: "POST", headers, body: JSON.stringify(body) });
		expect((await post()).status).toBe(201);
		const again = await post();
		expect(again.status).toBe(201);
		expect(again.headers.get("idempotent-replayed")).toBe("true");
	});
});

describe("OpenAPI contract", () => {
	it("documents every registered /api route and every error code", async () => {
		user = ALL;
		const a = app();
		const spec = await (await a.request("/api/openapi.json")).json();
		expect(spec.openapi).toBe("3.1.0");
		for (const r of a.routes.filter((x) => x.method !== "ALL" && x.path.startsWith("/api/"))) {
			const path = r.path.replace(/:(\w+)(\{[^}]*\})?/g, "{$1}");
			expect(spec.paths[path]?.[r.method.toLowerCase()], `${r.method} ${r.path}`).toBeDefined();
		}
		const codes: string[] =
			spec.components.responses.Error.content["application/json"].schema.properties.error.properties.code.enum;
		for (const code of ["CONFLICT", "RATE_LIMITED", "VALIDATION_ERROR", "FORBIDDEN"]) expect(codes).toContain(code);
	});
	it("needs a signed-in user", async () => {
		user = null;
		expect((await app().request("/api/openapi.json")).status).toBe(401);
	});
});

describe("error catalog", () => {
	it("lists every code the source can emit, with the status it is emitted with", async () => {
		const { ERROR_CODES } = await import("../../src/api/openapi.ts");
		const { readdir, readFile } = await import("node:fs/promises");
		const dir = join(import.meta.dirname, "../../src");
		const files = (await readdir(dir, { recursive: true })).filter((f) => f.endsWith(".ts"));
		const used = new Map<string, number>();
		for (const f of files) {
			const text = await readFile(join(dir, f), "utf8");
			for (const m of text.matchAll(/(?:ApiError\(|fail\(c, )(\d{3}), "([A-Z_]+)"/g)) used.set(m[2]!, Number(m[1]));
		}
		expect(used.size).toBeGreaterThan(15);
		for (const [code, status] of used) expect(ERROR_CODES[code as keyof typeof ERROR_CODES], code).toBe(status);
	});
});

const githubFetch: typeof fetch = async () => Response.json({ access_token: "gho_t" });
const themesApp = () =>
	createApp({
		service: svc,
		media: new MediaService(root, git),
		json,
		comments,
		redirects,
		userCount: () => 1,
		getUser: async () => user,
		themes: new GithubThemes({ base: root, run: () => new Promise(() => {}) }),
		github: new GithubAccounts(
			new DatabaseSync(":memory:"),
			"s".repeat(40),
			{ clientId: "cid", clientSecret: "cs", redirectUri: "http://localhost/api/themes/github/callback" },
			githubFetch,
		),
	});
const post = (a: ReturnType<typeof themesApp>, path: string, body: unknown) =>
	a.request(path, { method: "POST", headers: H, body: JSON.stringify(body) });

describe("themes API", () => {
	it("is for admins only: installing runs the repository's code on the server", async () => {
		user = { id: "e", permissions: ["content:read", "themes:manage"] };
		expect((await themesApp().request("/api/themes")).status).toBe(403);
		expect((await post(themesApp(), "/api/themes/github/install", { repo: "me/a" })).status).toBe(403);
	});

	it("needs a linked GitHub account, then starts one install at a time", async () => {
		user = { id: "a", permissions: ["site:settings"] };
		const on = themesApp();
		expect(await (await on.request("/api/themes")).json()).toMatchObject({
			data: { active: null, installed: [], job: null, github: { configured: true, connected: false } },
		});
		expect((await on.request("/api/themes/github/repos")).status).toBe(409);
		const go = await on.request("/api/themes/github/connect");
		expect(go.status).toBe(302);
		const state = new URL(go.headers.get("location")!).searchParams.get("state");
		const bad = await on.request("/api/themes/github/callback?code=c&state=forged");
		expect(bad.headers.get("location")).toMatch(/^\/admin\/themes\?github_error=/);
		const back = await on.request(`/api/themes/github/callback?code=c&state=${state}`);
		expect(back.headers.get("location")).toBe("/admin/themes");
		expect(await (await on.request("/api/themes")).json()).toMatchObject({ data: { github: { connected: true } } });
		const started = await post(on, "/api/themes/github/install", { repo: "me/a" });
		expect(started.status).toBe(202);
		expect(await started.json()).toMatchObject({ data: { repo: "me/a", status: "running" } });
		expect((await post(on, "/api/themes/github/install", { repo: "me/b" })).status).toBe(409);
		expect((await post(on, "/api/themes/activate", { repo: "me/zzz" })).status).toBe(404);
	});
});
