import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { capabilityHash, run, TEMPLATE_MANIFEST } from "../src/index.ts";
import { manifestSchema } from "@wuppycms/plugin-types";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppycms-plugin-cli-"));
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
			capabilities: {
				...manifest.capabilities,
				network: [{ host: "api.example.com", methods: ["POST"], paths: ["/"] }],
			},
		});
		expect(capabilityHash(wider)).not.toBe(first);
	});

	it("rejects an invalid manifest", async () => {
		await run(["init", "bad"], root);
		const result = await run(["hash", "missing"], root);
		expect(result.code).toBe(1);
	});
});

const write = async (manifest: object, code: string) => {
	await run(["init", "p"], root);
	const { writeFile } = await import("node:fs/promises");
	await writeFile(join(root, "p/manifest.json"), JSON.stringify(manifest));
	await writeFile(join(root, "p/plugin.js"), code);
};

const base = { id: "p", version: "1.0.0", hooks: ["onContentUpdated"] };

describe("build and pack", () => {
	it("fails the build when plugin.js uses capabilities the manifest does not declare", async () => {
		await write(
			base,
			`export default { onContentUpdated: async (e, ctx) => { await ctx.fetch("https://x"); ctx.secret("K"); ctx.email.send({}); ctx.content.put("a","b",{}); } };`,
		);
		const r = await run(["build", "p"], root);
		expect(r.code).toBe(1);
		for (const text of ["capabilities.network", "capabilities.secrets", "capabilities.email", "content.write"])
			expect(r.stderr).toContain(text);
	});

	it("passes when declared, and flags a declared hook that is missing", async () => {
		await write(
			{ ...base, capabilities: { network: [{ host: "x.example.com" }] } },
			`export default { onContentUpdated: async (e, ctx) => { await ctx.fetch("https://x.example.com"); } };`,
		);
		expect((await run(["build", "p"], root)).stdout).toContain("Build OK");
		await write(base, `export default { onContentDeleted() {} };`);
		expect((await run(["build", "p"], root)).stderr).toContain("does not define it");
	});

	it("requires admin pages to be declared GET routes", async () => {
		await write({ ...base, hooks: [], adminPages: [{ path: "/x", label: "X" }] }, `export default {};`);
		expect((await run(["build", "p"], root)).stderr).toContain("adminPages");
	});

	it("pack signs the digest with a key from keygen; the signature verifies", async () => {
		await write(base, `export default { onContentUpdated() {} };`);
		const keys = (await run(["keygen"], root)).stdout.split("\n").filter(Boolean);
		const pub = keys[1]!;
		const priv = keys[3]!;
		const out = JSON.parse((await run(["pack", "p", priv], root)).stdout);
		const { verify, createPublicKey } = await import("node:crypto");
		const e = out.indexEntry;
		expect(
			verify(
				null,
				Buffer.from(`${e.id}@${e.version}:${e.bundle.sha256}`),
				createPublicKey({ key: Buffer.from(pub, "base64"), format: "der", type: "spki" }),
				Buffer.from(e.signature, "base64"),
			),
		).toBe(true);
		expect(out.bundle.code).toContain("onContentUpdated");
	});
});
