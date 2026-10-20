import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { RealGit } from "@wuppy/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type User } from "../../src/api/app.ts";
import { CommentService } from "../../src/comments/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { MediaService, serveUpload } from "../../src/media/index.ts";
import { RedirectService } from "../../src/redirects/service.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const EDITOR: User = { id: "e", permissions: ["content:read", "media:write"] };
const VIEWER: User = { id: "v", permissions: ["content:read"] };

let root: string;
let user: User;
let git: RealGit;
let json: JsonStore;
let comments: CommentService;
let redirects: RedirectService;
const app = () =>
	createApp({
		service: new ContentService(root, [], git),
		media: new MediaService(root, git, undefined, json),
		json,
		comments,
		redirects,
		userCount: () => 1,
		getUser: async () => user,
	});
const H = { "X-Wuppy-Request": "1" };
const upload = (bytes: Uint8Array, name = "pic.png", type = "image/png") => {
	const form = new FormData();
	form.set("file", new File([Buffer.from(bytes)], name, { type }));
	return app().request("/api/media", { method: "POST", headers: H, body: form });
};

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-media-"));
	git = await RealGit.init(root);
	json = new JsonStore(root, git);
	comments = new CommentService(new DatabaseSync(":memory:"));
	redirects = new RedirectService(json, new DatabaseSync(":memory:"), []);
	user = EDITOR;
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("media upload", () => {
	it("stores a png under public/uploads with a server-chosen name and commits it", async () => {
		const res = await upload(PNG, "../../evil name.png");
		expect(res.status).toBe(200);
		const { data } = (await res.json()) as { data: { url: string } };
		expect(data.url).toMatch(/^\/uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
		expect(await readFile(join(root, "public", data.url))).toEqual(Buffer.from(PNG));
		expect((await git.history()).at(0)?.message).toMatch(/^media: upload/);
	});

	it("stores an upload when public/uploads is ignored by Git", async () => {
		await writeFile(join(root, ".gitignore"), "public/uploads/\n");
		const res = await upload(PNG);
		expect(res.status).toBe(200);
		const { data } = (await res.json()) as { data: { url: string } };
		expect(await readFile(join(root, "public", data.url))).toEqual(Buffer.from(PNG));
	});

	it("derives the type from the bytes, not the claimed name or mime", async () => {
		const res = await upload(new TextEncoder().encode("<script>alert(1)</script>"), "x.png", "image/png");
		expect(res.status).toBe(415);
	});

	it("rejects files over the size cap", async () => {
		const big = new Uint8Array(6 * 1024 * 1024);
		big.set(PNG);
		expect((await upload(big)).status).toBe(413);
	});

	it("requires media:write", async () => {
		user = VIEWER;
		expect((await upload(PNG)).status).toBe(403);
	});

	it("422 when no file is sent", async () => {
		const res = await app().request("/api/media", { method: "POST", headers: H, body: new FormData() });
		expect(res.status).toBe(422);
	});

	it("serves uploads back with safe headers and blocks traversal", async () => {
		const { data } = (await (await upload(PNG)).json()) as { data: { url: string } };
		const ok = await serveUpload(root, data.url.replace("/uploads/", ""));
		expect(ok.status).toBe(200);
		expect(ok.headers.get("content-type")).toBe("image/png");
		expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
		expect((await serveUpload(root, "../../package.json")).status).toBe(404);
	});

	it("lists uploaded images, newest first, for any reader", async () => {
		await upload(PNG);
		await upload(PNG);
		user = VIEWER;
		const res = await app().request("/api/media");
		const { data } = (await res.json()) as { data: { url: string; size: number }[] };
		expect(data).toHaveLength(2);
		expect(data[0]?.url).toMatch(/^\/uploads\//);
		expect(data[0]?.size).toBe(PNG.byteLength);
	});

	it("lists nothing when there are no uploads", async () => {
		expect(await (await app().request("/api/media")).json()).toEqual({ data: [] });
	});
});
