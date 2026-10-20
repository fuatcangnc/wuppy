import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contentVersion, createPageCacheMiddleware, PageCache } from "../../src/astro/page-cache.ts";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-pc-"));
	await mkdir(join(root, ".git/refs/heads"), { recursive: true });
	await writeFile(join(root, ".git/HEAD"), "ref: refs/heads/main\n");
	await writeFile(join(root, ".git/refs/heads/main"), "aaa\n");
});
afterEach(() => rm(root, { recursive: true, force: true }));

const html =
	(body: string, headers: Record<string, string> = {}) =>
	() =>
		Promise.resolve(
			new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...headers } }),
		);
const get = (path: string, headers: Record<string, string> = {}) => ({
	request: new Request(`http://x${path}`, { headers }),
	url: new URL(`http://x${path}`),
});

describe("contentVersion", () => {
	it("follows HEAD to the branch commit, packed refs and detached heads", async () => {
		expect(await contentVersion(root)).toBe("aaa");
		await rm(join(root, ".git/refs/heads/main"));
		await writeFile(join(root, ".git/packed-refs"), "# pack-refs\nbbb refs/heads/main\n");
		expect(await contentVersion(root)).toBe("bbb");
		await writeFile(join(root, ".git/HEAD"), "ccc\n");
		expect(await contentVersion(root)).toBe("ccc");
		expect(await contentVersion(join(root, "nope"))).toBeNull();
	});
});

describe("page cache middleware", () => {
	it("renders once per commit, adds an ETag and answers 304", async () => {
		let renders = 0;
		const mw = createPageCacheMiddleware(root);
		const render = () => (renders++, html("<p>hi</p>")());
		const first = await mw(get("/a"), render);
		const etag = first.headers.get("etag")!;
		expect(etag).toMatch(/^W\/"/);
		expect(first.headers.get("cache-control")).toContain("must-revalidate");
		expect(await first.text()).toBe("<p>hi</p>");

		expect(await (await mw(get("/a"), render)).text()).toBe("<p>hi</p>");
		expect(renders).toBe(1);
		const conditional = await mw(get("/a", { "if-none-match": etag }), render);
		expect(conditional.status).toBe(304);
		expect(renders).toBe(1);

		await writeFile(join(root, ".git/refs/heads/main"), "bbb\n"); // a commit
		await mw(get("/a"), render);
		expect(renders).toBe(2);
	});

	it("passes through previews, edit mode, admin/api, POSTs, cookies, errors and non-HTML", async () => {
		let renders = 0;
		const mw = createPageCacheMiddleware(root);
		const run = (path: string, res: () => Promise<Response>, init?: RequestInit) =>
			mw({ request: new Request(`http://x${path}`, init), url: new URL(`http://x${path}`) }, () => (renders++, res()));
		for (const path of ["/a?wuppy-preview=t", "/a?wuppy-edit=1", "/admin/x", "/api/y"]) {
			await run(path, html("x"));
			await run(path, html("x"));
		}
		expect(renders).toBe(8);
		renders = 0;
		await run("/p", html("x"), { method: "POST" });
		await run("/c", html("x", { "set-cookie": "a=b" }));
		await run("/c", html("x", { "set-cookie": "a=b" }));
		await run("/n", html("x", { "cache-control": "no-store" }));
		await run("/n", html("x", { "cache-control": "no-store" }));
		await run("/j", () => Promise.resolve(Response.json({})));
		await run("/j", () => Promise.resolve(Response.json({})));
		await run("/e", () =>
			Promise.resolve(new Response("nope", { status: 404, headers: { "content-type": "text/html" } })),
		);
		await run("/e", () =>
			Promise.resolve(new Response("nope", { status: 404, headers: { "content-type": "text/html" } })),
		);
		expect(renders).toBe(9);
	});

	it("does not cache without a Git repository", async () => {
		let renders = 0;
		const mw = createPageCacheMiddleware(join(root, "nope"));
		await mw(get("/a"), () => (renders++, html("x")()));
		await mw(get("/a"), () => (renders++, html("x")()));
		expect(renders).toBe(2);
	});

	it("does nothing when disabled (dev)", async () => {
		let renders = 0;
		const mw = createPageCacheMiddleware(root, undefined, false);
		await mw(get("/a"), () => (renders++, html("x")()));
		await mw(get("/a"), () => (renders++, html("x")()));
		expect(renders).toBe(2);
	});
});

describe("PageCache", () => {
	it("expires entries by age and evicts the oldest when full; oversized pages are not stored", () => {
		const cache = new PageCache(2, 10, 1000);
		cache.set("a", "v", "1", [], 0);
		expect(cache.get("a", "v", 500)).toBeDefined();
		expect(cache.get("a", "v", 1500)).toBeUndefined();
		cache.set("a", "v", "1", [], 0);
		cache.set("b", "v", "2", [], 0);
		cache.set("c", "v", "3", [], 0);
		expect(cache.get("a", "v", 1)).toBeUndefined();
		expect(cache.get("c", "v", 1)).toBeDefined();
		expect(cache.set("big", "v", "x".repeat(11), [])).toBeNull();
	});
});
