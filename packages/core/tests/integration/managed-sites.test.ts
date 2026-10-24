import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { permissionsFor } from "@wuppycms/auth";
import { NoopGit } from "@wuppycms/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type User } from "../../src/api/app.ts";
import { AuditLog } from "../../src/audit/index.ts";
import { CommentService } from "../../src/comments/index.ts";
import { collectionSchema } from "../../src/content-types/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { MediaService } from "../../src/media/index.ts";
import { RedirectService } from "../../src/redirects/service.ts";
import { ApiTokenService, bearerUser } from "../../src/security/api-tokens.ts";
import { proxyPath } from "../../src/sites/proxy.ts";
import { SiteStore } from "../../src/sites/store.ts";

const H = { "X-Wuppy-Request": "1", "Content-Type": "application/json" };
const SECRET = "s".repeat(40);
const YEAR = () => new Date(Date.now() + 30 * 86_400_000).toISOString();

function userTable(db: DatabaseSync) {
	db.exec("CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT, name TEXT, role TEXT, banned INTEGER)");
	const add = (id: string, role: string, banned = 0) =>
		db.prepare("INSERT INTO user VALUES (?, ?, ?, ?, ?)").run(id, `${id}@x.test`, id, role, banned);
	return add;
}

function makeApp(root: string, db: DatabaseSync, extra: Partial<Parameters<typeof createApp>[0]>) {
	const git = new NoopGit();
	const json = new JsonStore(root, git);
	return createApp({
		service: new ContentService(root, [collectionSchema.parse({ name: "posts", dir: "content/posts" })], git),
		media: new MediaService(root, git),
		json,
		comments: new CommentService(db),
		redirects: new RedirectService(json, db, []),
		userCount: () => 1,
		getUser: async () => null,
		...extra,
	});
}

let roots: string[] = [];
let remoteDb: DatabaseSync;
let remoteTokens: ApiTokenService;
let addRemoteUser: ReturnType<typeof userTable>;
let remote: ReturnType<typeof createApp>;
let hubDb: DatabaseSync;
let addHubUser: ReturnType<typeof userTable>;
let sites: SiteStore;
let hub: ReturnType<typeof createApp>;
let me: User;
let seen: { url: string; headers: Headers }[];

const hubUser = (id: string, role: string): User => ({
	id,
	email: `${id}@x.test`,
	permissions: permissionsFor(role),
});

beforeEach(async () => {
	const [r1, r2] = [await mkdtemp(join(tmpdir(), "wuppy-remote-")), await mkdtemp(join(tmpdir(), "wuppy-hub-"))];
	roots = [r1, r2];
	remoteDb = new DatabaseSync(":memory:");
	addRemoteUser = userTable(remoteDb);
	addRemoteUser("owner", "admin");
	remoteTokens = new ApiTokenService(remoteDb);
	remote = makeApp(r1, remoteDb, {
		tokens: remoteTokens,
		getUser: async (req) => bearerUser(remoteTokens, remoteDb, req),
	});
	hubDb = new DatabaseSync(":memory:");
	addHubUser = userTable(hubDb);
	sites = new SiteStore(hubDb, SECRET);
	seen = [];
	hub = makeApp(r2, hubDb, {
		sites,
		audit: new AuditLog(hubDb),
		siteNetwork: {
			allowPrivate: true,
			fetch: async (url, init) => {
				seen.push({ url, headers: new Headers(init.headers) });
				return remote.request(url, init);
			},
		},
		getUser: async () => me,
	});
	addHubUser("boss", "admin");
	me = hubUser("boss", "admin");
});
afterEach(() => Promise.all(roots.map((r) => rm(r, { recursive: true, force: true }))));

const hubToken = (permissions = permissionsFor("editor")) =>
	remoteTokens.create({ name: "hub", userId: "owner", permissions, expiresAt: YEAR(), kind: "hub" }).token;
const connect = async (token = hubToken(), url = "https://remote.test") => {
	const res = await hub.request("/api/sites", {
		method: "POST",
		headers: H,
		body: JSON.stringify({ name: "Remote", url, token }),
	});
	return { res, body: (await res.json()) as { data: { id: string; status: string }; error?: { code: string } } };
};
const proxy = (id: string, path: string, init: RequestInit = {}) =>
	hub.request(`/api/sites/${id}/proxy${path}`, { ...init, headers: { ...H, ...init.headers } });

const req = (token: string, headers: Record<string, string> = {}) =>
	new Request("http://x/api", { headers: { authorization: `Bearer ${token}`, ...headers } });

