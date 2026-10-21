import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { RealGit } from "@wuppy/git";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type User } from "../../src/api/app.ts";
import { CommentService } from "../../src/comments/index.ts";
import { collectionSchema } from "../../src/content-types/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { MediaService, serveUpload } from "../../src/media/index.ts";
import { RedirectService } from "../../src/redirects/service.ts";

const OWNER: User = {
	id: "o",
	permissions: ["content:read", "content:write", "media:write", "media:delete", "bylines:manage", "site:settings"],
};
const H = { "X-Wuppy-Request": "1" };
const png = (color: string, width = 40, height = 20) =>
	sharp({ create: { width, height, channels: 3, background: color } })
		.png()
		.toBuffer();

let root: string;
let git: RealGit;
let json: JsonStore;
let service: ContentService;
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-lifecycle-"));
	git = await RealGit.init(root);
	json = new JsonStore(root, git);
	service = new ContentService(root, [collectionSchema.parse({ name: "posts", dir: "content/posts" })], git);
	app = createApp({
		service,
		media: new MediaService(root, git, undefined, json),
		json,
		comments: new CommentService(new DatabaseSync(":memory:")),
		redirects: new RedirectService(json, new DatabaseSync(":memory:"), []),
		userCount: () => 1,
		getUser: async () => OWNER,
	});
});
afterEach(() => rm(root, { recursive: true, force: true }));

const upload = async (bytes: Buffer, path = "/api/media") => {
	const form = new FormData();
	form.set("file", new File([new Uint8Array(bytes)], "x.png", { type: "image/png" }));
	return app.request(path, { method: path === "/api/media" ? "POST" : "PUT", headers: H, body: form });
};
const add = async (color = "#f00") =>
	((await (await upload(await png(color))).json()) as { data: { url: string } }).data.url;
const send = async (extra: Record<string, string>) => {
	const form = new FormData();
	form.set("file", new File([new Uint8Array(await png("#0f0"))], "x.png", { type: "image/png" }));
	for (const [k, v] of Object.entries(extra)) form.set(k, v);
	return app.request("/api/media", { method: "POST", headers: H, body: form });
};
const call = (method: string, path: string, body?: unknown) =>
	app.request(path, {
		method,
		headers: { ...H, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});

describe("usage and orphans", () => {
	it("refuses to delete an image an entry uses unless forced, and lists unused ones as orphans", async () => {
		const used = await add("#f00");
		const unused = await add("#0f0");
		await service.put("posts", "a", { data: { title: "A", cover: used }, body: "" });

		const refused = await call("DELETE", `/api/media?url=${used}`);
		expect(refused.status).toBe(409);
		const error = (await refused.json()).error;
		expect(error.code).toBe("IN_USE");
		expect(error.details.usedIn[0]).toMatchObject({ collection: "posts", slug: "a" });

		const orphans = (await (await call("GET", "/api/media/orphans")).json()).data;
		expect(orphans.map((o: { url: string }) => o.url)).toEqual([unused]);

		expect((await call("DELETE", "/api/media/orphans")).status).toBe(200);
		expect((await (await call("GET", "/api/media")).json()).data.map((m: { url: string }) => m.url)).toEqual([used]);
		expect((await call("DELETE", `/api/media?url=${used}&force=1`)).status).toBe(200);
	});

	it("keeps title, alt text, caption and folder given at upload, and rejects a bad folder", async () => {
		const ok = await send({ title: "Barn", alt: "A red barn", caption: "At dusk", folder: "farm" });
		expect(ok.status).toBe(200);
		const url = ((await ok.json()) as { data: { url: string } }).data.url;
		const item = (await (await call("GET", "/api/media")).json()).data.find((m: { url: string }) => m.url === url);
		expect(item).toMatchObject({ title: "Barn", alt: "A red barn", caption: "At dusk", folder: "farm" });
		expect((await send({ folder: "../etc" })).status).toBe(422);
	});

	it("returns the media used by one entry so the library can filter by page", async () => {
		const used = await add("#f00");
		await add("#0f0");
		await service.put("posts", "about", { data: { title: "About", cover: used }, body: `<img src="${used}">` });

		const res = await call("GET", "/api/media/usage/entry?collection=posts&slug=about");
		expect(res.status).toBe(200);
		expect(((await res.json()) as { data: { urls: string[] } }).data.urls).toEqual([used]);
		expect((await call("GET", "/api/media/usage/entry?collection=posts")).status).toBe(422);
		expect((await call("GET", "/api/media/usage/entry?collection=posts&slug=missing")).status).toBe(404);
	});

	it("an image referenced from a site data file (e.g. a byline avatar) is not an orphan", async () => {
		const avatar = await add("#00f");
		await call("PUT", "/api/data/bylines", { data: [{ slug: "ada", name: "Ada", avatar }] });
		const app2 = (await (await call("GET", "/api/media/orphans")).json()).data;
		expect(app2).toEqual([]);
	});
});

describe("replace, folders and metadata", () => {
	it("replaces the bytes in place, keeps the old version in Git and rejects a different type", async () => {
		const url = await add("#f00");
		const before = await readFile(join(root, "public", url));
		expect((await upload(await png("#00f", 80, 40), `/api/media/replace?url=${url}`)).status).toBe(200);
		const after = await readFile(join(root, "public", url));
		expect(after.equals(before)).toBe(false);
		expect((await git.history()).at(0)?.message).toMatch(/^media: replace/);
		const meta = (await (await call("GET", "/api/media")).json()).data[0];
		expect(meta).toMatchObject({ width: 80, height: 40 });

		const jpeg = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } })
			.jpeg()
			.toBuffer();
		expect((await upload(jpeg, `/api/media/replace?url=${url}`)).status).toBe(415);
		expect((await upload(await png("#000"), "/api/media/replace?url=/uploads/2026/01/none.png")).status).toBe(415);
	});

	it("renames and deletes nested folders, moving or unfiling their images", async () => {
		const url = await add();
		await call("PUT", "/api/media/folders", { folders: ["blog", "blog/2026"] });
		await call("PATCH", `/api/media/meta?url=${url}`, { folder: "blog/2026", credit: "Ada" });
		expect((await call("PUT", "/api/media/folders", { folders: ["../x"] })).status).toBe(422);

		await call("POST", "/api/media/folders/rename", { from: "blog", to: "news" });
		expect((await (await call("GET", "/api/media/folders")).json()).data).toEqual(["news", "news/2026"]);
		const [item] = (await (await call("GET", "/api/media")).json()).data;
		expect(item).toMatchObject({ folder: "news/2026", credit: "Ada" });

		await call("DELETE", "/api/media/folders?name=news");
		expect((await (await call("GET", "/api/media/folders")).json()).data).toEqual([]);
		expect((await (await call("GET", "/api/media")).json()).data[0].folder).toBeUndefined();
	});
});

