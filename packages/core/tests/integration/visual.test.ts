import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { RealGit } from "@wuppy/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type User } from "../../src/api/app.ts";
import { createVisualMiddleware } from "../../src/astro/visual.ts";
import { CommentService } from "../../src/comments/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { MediaService } from "../../src/media/index.ts";
import { RedirectService } from "../../src/redirects/service.ts";

const EDITOR: User = { id: "e", permissions: ["content:read", "content:write"] };
const READER: User = { id: "r", permissions: ["content:read"] };
const H = { "X-Wuppy-Request": "1", "Content-Type": "application/json" };

let root: string;
let json: JsonStore;
let user: User;
const app = async () => {
	const git = await RealGit.init(root);
	return createApp({
		service: new ContentService(root, [], git),
		media: new MediaService(root, git, undefined, json),
		json,
		comments: new CommentService(new DatabaseSync(":memory:")),
		redirects: new RedirectService(json, new DatabaseSync(":memory:"), []),
		userCount: () => 1,
		locales: ["en"],
		getUser: async () => user,
	});
};
const put = async (data: unknown) =>
	(await app()).request("/api/data/visual", { method: "PUT", headers: H, body: JSON.stringify({ data }) });

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-visual-"));
	json = new JsonStore(root, await RealGit.init(root));
	user = EDITOR;
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("visual editor data", () => {
	it("is edited by content writers and validated", async () => {
		expect((await put({ stylesheet: ".a{}</style><script>alert(1)</script>" })).status).toBe(422);
		expect((await put({ selectors: [{ id: "s", selector: ".a { } body", styles: {} }] })).status).toBe(422);
		expect((await put({ selectors: [{ id: "card", selector: ".card", styles: { color: "red" } }] })).status).toBe(200);
		const got = await (await app()).request("/api/data/visual");
		expect((await got.json()).data.breakpoints.map((b: { id: string }) => b.id)).toEqual(["tablet", "mobile"]);
		user = READER;
		expect((await (await app()).request("/api/data/visual")).status).toBe(403);
	});

	it("serves the site-wide CSS publicly with an ETag", async () => {
		await put({ selectors: [{ id: "card", selector: ".card", styles: { color: "red" } }] });
		user = READER;
		const res = await (await app()).request("/api/public/visual.css");
		expect(res.headers.get("content-type")).toContain("text/css");
		expect(await res.text()).toContain(".card { color: red }");
		const again = await (await app()).request("/api/public/visual.css", {
			headers: { "If-None-Match": res.headers.get("etag")! },
		});
		expect(again.status).toBe(304);
	});
});

const page = (body: string) => () =>
	Promise.resolve(new Response(body, { headers: { "content-type": "text/html" } }));
const get = (path: string) => ({ request: new Request(`http://x${path}`), url: new URL(`http://x${path}`) });

describe("visual middleware", () => {
	const node = `<p class="ve-k1" data-ve-r="{&quot;tablet&quot;:{&quot;color&quot;:&quot;red&quot;}}">x</p>`;

	it("adds the page's node CSS, and the site sheet and fonts once the editor saved data", async () => {
		const mw = createVisualMiddleware(root);
		let html = await (await mw(get("/"), page(`<html><head></head><body>${node}</body></html>`))).text();
		expect(html).toContain(
			"<style data-wuppy-visual>@media (max-width: 768px) { .ve-k1 { color: red !important } }</style></head>",
		);
		expect(html).not.toContain("visual.css");

		await put({
			framework: {
				...(await (await (await app()).request("/api/data/visual")).json()).data.framework,
				fonts: [{ name: "body", stack: "'Inter', sans-serif", href: "https://fonts.example/css?a=1&b=2" }],
			},
		});
		html = await (await mw(get("/"), page(`<html><head></head><body>${node}</body></html>`))).text();
		expect(html).toMatch(/<link rel="stylesheet" href="\/api\/public\/visual\.css\?v=[0-9a-f]{10}">/);
		expect(html).toContain('href="https://fonts.example/css?a=1&amp;b=2"');
		expect(await (await mw(get("/api/x"), page(node))).text()).toBe(node);
	});
});