describe("bearer tokens on the managed site", () => {
	it("never exceed the owner's current role, and die with a banned owner", () => {
		const { token } = remoteTokens.create({
			name: "ci",
			userId: "owner",
			permissions: ["users:manage", "content:read"],
		});
		expect(bearerUser(remoteTokens, remoteDb, req(token))?.permissions).toEqual(["users:manage", "content:read"]);
		remoteDb.prepare("UPDATE user SET role = 'viewer' WHERE id = 'owner'").run();
		expect(bearerUser(remoteTokens, remoteDb, req(token))?.permissions).toEqual(["content:read"]);
		remoteDb.prepare("UPDATE user SET banned = 1 WHERE id = 'owner'").run();
		expect(bearerUser(remoteTokens, remoteDb, req(token))).toBeNull();
	});

	it("hub tokens act with the claimed role only; user tokens ignore the claim", () => {
		const token = hubToken();
		expect(bearerUser(remoteTokens, remoteDb, req(token))?.permissions).toEqual([]);
		expect(bearerUser(remoteTokens, remoteDb, req(token, { "x-wuppy-acting-role": "viewer" }))?.permissions).toEqual([
			"content:read",
		]);
		expect(bearerUser(remoteTokens, remoteDb, req(token, { "x-wuppy-acting-role": "client" }))?.permissions).toEqual(
			[],
		);
		const user = remoteTokens.create({ name: "u", userId: "owner", permissions: ["content:write"] }).token;
		expect(bearerUser(remoteTokens, remoteDb, req(user, { "x-wuppy-acting-role": "viewer" }))?.permissions).toEqual([
			"content:write",
		]);
	});

	it("a hub token needs an expiry within a year", async () => {
		me = { id: "owner", permissions: permissionsFor("admin") };
		remote = makeApp(roots[0]!, remoteDb, { tokens: remoteTokens, getUser: async () => me });
		const create = (expiresAt?: string) =>
			remote.request("/api/tokens", {
				method: "POST",
				headers: H,
				body: JSON.stringify({ name: "hub", kind: "hub", ...(expiresAt ? { expiresAt } : {}) }),
			});
		expect((await create()).status).toBe(422);
		expect((await create("2999-01-01T00:00:00.000Z")).status).toBe(422);
		expect((await create(YEAR())).status).toBe(201);
	});
});

