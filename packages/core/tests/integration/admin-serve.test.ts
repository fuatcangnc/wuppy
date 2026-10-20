import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serveAdmin } from "../../src/astro/admin.ts";

let dist: string;
beforeEach(async () => {
	const base = await mkdtemp(join(tmpdir(), "wuppy-admin-"));
	dist = join(base, "dist");
	await mkdir(join(dist, "assets"), { recursive: true });
	await writeFile(join(dist, "index.html"), "<html>shell</html>");
	await writeFile(join(dist, "assets", "app.js"), "console.log(1)");
	await writeFile(join(base, "secret.txt"), "top secret");
});
afterEach(() => rm(join(dist, ".."), { recursive: true, force: true }));

describe("serveAdmin", () => {
	it("serves the SPA shell at the root and for client-side routes", async () => {
		for (const p of ["", "c/posts", "c/posts/a/b"]) {
			const res = await serveAdmin(dist, p);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("<html>shell</html>");
			expect(res.headers.get("content-type")).toContain("text/html");
			expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
		}
	});

	it("serves assets with the right type and long cache", async () => {
		const res = await serveAdmin(dist, "assets/app.js");
		expect(res.headers.get("content-type")).toContain("javascript");
		expect(res.headers.get("cache-control")).toContain("immutable");
	});

	it("404s for a missing asset instead of returning the shell", async () => {
		expect((await serveAdmin(dist, "assets/missing.js")).status).toBe(404);
	});

	it.each(["../secret.txt", "..%2Fsecret.txt", "assets/../../secret.txt", "%2e%2e/secret.txt"])(
		"blocks traversal: %s",
		async (p) => {
			const res = await serveAdmin(dist, p);
			expect(res.status).toBe(404);
			expect(await res.text()).not.toContain("top secret");
		},
	);
});
