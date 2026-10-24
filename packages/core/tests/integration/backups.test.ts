import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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
import { BackupService } from "../../src/transfer/backups.ts";
import { exportContent, importContent } from "../../src/transfer/index.ts";

const ADMIN: User = {
	id: "admin",
	permissions: ["content:read", "content:write", "site:transfer", "users:manage", "site:settings", "audit:read"],
};
const H = { "X-Wuppy-Request": "1", "Content-Type": "application/json" };
const collection = collectionSchema.parse({ name: "posts", dir: "content/posts" });

let root: string;
let service: ContentService;
let backups: BackupService;
let audit: AuditLog;
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-backup-"));
	const git = new NoopGit();
	const json = new JsonStore(root, git);
	service = new ContentService(root, [collection], git);
	backups = new BackupService(root, service, 2);
	audit = new AuditLog(new DatabaseSync(":memory:"));
	app = createApp({
		service,
		audit,
		backups,
		media: new MediaService(root, git),
		json,
		comments: new CommentService(new DatabaseSync(":memory:")),
		redirects: new RedirectService(json, new DatabaseSync(":memory:"), []),
		userCount: () => 1,
		inviteUser: async ({ email, role }) => ({ ok: true, email, role, expiresAt: "2099-01-01" }),
		getUser: async () => ADMIN,
	});
});
afterEach(() => rm(root, { recursive: true, force: true }));

const send = (method: string, path: string, body?: unknown) =>
	app.request(path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });

describe("backups", () => {
	it("creates snapshots, keeps only the newest N, and serves them for download", async () => {
		await service.put("posts", "a", { data: { title: "A" }, body: "x" });
		for (const minute of [1, 2, 3]) await backups.create(new Date(`2026-01-01T00:0${minute}:00Z`));
		const list = await (await send("GET", "/api/backups")).json();
		expect(list.data.map((b: { name: string }) => b.name)).toEqual([
			"backup-20260101T000300Z.json",
			"backup-20260101T000200Z.json",
		]);
		const file = await send("GET", "/api/backups/backup-20260101T000300Z.json");
		expect(file.headers.get("content-disposition")).toContain("attachment");
		expect((await file.json()).collections.posts.a.body).toBe("x");
		expect((await send("GET", "/api/backups/..%2Fsecret")).status).toBe(404);
		expect((await send("GET", "/api/backups/backup-20200101T000000Z.json")).status).toBe(404);
	});

	it("two backups in the same second do not overwrite each other", async () => {
		const at = new Date("2026-01-01T00:00:00Z");
		const first = await backups.create(at);
		const second = await backups.create(at);
		expect(first.name).not.toBe(second.name);
		expect(await readdir(join(root, ".wuppy/backups"))).toHaveLength(2);
	});

	it("restore drill: a backup imports into an empty site and reproduces the content", async () => {
		await service.put("posts", "a", { data: { title: "A" }, body: "one" });
		await service.put("posts", "nested/b", { data: { title: "B", draft: true }, body: "two" });
		const info = await backups.create();
		const text = (await backups.read(info.name))!;

		const other = await mkdtemp(join(tmpdir(), "wuppy-restore-"));
		try {
			const fresh = new ContentService(other, [collection], new NoopGit());
			const result = await importContent(fresh, JSON.parse(text));
			expect(result).toEqual({ imported: 2, errors: [] });
			expect(await exportContent(fresh)).toEqual(await exportContent(service));
		} finally {
			await rm(other, { recursive: true, force: true });
		}
	});

	it("POST /api/backups writes a file and an audit entry", async () => {
		expect((await send("POST", "/api/backups")).status).toBe(201);
		expect(audit.list().map((e) => e.type)).toContain("backup.create");
	});
});

describe("settings hardening", () => {
	it("masks webhook secrets on read and keeps the stored secret when the mask is sent back", async () => {
		const hooks = [{ url: "https://example.com/hook", secret: "super-secret-1", events: ["content.updated"] }];
		const saved = await (await send("PUT", "/api/data/webhooks", { data: hooks })).json();
		expect(saved.data[0].secret).toBe("********");
		const read = await (await send("GET", "/api/data/webhooks")).json();
		expect(JSON.stringify(read)).not.toContain("super-secret-1");
		await send("PUT", "/api/data/webhooks", { data: [{ ...read.data[0], events: ["media.uploaded"] }] });
		const json = new JsonStore(root, new NoopGit());
		expect(await json.read("webhooks", [])).toEqual([
			{ url: "https://example.com/hook", secret: "super-secret-1", events: ["media.uploaded"] },
		]);
	});

	it("limits invitations to allowed email domains and audits token events", async () => {
		await send("PUT", "/api/data/settings", { data: { security: { allowedDomains: ["example.com"] } } });
		const bad = await send("POST", "/api/invitations", { email: "x@other.org", role: "editor" });
		expect(bad.status).toBe(422);
		expect((await bad.json()).error.code).toBe("DOMAIN_NOT_ALLOWED");
		expect((await send("POST", "/api/invitations", { email: "x@EXAMPLE.com", role: "editor" })).status).toBe(201);
		expect(audit.list().map((e) => e.type)).toContain("settings.update");
	});
});

describe("test email", () => {
	it("sends through the configured sender and reports failures without leaking secrets", async () => {
		const sent: string[] = [];
		const make = (fail: boolean) =>
			createApp({
				service,
				audit,
				media: new MediaService(root, new NoopGit()),
				json: new JsonStore(root, new NoopGit()),
				comments: new CommentService(new DatabaseSync(":memory:")),
				redirects: new RedirectService(new JsonStore(root, new NoopGit()), new DatabaseSync(":memory:"), []),
				userCount: () => 1,
				sendEmail: async (m) => {
					if (fail) throw new Error("auth failed, Bearer abc.def-123 rejected");
					sent.push(m.to);
				},
				getUser: async () => ADMIN,
			});
		const post = (a: ReturnType<typeof make>, body: unknown) =>
			a.request("/api/email/test", { method: "POST", headers: H, body: JSON.stringify(body) });
		expect((await post(make(false), { to: "me@example.com" })).status).toBe(200);
		expect(sent).toEqual(["me@example.com"]);
		expect((await post(make(false), { to: "nope" })).status).toBe(422);
		const failed = await post(make(true), { to: "me@example.com" });
		expect(failed.status).toBe(502);
		const text = JSON.stringify(await failed.json());
		expect(text).toContain("EMAIL_FAILED");
		expect(text).not.toContain("abc.def-123");
		expect(audit.list().map((e) => e.type)).toContain("email.test");
	});
});