describe("managed sites on the hub", () => {
	it("connects with a hub token and never returns or logs the token", async () => {
		const token = hubToken();
		const { res, body } = await connect(token);
		expect(res.status).toBe(201);
		expect(body.data.status).toBe("connected");
		const list = await (await hub.request("/api/sites")).text();
		expect(list).not.toContain(token);
		expect(JSON.stringify(body)).not.toContain(token);
		expect(JSON.stringify(hubDb.prepare("SELECT * FROM wuppy_sites").all())).not.toContain(token);
	});

	it("refuses user tokens, bad addresses and private networks", async () => {
		const user = remoteTokens.create({ name: "u", userId: "owner", permissions: ["content:read"] }).token;
		expect((await connect(user)).body.error?.code).toBe("NOT_A_HUB_TOKEN");
		expect((await connect(hubToken(), "https://remote.test/admin")).body.error?.code).toBe("INVALID_URL");
		expect((await connect(hubToken(), "https://u:p@remote.test")).body.error?.code).toBe("INVALID_URL");
		const strict = makeApp(roots[1]!, hubDb, { sites, getUser: async () => me });
		const add = (url: string) =>
			strict.request("/api/sites", {
				method: "POST",
				headers: H,
				body: JSON.stringify({ name: "x", url, token: hubToken() }),
			});
		expect((await (await add("http://example.com")).json()).error.code).toBe("INVALID_URL");
		for (const url of ["https://127.0.0.1", "https://169.254.169.254", "https://[::1]"])
			expect((await (await add(url)).json()).error.code, url).toBe("UNSAFE_URL");
	});

	it("proxies to the remote with the hub token, not the browser's credentials", async () => {
		const { body } = await connect();
		const res = await proxy(body.data.id, "/api/content/posts", { headers: { cookie: "session=secret" } });
		expect(res.status).toBe(200);
		const last = seen.at(-1)!;
		expect(last.url).toBe("https://remote.test/api/content/posts");
		expect(last.headers.get("cookie")).toBeNull();
		expect(last.headers.get("authorization")).toMatch(/^Bearer wuppy_/);
		expect(last.headers.get("x-wuppy-acting-role")).toBe("admin");
		expect(last.headers.get("x-wuppy-acting-user")).toBe("boss@x.test");
	});

	it("refuses paths outside the content API", async () => {
		const { body } = await connect();
		for (const path of [
			"/api/auth/get-session",
			"/api/tokens",
			"/api/hub/whoami",
			"/api/users/x/reset-two-factor",
			"/api/sites",
			"/api/content/%2e%2e/x",
			"/api/content/..%2fx",
			"/etc/passwd",
		])
			expect((await proxy(body.data.id, path)).status, path).toBe(404);
		expect((await proxy(body.data.id, "/uploads/a.png", { method: "POST", body: "{}" })).status).toBe(404);
	});

	it("a client sees only the sites they belong to, with that site's role", async () => {
		const { body } = await connect();
		addHubUser("ana", "client");
		const put = await hub.request(`/api/sites/${body.data.id}/members/ana`, {
			method: "PUT",
			headers: H,
			body: JSON.stringify({ role: "viewer" }),
		});
		expect(put.status).toBe(200);
		const other = (await connect(hubToken(), "https://other.test")).body.data.id;

		me = hubUser("ana", "client");
		const list = (await (await hub.request("/api/sites")).json()) as { data: { id: string; role: string }[] };
		expect(list.data.map((s) => [s.id, s.role])).toEqual([[body.data.id, "viewer"]]);
		expect((await proxy(other, "/api/content/posts")).status).toBe(404);
		expect((await proxy(body.data.id, "/api/content/posts")).status).toBe(200);
		const write = await proxy(body.data.id, "/api/content/posts", {
			method: "POST",
			body: JSON.stringify({ slug: "x", data: { title: "x" }, body: "" }),
		});
		expect(write.status).toBe(403);
		const mine = (await (await hub.request(`/api/sites/${body.data.id}/me`)).json()) as {
			data: { permissions: string[] };
		};
		expect(mine.data.permissions).toEqual(["content:read"]);
		expect((await hub.request("/api/sites", { method: "POST", headers: H, body: "{}" })).status).toBe(403);

		me = hubUser("boss", "admin");
		await hub.request(`/api/sites/${body.data.id}/members/ana`, { method: "DELETE", headers: H });
		me = hubUser("ana", "client");
		expect((await proxy(body.data.id, "/api/content/posts")).status).toBe(404);

		sites.setMember(body.data.id, "ana", "viewer");
		hubDb.prepare("DELETE FROM user WHERE id = ?").run("ana");
		expect(sites.membershipsOf("ana")).toEqual([]);
	});

	it("only hub admins can be site admins", async () => {
		const { body } = await connect();
		addHubUser("ed", "editor");
		const res = await hub.request(`/api/sites/${body.data.id}/members/ed`, {
			method: "PUT",
			headers: H,
			body: JSON.stringify({ role: "admin" }),
		});
		expect(res.status).toBe(422);
	});

	it("writes reach the remote and are audited on the hub without bodies", async () => {
		const { body } = await connect();
		const res = await proxy(body.data.id, "/api/content/posts", {
			method: "POST",
			body: JSON.stringify({ slug: "hello", data: { title: "Hello" }, body: "secret body" }),
		});
		expect(res.status).toBe(201);
		const entry = await proxy(body.data.id, "/api/content/posts/hello");
		expect(((await entry.json()) as { data: { data: { title: string } } }).data.data.title).toBe("Hello");
		const log = new AuditLog(hubDb).list();
		expect(log.find((e) => e.type === "site.proxy.write")?.detail).toBe("Remote: POST /api/content/posts → 201");
		expect(JSON.stringify(log)).not.toContain("secret body");
	});

	it("a revoked token marks the site and answers SITE_AUTH_FAILED", async () => {
		const { body } = await connect();
		for (const t of remoteTokens.list()) remoteTokens.revoke(t.id);
		const res = await proxy(body.data.id, "/api/content/posts");
		expect(res.status).toBe(502);
		expect(((await res.json()) as { error: { code: string } }).error.code).toBe("SITE_AUTH_FAILED");
		expect(sites.get(body.data.id)?.status).toBe("connection_error");
		const rotated = await hub.request(`/api/sites/${body.data.id}/token`, {
			method: "PUT",
			headers: H,
			body: JSON.stringify({ token: hubToken() }),
		});
		expect(rotated.status).toBe(200);
		expect((await proxy(body.data.id, "/api/content/posts")).status).toBe(200);
	});

	it("a changed WUPPY_SECRET asks for a reconnect instead of crashing", async () => {
		const { body } = await connect();
		const moved = makeApp(roots[1]!, hubDb, { sites: new SiteStore(hubDb, "t".repeat(40)), getUser: async () => me });
		const res = await moved.request(`/api/sites/${body.data.id}/proxy/api/content/posts`, { headers: H });
		expect(res.status).toBe(409);
		expect(((await res.json()) as { error: { code: string } }).error.code).toBe("RECONNECT_REQUIRED");
	});

	it("an invitation can carry site access, granted when accepted", async () => {
		const { body } = await connect();
		sites.addInvite(body.data.id, "New@X.test", "author");
		addHubUser("new", "client");
		sites.claimInvites("new@x.test", "new");
		expect(sites.roleOf(body.data.id, "new")).toBe("author");
	});
});

describe("proxyPath", () => {
	it("allows the content API and uploads (read-only)", () => {
		expect(proxyPath("/api/content/posts", "GET")).toBe("/api/content/posts");
		expect(proxyPath("/api/media", "POST")).toBe("/api/media");
		expect(proxyPath("/uploads/a.png", "GET")).toBe("/uploads/a.png");
		expect(proxyPath("/uploads/a.png", "DELETE")).toBeNull();
		expect(proxyPath("/api", "GET")).toBeNull();
		expect(proxyPath("/API/AUTH/x", "GET")).toBeNull();
		expect(proxyPath("/api//auth", "GET")).toBeNull();
		expect(proxyPath("/api/x\\..", "GET")).toBeNull();
		expect(proxyPath("/api/x%00", "GET")).toBeNull();
		expect(proxyPath("/api/tokensx", "GET")).toBe("/api/tokensx");
	});
});
