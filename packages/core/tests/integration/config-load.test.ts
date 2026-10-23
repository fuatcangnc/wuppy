import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineConfig, loadConfig } from "../../src/config/index.ts";

let root: string;
beforeEach(async () => void (root = await mkdtemp(join(tmpdir(), "wuppy-cfg-"))));
afterEach(() => rm(root, { recursive: true, force: true }));

describe("config", () => {
	it("loads wuppy.config.mjs and applies defaults", async () => {
		await writeFile(
			join(root, "wuppy.config.mjs"),
			'export default { collections: [{ name: "posts", dir: "content/posts" }] };',
		);
		const cfg = await loadConfig(root);
		expect(cfg.collections[0]).toMatchObject({ name: "posts", fields: {} });
		expect(cfg.git).toBe(true);
		expect(cfg.admin.path).toBe("/admin");
	});

	it("fails with a readable message on invalid config", async () => {
		await writeFile(
			join(root, "wuppy.config.mjs"),
			'export default { collections: [{ name: "Bad Name", dir: "x" }] };',
		);
		await expect(loadConfig(root)).rejects.toThrow(/wuppy\.config.*collections/s);
	});

	it("throws when no config file exists", async () => {
		await expect(loadConfig(root)).rejects.toThrow(/wuppy\.config/);
	});

	it("rejects duplicate collection names", async () => {
		const c = { name: "posts", dir: "a" };
		expect(() => defineConfig({ collections: [c, { ...c, dir: "b" }] })).toThrow(/duplicate/i);
	});

	it("rejects collection dirs that escape the root", async () => {
		expect(() => defineConfig({ collections: [{ name: "posts", dir: "../out" }] })).toThrow(/dir/);
	});

	it("accepts site, locales and redirects, and rejects a redirect loop", () => {
		const cfg = defineConfig({
			site: { url: "https://example.com", name: "Example" },
			locales: ["en", "tr"],
			redirects: [{ from: "/old", to: "/new" }],
		});
		expect(cfg.redirects[0]?.status).toBe(301);
		expect(cfg.locales).toEqual(["en", "tr"]);
		expect(() => defineConfig({ redirects: [{ from: "/a", to: "/a" }] })).toThrow(/loop/i);
	});
});
