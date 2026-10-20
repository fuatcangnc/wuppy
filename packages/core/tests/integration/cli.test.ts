import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../../src/cli/index.ts";
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
