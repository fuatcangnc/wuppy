import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { NoopGit } from "@wuppycms/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type User } from "../../src/api/app.ts";
import { CommentService } from "../../src/comments/index.ts";
import { collectionSchema } from "../../src/content-types/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { MediaService } from "../../src/media/index.ts";
import { capabilityHash } from "../../src/plugins/loader.ts";
import { PluginManager } from "../../src/plugins/manager.ts";
import { RedirectService } from "../../src/redirects/service.ts";

const EDITOR: User = {
	id: "e",
	permissions: ["content:read", "content:write", "content:publish", "content:delete", "media:write"],
};
const H = { "X-Wuppy-Request": "1", "Content-Type": "application/json" };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let root: string;
let manager: PluginManager;
let logs: string[];
let comments: CommentService;
let service: ContentService;
let app: ReturnType<typeof createApp>;

/** Installs approved plugins, then wires them like server.ts does. */
async function setup(plugins: Array<{ manifest: Record<string, unknown>; code: string }>) {
	const configured = [];
	for (const p of plugins) {
		const dir = `plugins/${String(p.manifest.id)}`;
		await mkdir(join(root, dir), { recursive: true });
		await writeFile(join(root, dir, "manifest.json"), JSON.stringify({ version: "1.0.0", ...p.manifest }));
		await writeFile(join(root, dir, "plugin.js"), p.code);
		configured.push({ dir, approve: capabilityHash({ version: "1.0.0", ...p.manifest }) });
	}
	const git = new NoopGit();
	const json = new JsonStore(root, git);
	await json.write("settings", { comments: { moderated: false } }, "settings");
	manager = new PluginManager(root, json, configured, {
		log: (m) => logs.push(m),
		readContent: async () => null,
		writeContent: async (_id, collection, slug, doc) => service.put(collection, slug, doc),
		fetch: async () => ({ status: 200, body: "" }),
	});
	await manager.load();
	service = new ContentService(root, [collectionSchema.parse({ name: "posts", dir: "content/posts" })], git, {
		beforeSave: async (e) => {
			const out = await manager.beforeContentSave(e);
			return { data: out.data, body: out.body };
		},
		beforeDelete: (e) => manager.beforeContentDelete(e),
	});
	comments = new CommentService(new DatabaseSync(":memory:"));
	app = createApp({
		service,
		media: new MediaService(root, git, undefined, json, (f) => manager.beforeMediaUpload(f)),
		json,
		comments,
		redirects: new RedirectService(json, new DatabaseSync(":memory:"), []),
		userCount: () => 1,
		pluginManager: manager,
		getUser: async () => EDITOR,
	});
}

const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
	app.request(path, {
		method,
		headers: { ...H, ...headers },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
let ip = 0;
const comment = (body: string) =>
	send(
		"POST",
		"/api/public/comments/posts/hello",
		{ author: "Ada", email: "ada@example.com", body },
		{ "x-wuppy-client-ip": `10.0.0.${++ip}` },
	);

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-filters-"));
	logs = [];
});
afterEach(async () => {
	manager?.dispose();
	await rm(root, { recursive: true, force: true });
});

const plugin = (id: string, hooks: string[], body: string, capabilities: object = {}) => ({
	manifest: { id, hooks, capabilities },
	code: `globalThis.__plugin = { ${body} };`,
});

