import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { capabilityHash, loadPlugins } from "../../src/plugins/loader.ts";

let root: string;
beforeEach(async () => void (root = await mkdtemp(join(tmpdir(), "wuppy-plug-"))));
afterEach(() => rm(root, { recursive: true, force: true }));

const manifest = {
	id: "notifier",
	version: "1.0.0",
	hooks: ["onContentUpdated"],
	capabilities: { network: [{ host: "hooks.example.com", methods: ["POST"], paths: ["/"] }] },
};
const code = `globalThis.__plugin = { onContentUpdated: async (e, ctx) => { await ctx.fetch("https://hooks.example.com/x", { method: "POST", body: e.slug }); } };`;

async function install(dir = "plugins/notifier", m: object = manifest) {
	await mkdir(join(root, dir), { recursive: true });
	await writeFile(join(root, dir, "manifest.json"), JSON.stringify(m));
	await writeFile(join(root, dir, "plugin.js"), code);
}

const deps = () => {
	const fetched: string[] = [];
	return {
		fetched,
		deps: {
			log: () => {},
			readContent: async () => null,
			fetch: async (url: string) => (fetched.push(url), { status: 200, body: "" }),
		},
	};
};

describe("loadPlugins", () => {
	it("loads an approved plugin and routes events to its hook", async () => {
		await install();
		const d = deps();
		const set = await loadPlugins(root, [{ dir: "plugins/notifier", approve: capabilityHash(manifest) }], d.deps);
		expect(set.errors).toEqual([]);
		expect(set.loaded).toEqual(["notifier"]);
		await set.dispatch({ type: "content.updated", collection: "posts", slug: "a", at: "now" });
		expect(d.fetched).toEqual(["https://hooks.example.com/x"]);
		set.dispose();
	});

	it("does not load a plugin whose capabilities were not approved, and says what to approve", async () => {
		await install();
		const set = await loadPlugins(root, [{ dir: "plugins/notifier", approve: "0".repeat(64) }], deps().deps);
		expect(set.loaded).toEqual([]);
		expect(set.errors[0]).toContain(capabilityHash(manifest));
		set.dispose();
	});

	it("an update that widens capabilities needs re-approval", async () => {
		const approved = capabilityHash(manifest);
		await install("plugins/notifier", { ...manifest, capabilities: { network: [{ host: "evil.example.com" }] } });
		const set = await loadPlugins(root, [{ dir: "plugins/notifier", approve: approved }], deps().deps);
		expect(set.loaded).toEqual([]);
		set.dispose();
	});

	it("refuses plugin directories outside the project", async () => {
		const set = await loadPlugins(root, [{ dir: "../elsewhere", approve: "0".repeat(64) }], deps().deps);
		expect(set.errors[0]).toMatch(/outside/i);
	});

	it("one broken plugin does not stop the others", async () => {
		await install();
		await mkdir(join(root, "plugins/broken"), { recursive: true });
		const set = await loadPlugins(
			root,
			[
				{ dir: "plugins/broken", approve: "x".repeat(64) },
				{ dir: "plugins/notifier", approve: capabilityHash(manifest) },
			],
			deps().deps,
		);
		expect(set.loaded).toEqual(["notifier"]);
		expect(set.errors).toHaveLength(1);
		set.dispose();
	});

	it("forwards only declared routes to plugin fetch", async () => {
		const routed = {
			...manifest,
			routes: [{ path: "/hello", methods: ["GET"] }],
		};
		await install("plugins/routed", routed);
		await writeFile(
			join(root, "plugins/routed/plugin.js"),
			`globalThis.__plugin = { fetch: async (request) => ({ status: 200, body: JSON.stringify({ path: request.path }) }) };`,
		);
		const set = await loadPlugins(root, [{ dir: "plugins/routed", approve: capabilityHash(routed) }], deps().deps);
		expect(set.errors).toEqual([]);
		const response = await set.request("notifier", "GET", "/hello");
		expect(response?.status).toBe(200);
		expect(JSON.parse(response!.body)).toEqual({ path: "/hello" });
		set.dispose();
	});
});
