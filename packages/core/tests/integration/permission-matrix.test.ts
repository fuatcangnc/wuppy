import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PERMISSIONS, permissionsFor, ROLES } from "@wuppycms/auth";
import { NoopGit } from "@wuppycms/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type User } from "../../src/api/app.ts";
import { CommentService } from "../../src/comments/index.ts";
import { collectionSchema } from "../../src/content-types/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { MediaService } from "../../src/media/index.ts";
import { RedirectService } from "../../src/redirects/service.ts";

/** Routes any signed-in user may call on purpose (no permission needed). */
const OPEN = new Set([
	"POST /api/invitations/accept",
	"GET /api/openapi.json",
	// Managed sites: gated by site membership (or a hub token), not by a permission on this site.
	"GET /api/hub/whoami",
	"GET /api/sites",
	"POST /api/sites/:id/check",
	"GET /api/sites/:id/me",
	// The assistant and MCP: every tool call is its own API request, checked like any other.
	"GET /api/ai/config",
	"POST /api/ai/chat",
	"GET /api/mcp",
	"POST /api/mcp",
	"GET /api/ai/chats",
	"GET /api/ai/chats/:id",
	"DELETE /api/ai/chats/:id",
	"GET /api/v1/models",
	"POST /api/v1/chat/completions",
	"GET /api/sites/:id/report",
]);

let root: string;
let user: User;
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-matrix-"));
	const git = new NoopGit();
	const json = new JsonStore(root, git);
	const service = new ContentService(root, [collectionSchema.parse({ name: "posts", dir: "content/posts" })], git);
	app = createApp({
		service,
		media: new MediaService(root, git),
		json,
		comments: new CommentService(new DatabaseSync(":memory:")),
		redirects: new RedirectService(json, new DatabaseSync(":memory:"), []),
		userCount: () => 1,
		getUser: async () => user,
	});
});
afterEach(() => rm(root, { recursive: true, force: true }));

const H = { "X-Wuppy-Request": "1", "Content-Type": "application/json" };
const call = (method: string, path: string) =>
	app.request(path.replace(/:\w+(\{[^}]*\})?/g, "x"), {
		method,
		headers: H,
		body: method === "GET" ? undefined : "{}",
	});
const routes = () =>
	app.routes.filter((r) => r.path.startsWith("/api/") && !r.path.startsWith("/api/public/") && r.method !== "ALL");
const key = (r: { method: string; path: string }) => `${r.method} ${r.path}`;
let n = 0; // a fresh user per probe keeps the write rate limit out of the way
const isForbidden = async (method: string, path: string) => (await call(method, path)).status === 403;

describe("permission matrix", () => {
	it("every protected route is guarded by a permission, and a user with none is refused everywhere", async () => {
		const open = [];
		for (const r of routes()) {
			user = { id: `nobody-${n++}`, permissions: [] };
			if (!(await isForbidden(r.method, r.path))) open.push(key(r));
		}
		expect(new Set(open.filter((k) => !OPEN.has(k)))).toEqual(new Set());
	});

	it("each role can reach exactly the routes whose required permissions it holds", async () => {
		const required = new Map<string, Permission[]>();
		for (const r of routes()) {
			if (OPEN.has(key(r))) continue;
			const needed: Permission[] = [];
			for (const p of PERMISSIONS) {
				user = { id: `probe-${n++}`, permissions: PERMISSIONS.filter((x) => x !== p) };
				if (await isForbidden(r.method, r.path)) needed.push(p);
			}
			expect(needed.length, `${key(r)} needs one permission`).toBe(1);
			required.set(key(r), needed);
		}
		for (const role of ROLES) {
			const held = new Set(permissionsFor(role));
			for (const r of routes()) {
				user = { id: `${role}-${n++}`, permissions: [...held] };
				const needed = required.get(key(r));
				if (!needed) continue;
				const allowed = needed.every((p) => held.has(p));
				expect(await isForbidden(r.method, r.path), `${role} ${key(r)}`).toBe(!allowed);
			}
		}
		// Spot checks that pin the policy itself, not just its consistency.
		const need = (m: string, p: string) => required.get(`${m} ${p}`)?.[0];
		expect(need("DELETE", "/api/content/:collection/:slug{.+}")).toBe("content:delete");
		expect(need("POST", "/api/commits/:sha/revert")).toBe("git:revert");
		expect(need("GET", "/api/audit")).toBe("audit:read");
		expect(need("GET", "/api/tokens")).toBe("users:manage");
		expect(permissionsFor("viewer")).toEqual(["content:read"]);
		expect(permissionsFor("author")).not.toContain("content:publish");
		expect(permissionsFor("editor")).not.toContain("users:manage");
	});
});

type Permission = (typeof PERMISSIONS)[number];
