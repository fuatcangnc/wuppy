import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scaffold } from "../src/index.ts";

const TEMPLATE = resolve(import.meta.dirname, "../../../templates/starter");
let base: string;
beforeEach(async () => void (base = await mkdtemp(join(tmpdir(), "create-wuppy-"))));
afterEach(() => rm(base, { recursive: true, force: true }));

describe("scaffold", () => {
	it("copies the starter, writes a random .env and removes monorepo-only specifiers", async () => {
		const target = join(base, "my-site");
		await scaffold({ template: TEMPLATE, target, name: "my-site", url: "http://localhost:4321" });

		const pkg = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
		expect(pkg.name).toBe("my-site");
		expect(JSON.stringify(pkg)).not.toMatch(/workspace:|catalog:/);

		const env = await readFile(join(target, ".env"), "utf8");
		const secret = /^WUPPY_SECRET=(.+)$/m.exec(env)?.[1];
		expect(secret?.length).toBeGreaterThanOrEqual(32);
		expect(env).toContain("WUPPY_URL=http://localhost:4321");
		expect((await stat(join(target, "content/posts/hello.md"))).isFile()).toBe(true);
		await expect(stat(join(target, "node_modules"))).rejects.toThrow();
		await expect(stat(join(target, ".wuppy"))).rejects.toThrow();
	});

	it("generates a different secret every time", async () => {
		await scaffold({ template: TEMPLATE, target: join(base, "a"), name: "a", url: "http://x" });
		await scaffold({ template: TEMPLATE, target: join(base, "b"), name: "b", url: "http://x" });
		expect(await readFile(join(base, "a/.env"), "utf8")).not.toBe(await readFile(join(base, "b/.env"), "utf8"));
	});

	it("refuses a non-empty target", async () => {
		const target = join(base, "taken");
		await mkdir(target);
		await writeFile(join(target, "file.txt"), "x");
		await expect(scaffold({ template: TEMPLATE, target, name: "taken", url: "http://x" })).rejects.toThrow(
			/not empty/i,
		);
	});

	it.each(["Bad Name", "../x", "UPPER", ""])("rejects invalid project name %j", async (name) => {
		await expect(scaffold({ template: TEMPLATE, target: join(base, "t"), name, url: "http://x" })).rejects.toThrow(
			/name/i,
		);
	});
});
