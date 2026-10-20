import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { NoopGit } from "@wuppy/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.ts";
import { CommentService } from "../../src/comments/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { MediaService } from "../../src/media/index.ts";
import { RedirectService } from "../../src/redirects/service.ts";
import { ApiTokenService } from "../../src/security/api-tokens.ts";

const H = { "X-Wuppy-Request": "1", "Content-Type": "application/json" };
let root: string;
let db: DatabaseSync;
let tokens: ApiTokenService;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-tok-"));
	db = new DatabaseSync(":memory:");
	tokens = new ApiTokenService(db);
	const json = new JsonStore(root, new NoopGit());
	app = createApp({
		service: new ContentService(root, [], new NoopGit()),
		media: new MediaService(root, new NoopGit()),
		json,
		comments: new CommentService(db),
		redirects: new RedirectService(json, db, []),
		tokens,
		userCount: () => 1,
		getUser: async () => ({ id: "owner", permissions: ["users:manage", "content:read", "content:write"] }),
	});
});
afterEach(() => rm(root, { recursive: true, force: true }));

const create = (body: unknown) =>
	app.request("/api/tokens", { method: "POST", headers: H, body: JSON.stringify(body) });

describe("API tokens", () => {
	it("narrows to the chosen permissions and belongs to the creator", async () => {
		const res = await create({ name: "ci", permissions: ["content:read"] });
		expect(res.status).toBe(201);
		const { data } = (await res.json()) as {
			data: { token: string; record: { userId: string; permissions: string[] } };
		};
		expect(data.record).toMatchObject({ userId: "owner", permissions: ["content:read"] });
		expect(tokens.verify(data.token)?.permissions).toEqual(["content:read"]);
	});

	it("defaults to the creator's permissions and never exceeds them", async () => {
		const all = (await (await create({ name: "all" })).json()) as { data: { record: { permissions: string[] } } };
		expect(all.data.record.permissions).toEqual(["users:manage", "content:read", "content:write"]);
		const res = await create({ name: "too much", permissions: ["content:read", "backups:manage"] });
		expect(res.status).toBe(403);
	});

	it("ignores a userId in the body and rejects past or malformed expiry", async () => {
		const res = await create({ name: "x", userId: "someone-else", permissions: ["content:read"] });
		expect(((await res.json()) as { data: { record: { userId: string } } }).data.record.userId).toBe("owner");
		expect((await create({ name: "x", expiresAt: "2001-01-01T00:00:00.000Z" })).status).toBe(422);
		expect((await create({ name: "x", expiresAt: "tomorrow" })).status).toBe(422);
		expect((await create({ name: "x", expiresAt: "2999-01-01T00:00:00.000Z" })).status).toBe(201);
	});

	it("an expired token no longer verifies, and a revoked one is gone", async () => {
		const expired = tokens.create({
			name: "old",
			userId: "owner",
			permissions: [],
			expiresAt: "2001-01-01T00:00:00.000Z",
		});
		expect(tokens.verify(expired.token)).toBeNull();
		const live = tokens.create({ name: "live", userId: "owner", permissions: [] });
		expect((await app.request(`/api/tokens/${live.record.id}`, { method: "DELETE", headers: H })).status).toBe(200);
		expect(tokens.verify(live.token)).toBeNull();
	});
});

describe("roles matrix", () => {
	it("lists every permission and what each built-in role holds", async () => {
		const { data } = (await (await app.request("/api/roles")).json()) as {
			data: { permissions: string[]; roles: Array<{ name: string; permissions: string[] }> };
		};
		const byName = Object.fromEntries(data.roles.map((r) => [r.name, r.permissions]));
		expect(Object.keys(byName)).toEqual(["admin", "editor", "author", "viewer"]);
		expect(byName.admin).toEqual(data.permissions);
		expect(byName.viewer).toEqual(["content:read"]);
		expect(byName.author).not.toContain("content:publish");
	});
});