describe("before-hooks on content", () => {
	it("a refusal stops the save and tells the editor why, as plain text", async () => {
		await setup([
			plugin(
				"needs-summary",
				["beforeContentSave"],
				`beforeContentSave: (e) => e.data.summary ? undefined : { reject: "Add a summary\\u0007 first" }`,
				{ content: { read: ["posts"] } },
			),
		]);
		const res = await send("POST", "/api/content/posts", { slug: "a", data: { title: "A" }, body: "Hi" });
		expect(res.status).toBe(422);
		expect((await res.json()).error).toMatchObject({
			code: "REJECTED_BY_PLUGIN",
			details: { plugin: "needs-summary", reason: "Add a summary first" },
		});
		expect(await service.get("posts", "a")).toBeNull();
		expect(
			(await send("POST", "/api/content/posts", { slug: "a", data: { title: "A", summary: "s" }, body: "Hi" })).status,
		).toBe(201);
	});

	it("a plugin that can write may change the entry, but not publish it, and its output passes the MDX rules", async () => {
		await setup([
			plugin(
				"stamp",
				["beforeContentSave"],
				`beforeContentSave: (e) => ({ data: { ...e.data, stamped: e.isNew, draft: false }, body: e.body + " (stamped)" })`,
				{ content: { write: ["posts"] } },
			),
		]);
		await service.create("posts", "a", { data: { title: "A", draft: true }, body: "Hi" });
		const saved = await service.get("posts", "a");
		expect(saved?.data).toMatchObject({ stamped: true, draft: true });
		expect(saved?.body.trim()).toBe("Hi (stamped)");
	});

	it("whatever a plugin writes is checked like an editor's text", async () => {
		await setup([
			plugin(
				"evil",
				["beforeContentSave"],
				`beforeContentSave: (e) => ({ data: e.data, body: "<script>alert(1)</script>" })`,
				{ content: { write: ["posts"] } },
			),
		]);
		await expect(service.create("posts", "a", { data: { title: "A" }, body: "Hi" })).rejects.toThrow(/script/);
	});

	it("fails closed: a read-only plugin that changes, a crash, a timeout or a bad refusal all refuse the save", async () => {
		for (const body of [
			`beforeContentSave: (e) => ({ data: e.data, body: "changed" })`,
			`beforeContentSave: () => { throw new Error("boom"); }`,
			`beforeContentSave: () => { while (true) {} }`,
			`beforeContentSave: () => ({ reject: "" })`,
		]) {
			manager?.dispose();
			await rm(join(root, "plugins"), { recursive: true, force: true });
			await setup([
				{
					manifest: {
						id: "ro",
						hooks: ["beforeContentSave"],
						capabilities: { content: { read: ["posts"] } },
						limits: { timeoutMs: 100 },
					},
					code: `globalThis.__plugin = { ${body} };`,
				},
			]);
			const res = await send("POST", "/api/content/posts", { slug: "a", data: { title: "A" }, body: "Hi" });
			expect(res.status, body).toBe(502);
			expect((await res.json()).error).toMatchObject({ code: "PLUGIN_ERROR", details: { plugin: "ro" } });
			expect(await service.get("posts", "a")).toBeNull();
		}
		expect(manager.statuses()[0]?.lastError?.message).toMatch(/beforeContentSave/);
	});

	it("only plugins that can see the collection are asked, disabled ones never", async () => {
		await setup([
			plugin("other", ["beforeContentSave"], `beforeContentSave: () => ({ reject: "no" })`, {
				content: { read: ["pages"] },
			}),
			plugin("off", ["beforeContentSave"], `beforeContentSave: () => ({ reject: "no" })`, {
				content: { read: ["posts"] },
			}),
		]);
		await manager.setEnabled("off", false);
		await service.create("posts", "a", { data: { title: "A" }, body: "Hi" });
		expect(await service.get("posts", "a")).not.toBeNull();
	});

	it("a before-hook cannot save content itself (that would run the hooks again)", async () => {
		await setup([
			plugin(
				"loop",
				["beforeContentSave"],
				`beforeContentSave: async (e, ctx) => { await ctx.content.put("posts", "x", { data: {}, body: "" }); }`,
				{ content: { write: ["posts"] } },
			),
		]);
		await expect(service.create("posts", "a", { data: { title: "A" }, body: "Hi" })).rejects.toThrow(/could not check/);
		expect(logs.join("\n")).toMatch(/not available in before-hooks/);
	});

	it("may refuse moving an entry to the trash, and checks a restored entry like a new one", async () => {
		await setup([
			plugin(
				"keep",
				["beforeContentDelete", "beforeContentSave"],
				`beforeContentDelete: (e) => e.slug === "keep" ? { reject: "This page must stay" } : undefined,
				 beforeContentSave: (e) => e.slug === "y" && (globalThis.saves = (globalThis.saves || 0) + 1) > 1
					? { reject: "No second life" } : undefined`,
				{ content: { read: ["posts"] } },
			),
		]);
		await service.create("posts", "keep", { data: { title: "K" }, body: "" });
		const res = await send("DELETE", "/api/content/posts/keep");
		expect(res.status).toBe(422);
		expect(await service.get("posts", "keep")).not.toBeNull();

		await service.create("posts", "y", { data: { title: "Y" }, body: "" });
		await service.trash("posts", "y");
		await expect(service.restore("posts", "y")).rejects.toThrow(/No second life/);
	});
});

describe("before-hooks on media and comments", () => {
	it("may refuse an upload after Wuppy's own checks", async () => {
		await setup([
			plugin(
				"no-png",
				["beforeMediaUpload"],
				`beforeMediaUpload: (f) => f.mime === "image/png" ? { reject: "No PNGs here" } : undefined`,
			),
		]);
		const form = new FormData();
		form.set("file", new File([PNG], "a.png", { type: "image/png" }));
		const res = await app.request("/api/media", { method: "POST", headers: { "X-Wuppy-Request": "1" }, body: form });
		expect(res.status).toBe(422);
		expect((await res.json()).error.message).toContain("No PNGs here");
	});

	it("may hold or mark spam, never approve; sees no email; a spammer is not told", async () => {
		await setup([
			plugin(
				"spam",
				["beforeCommentCreate", "onCommentCreated"],
				`beforeCommentCreate: (c) => {
					if (JSON.stringify(c).includes("@")) return { reject: "saw an email" };
					if (c.body.includes("casino")) return { status: "spam" };
					if (c.body.includes("approve")) return { status: "approved" };
					if (c.body.includes("bad")) return { reject: "Please be kind" };
				},
				onCommentCreated: (e, ctx) => ctx.log("created " + e.status)`,
			),
		]);
		const spam = await comment("cheap casino");
		expect((await spam.json()).data.status).toBe("pending");
		expect(comments.list("spam")).toHaveLength(1);

		expect((await (await comment("please approve")).json()).data.status).toBe("approved");
		await settings({ moderated: true });
		expect((await (await comment("please approve")).json()).data.status).toBe("pending");

		const bad = await comment("bad words");
		expect(bad.status).toBe(422);
		expect((await bad.json()).error.message).toContain("Please be kind");
		await new Promise((r) => setTimeout(r, 20));
		expect(logs.join("\n")).toContain("created spam");
	});

	it("a failing comment check holds the comment instead of losing it", async () => {
		await setup([plugin("broken", ["beforeCommentCreate"], `beforeCommentCreate: () => { throw new Error("x"); }`)]);
		const res = await comment("hello");
		expect(res.status).toBe(201);
		expect((await res.json()).data.status).toBe("pending");
	});
});

async function settings(commentSettings: object) {
	await new JsonStore(root, new NoopGit()).write("settings", { comments: commentSettings }, "settings");
}
