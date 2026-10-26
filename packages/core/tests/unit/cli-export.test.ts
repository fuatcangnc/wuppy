import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportSite, linksIn, redirectLines } from "../../src/cli/export.ts";
import { redirectsSchema } from "../../src/redirects/index.ts";

// A stand-in for Astro's built server: a few pages, an upload, a draft-like 404 and the admin.
const SERVER = `import { createServer } from "node:http";
const pages = {
	"/": '<a href="/posts/one">1</a><a href="/admin">a</a><img srcset="/uploads/a.png?w=10 1x, /uploads/a.png 2x"><a href="https://x.test/">x</a>',
	"/posts/one": '<a href="/">home</a><a href="/gone">gone</a>',
	"/admin": "secret",
};
createServer((req, res) => {
	const path = new URL(req.url, "http://h").pathname;
	if (path === "/uploads/a.png") return res.writeHead(200, { "content-type": "image/png" }).end("PNG");
	if (path === "/robots.txt") return res.writeHead(200, { "content-type": "text/plain" }).end("ok");
	if (path in pages) return res.writeHead(200, { "content-type": "text/html" }).end(pages[path]);
	res.writeHead(404, { "content-type": "text/html" }).end("not found page");
}).listen(Number(process.env.PORT), process.env.HOST);
`;

describe("wuppycms export", () => {
	it("finds same-site links and turns rules into Cloudflare redirects", () => {
		const from = new URL("http://h/a/");
		expect(
			linksIn(
				`<a href="b">x</a><a href="mailto:x"></a><link href="/api/x"><div style="background:url('/i.png')">`,
				from,
			),
		).toEqual(["/a/b", "/i.png"]);
		const rules = redirectsSchema.parse([
			{ from: "/old", to: "/new" },
			{ from: "/blog/*", to: "/posts/$1", match: "wildcard", status: 302 },
			{ from: "^/x(\\d+)$", to: "/y", match: "regex" },
			{ from: "/off", to: "/on", enabled: false },
		]);
		expect(redirectLines(rules)).toEqual(["/old /new 301", "/blog/* /posts/:splat 302"]);
	});

	it("saves every reachable page of the built server, without the admin", async () => {
		const dir = await mkdtemp(join(tmpdir(), "wuppy-export-"));
		await mkdir(join(dir, "dist", "server"), { recursive: true });
		await mkdir(join(dir, "dist", "client", "_astro"), { recursive: true });
		await writeFile(join(dir, "dist", "server", "entry.mjs"), SERVER);
		await writeFile(join(dir, "dist", "client", "_astro", "x.css"), "a{}");
		await writeFile(
			join(dir, "wuppy.config.mjs"),
			`export default { collections: [], redirects: [{ from: "/old", to: "/" }] };`,
		);
		const r = await exportSite(dir, ["export"], {});
		expect(r.stderr).toBe("");
		const out = join(dir, "dist-static");
		expect(await readFile(join(out, "index.html"), "utf8")).toContain("/posts/one");
		expect(await readFile(join(out, "posts", "one", "index.html"), "utf8")).toContain("home");
		expect(await readFile(join(out, "uploads", "a.png"), "utf8")).toBe("PNG");
		expect(await readFile(join(out, "404.html"), "utf8")).toBe("not found page");
		expect(await readFile(join(out, "_redirects"), "utf8")).toBe("/old / 301\n");
		expect(existsSync(join(out, "_astro", "x.css"))).toBe(true);
		expect(existsSync(join(out, "admin"))).toBe(false);
		expect(existsSync(join(out, "gone"))).toBe(false);
	});

	it("needs a build first", async () => {
		const dir = await mkdtemp(join(tmpdir(), "wuppy-export-"));
		expect((await exportSite(dir, ["export"], {})).stderr).toMatch(/astro build/);
	});
});
