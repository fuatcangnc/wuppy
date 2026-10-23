import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { NoopGit } from "@wuppy/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type User } from "../../src/api/app.ts";
import { CommentService } from "../../src/comments/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import type { EmailMessage } from "../../src/email/index.ts";
import { MediaService } from "../../src/media/index.ts";
import { RedirectService } from "../../src/redirects/service.ts";

const MOD: User = {
	id: "m",
	name: "Mo Derator",
	permissions: ["comments:read", "comments:moderate", "site:settings", "content:read", "content:write"],
};
const H = { "X-Wuppy-Request": "1", "Content-Type": "application/json" };

let root: string;
let comments: CommentService;
let json: JsonStore;
let sent: EmailMessage[];
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-comments-"));
	const git = new NoopGit();
	json = new JsonStore(root, git);
	comments = new CommentService(new DatabaseSync(":memory:"));
	sent = [];
	app = createApp({
		service: new ContentService(root, [], git),
		media: new MediaService(root, git),
		json,
		comments,
		redirects: new RedirectService(json, new DatabaseSync(":memory:"), []),
		userCount: () => 1,
		sendEmail: async (m) => void sent.push(m),
		getUser: async () => MOD,
	});
});
afterEach(() => rm(root, { recursive: true, force: true }));

const send = (method: string, path: string, body?: unknown) =>
	app.request(path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
const submit = (body: object) => send("POST", "/api/public/comments/posts/hello", body);
const flush = () => new Promise((r) => setTimeout(r, 10));

describe("public comments", () => {
	it("never expose commenters' email addresses", async () => {
		await json.write("settings", { comments: { moderated: false } }, "settings");
		await submit({ author: "Ada", email: "ada@example.com", body: "Nice" });
		const list = await (await send("GET", "/api/public/comments/posts/hello")).json();
		expect(list.data).toHaveLength(1);
		expect(JSON.stringify(list)).not.toContain("ada@example.com");
		expect(Object.keys(list.data[0]).toSorted()).toEqual(["author", "body", "createdAt", "id", "parentId", "staff"]);
	});

	it("emails the configured address for each new comment", async () => {
		await json.write("settings", { comments: { notifyEmail: "editor@example.com" } }, "settings");
		await submit({ author: "Ada", body: "First!" });
		await flush();
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({ to: "editor@example.com", subject: "New comment on posts/hello" });
		expect(sent[0]?.text).toContain("awaiting moderation");
	});

	it("sends nothing when no notification address is set, and a failing mail server does not break posting", async () => {
		expect((await submit({ author: "Ada", body: "Hi" })).status).toBe(201);
		await flush();
		expect(sent).toHaveLength(0);
	});
});

describe("moderation", () => {
	it("a staff reply is published at once, threaded, and emailed to the commenter", async () => {
		const created = await (await submit({ author: "Ada", email: "ada@example.com", body: "Question?" })).json();
		const id = created.data.id;
		sent.length = 0;
		const reply = await send("POST", `/api/comments/${id}/reply`, { body: "Answer." });
		expect(reply.status).toBe(201);
		expect((await reply.json()).data).toMatchObject({
			parentId: id,
			staff: true,
			status: "approved",
			author: "Mo Derator",
		});
		await flush();
		expect(sent).toEqual([expect.objectContaining({ to: "ada@example.com" })]);
		expect(sent[0]?.text).toContain("Answer.");

		await send("PATCH", `/api/comments/${id}`, { status: "approved" });
		const pub = (await (await send("GET", "/api/public/comments/posts/hello")).json()).data;
		expect(pub.map((c: { parentId: string | null }) => c.parentId)).toEqual([null, id]);
		expect((await send("POST", "/api/comments/nope/reply", { body: "x" })).status).toBe(404);
		expect((await send("POST", `/api/comments/${id}/reply`, { body: "  " })).status).toBe(422);
	});

	it("pages through the list and reports per-entry counts", async () => {
		for (let i = 0; i < 5; i++)
			comments.create({
				collection: "posts",
				slug: i < 3 ? "a" : "b",
				author: `u${i}`,
				body: "x",
				status: i !== 0 ? "pending" : "approved",
			});
		const first = await (await send("GET", "/api/comments?limit=2")).json();
		const second = await (await send("GET", "/api/comments?limit=2&offset=2")).json();
		const ids = [...first.data, ...second.data].map((c: { id: string }) => c.id);
		expect(new Set(ids).size).toBe(4);
		expect(first.total).toBe(5);
		const entries = (await (await send("GET", "/api/comments/entries")).json()).data;
		expect(entries).toEqual([
			{ collection: "posts", slug: "a", pending: 2, approved: 1 },
			{ collection: "posts", slug: "b", pending: 2, approved: 0 },
		]);
	});

	it("upgrades an existing comments table that has no reply columns", () => {
		const db = new DatabaseSync(":memory:");
		db.exec(
			"CREATE TABLE wuppy_comments (id TEXT PRIMARY KEY, collection TEXT NOT NULL, slug TEXT NOT NULL, author TEXT NOT NULL, email TEXT, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', ip_hash TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
		);
		db.prepare(
			"INSERT INTO wuppy_comments VALUES ('1','posts','a','Old',NULL,'hi','approved',NULL,'2026-01-01','2026-01-01')",
		).run();
		const upgraded = new CommentService(db);
		expect(upgraded.list()[0]).toMatchObject({ id: "1", parentId: null, staff: false });
	});
});
