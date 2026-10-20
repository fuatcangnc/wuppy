import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { capabilityHash, run, TEMPLATE_MANIFEST } from "../src/index.ts";
import { manifestSchema } from "@wuppy/plugin-types";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-plugin-cli-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("plugin cli", () => {
	it("creates a plugin and validates it", async () => {
		const init = await run(["init", "search"], root);
		expect(init.code).toBe(0);
		expect(JSON.parse(await readFile(join(root, "search/manifest.json"), "utf8"))).toMatchObject({
			id: "my-plugin",
		});
		const validate = await run(["validate", "search"], root);
		expect(validate.code).toBe(0);
		expect(validate.stdout).toContain("Valid plugin");
	});

	it("prints a capability hash that changes with capabilities", () => {
		const manifest = manifestSchema.parse(TEMPLATE_MANIFEST);
		const first = capabilityHash(manifest);
		expect(first).toMatch(/^[a-f0-9]{64}$/);
		const wider = manifestSchema.parse({
			...manifest,
			capabilities: { ...manifest.capabilities, network: [{ host: "api.example.com", methods: ["POST"], paths: ["/"] }] },
		});
		expect(capabilityHash(wider)).not.toBe(first);
	});

	it("rejects an invalid manifest", async () => {
		await run(["init", "bad"], root);
		const result = await run(["hash", "missing"], root);
		expect(result.code).toBe(1);
	});
});