describe("settings limits and optimisation", () => {
	it("honours Settings: media.allowed and a smaller maxBytes", async () => {
		await call("PUT", "/api/data/settings", { data: { media: { allowed: ["image/jpeg"] } } });
		const res = await upload(await png("#f00", 200, 200));
		expect(res.status).toBe(415);
		await call("PUT", "/api/data/settings", { data: { media: { maxBytes: 100, allowed: ["image/png"] } } });
		expect((await upload(await png("#f00", 200, 200))).status).toBe(413);
	});

	it("records dimensions and a blur placeholder on upload", async () => {
		await add();
		const [item] = (await (await call("GET", "/api/media")).json()).data;
		expect(item).toMatchObject({ width: 40, height: 20 });
		expect(item.lqip).toMatch(/^data:image\/webp;base64,/);
	});

	it("serves resized WebP variants from an allowlist, cached on disk", async () => {
		const form = await sharp({ create: { width: 1200, height: 600, channels: 3, background: "#123" } })
			.png()
			.toBuffer();
		const url = await (async () => ((await (await upload(form)).json()) as { data: { url: string } }).data.url)();
		const rel = url.replace("/uploads/", "");

		const res = await serveUpload(root, rel, new URLSearchParams("w=640&format=webp"));
		expect(res.headers.get("content-type")).toBe("image/webp");
		expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width).toBe(640);

		const small = await serveUpload(root, rel, new URLSearchParams("w=2560"));
		expect((await sharp(Buffer.from(await small.arrayBuffer())).metadata()).width).toBe(1200); // never upscaled

		expect((await serveUpload(root, rel, new URLSearchParams("w=641"))).status).toBe(400);
		expect((await serveUpload(root, rel, new URLSearchParams("format=bmp"))).status).toBe(400);
		expect((await serveUpload(root, rel)).headers.get("content-type")).toBe("image/png");
	});

	it("serves a crop around the focal point, cached separately from the uncropped image", async () => {
		// Left half red, right half blue: a square crop centred on the left must be red.
		const half = await sharp({ create: { width: 1200, height: 600, channels: 3, background: "#f00" } })
			.composite([
				{
					input: await sharp({ create: { width: 600, height: 600, channels: 3, background: "#00f" } })
						.png()
						.toBuffer(),
					left: 600,
					top: 0,
				},
			])
			.png()
			.toBuffer();
		const rel = ((await (await upload(half)).json()) as { data: { url: string } }).data.url.replace("/uploads/", "");
		const pixel = async (query: string) => {
			const res = await serveUpload(root, rel, new URLSearchParams(query));
			const image = sharp(Buffer.from(await res.arrayBuffer()));
			const { width, height } = await image.metadata();
			const { data } = await image.raw().toBuffer({ resolveWithObject: true });
			return { width, height, red: data[0], blue: data[2] };
		};
		const left = await pixel("ar=1:1&w=320&fx=0");
		expect(left).toMatchObject({ width: 320, height: 320, red: expect.any(Number) });
		expect(left.red! > 200 && left.blue! < 50).toBe(true);
		const right = await pixel("ar=1:1&w=320&fx=100");
		expect(right.blue! > 200 && right.red! < 50).toBe(true);
		expect((await pixel("w=320")).height).toBe(160); // no ratio: proportional
		expect((await serveUpload(root, rel, new URLSearchParams("ar=5:2"))).status).toBe(400);
	});
});
