import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../../src/cli/index.ts";
import { compareVersions, MIGRATIONS } from "../../src/cli/upgrade.ts";
import { capabilityHash } from "../../src/plugins/loader.ts";

let root: string;
beforeEach(async () => void (root = await mkdtemp(join(tmpdir(), "wuppy-cli-"))));
afterEach(() => rm(root, { recursive: true, force: true }));

describe("wuppy plugin hash", () => {
	it("prints the capabilities to review and the approve value", async () => {
		const manifest = { id: "p", version: "1.0.0", capabilities: { content: { read: ["posts"] } } };
		await mkdir(join(root, "plugins/p"), { recursive: true });
		await writeFile(join(root, "plugins/p/manifest.json"), JSON.stringify(manifest));
		const out = await run(["plugin", "hash", "plugins/p"], root);
		expect(out.code).toBe(0);
		expect(out.stdout).toContain(`approve: "${capabilityHash(manifest)}"`);
		expect(out.stdout).toContain("posts");
	});

	it("explains usage and fails on unknown commands", async () => {
		expect((await run(["nope"], root)).code).toBe(1);
		expect((await run(["plugin", "hash"], root)).stderr).toMatch(/usage/i);
	});

	it("reports a missing manifest clearly", async () => {
		const out = await run(["plugin", "hash", "plugins/none"], root);
		expect(out.code).toBe(1);
		expect(out.stderr).toMatch(/manifest/i);
	});
});

describe("wuppy doctor", () => {
	const secret = { WUPPY_SECRET: "x".repeat(32) };
	it("passes for a healthy project", async () => {
		await mkdir(join(root, "content/posts"), { recursive: true });
		await mkdir(join(root, ".git"));
		await writeFile(
			join(root, "wuppy.config.mjs"),
			`export default { collections: [{ name: "posts", dir: "content/posts" }] };`,
		);
		const out = await run(["doctor"], root, secret);
		expect(out.code).toBe(0);
		expect(out.stdout).not.toContain("FAIL");
	});
	it("flags a short secret, a missing content dir and a missing repo", async () => {
		await writeFile(
			join(root, "wuppy.config.mjs"),
			`export default { collections: [{ name: "posts", dir: "content/posts" }] };`,
		);
		const out = await run(["doctor"], root, { WUPPY_SECRET: "short" });
		expect(out.code).toBe(1);
		expect(out.stdout).toMatch(/FAIL WUPPY_SECRET/);
		expect(out.stdout).toMatch(/FAIL content dir content\/posts/);
		expect(out.stdout).toMatch(/FAIL Git repository/);
	});
	it("reports a missing config", async () => {
		const out = await run(["doctor"], root, secret);
		expect(out.code).toBe(1);
		expect(out.stdout).toMatch(/FAIL wuppy.config loads/);
	});
});

describe("wuppy types", () => {
	it("writes frontmatter types for every collection", async () => {
		await writeFile(
			join(root, "wuppy.config.mjs"),
			`export default { collections: [{ name: "blog-posts", dir: "c", fields: { title: { type: "string", required: true }, kind: { type: "select", options: ["a","b"] }, n: "number" } }] };`,
		);
		const out = await run(["types"], root);
		expect(out.code).toBe(0);
		const dts = await readFile(join(root, "wuppy-env.d.ts"), "utf8");
		expect(dts).toContain("export type BlogPostsData");
		expect(dts).toContain('"title": string');
		expect(dts).toContain('"kind"?: "a" | "b"');
		expect(dts).toContain('"n"?: number');
	});
});

const install = (version: string) =>
	mkdir(join(root, "node_modules/wuppy"), { recursive: true }).then(() =>
		writeFile(join(root, "node_modules/wuppy/package.json"), JSON.stringify({ version })),
	);

describe("wuppy upgrade", () => {
	it("records the installed version and is a no-op the second time", async () => {
		await install("0.2.0");
		const first = await run(["upgrade"], root);
		expect(first.code).toBe(0);
		expect(first.stdout).toContain("0.0.0 -> 0.2.0");
		expect(JSON.parse(await readFile(join(root, ".wuppy/version.json"), "utf8"))).toEqual({ version: "0.2.0" });
		expect((await run(["upgrade"], root)).stdout).toContain("0.2.0 -> 0.2.0");
	});

	it("refuses to run without an install or to downgrade", async () => {
		expect((await run(["upgrade"], root)).stderr).toMatch(/not installed/);
		await install("0.1.0");
		await mkdir(join(root, ".wuppy"));
		await writeFile(join(root, ".wuppy/version.json"), JSON.stringify({ version: "0.3.0" }));
		expect((await run(["upgrade"], root)).stderr).toMatch(/older than the data/);
	});

	it("compares versions numerically", () => {
		expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
		expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(0);
	});

	it("runs pending migrations in order and demands a clean Git tree", async () => {
		const ran: string[] = [];
		MIGRATIONS.push(
			{ to: "0.2.0", title: "a", run: async () => void ran.push("a") },
			{ to: "9.0.0", title: "future", run: async () => void ran.push("future") },
		);
		try {
			await install("0.2.0");
			await promisify(execFile)("git", ["init", "-q"], { cwd: root });
			const dirty = await run(["upgrade"], root);
			expect(dirty.stderr).toMatch(/Commit or stash/);
			expect(ran).toEqual([]);
			const out = await run(["upgrade", "--force"], root);
			expect(out.code).toBe(0);
			expect(ran).toEqual(["a"]);
			expect(out.stdout).toContain("- a");
		} finally {
			MIGRATIONS.length = 0;
		}
	});
});
