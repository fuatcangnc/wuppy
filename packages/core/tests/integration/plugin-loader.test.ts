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

describe("plugin runtime management", () => {
	const hookPlugin = { ...manifest, limits: { callsPerMinute: 2 } };
	const event = { type: "content.updated" as const, collection: "posts", slug: "a", at: "now" };

	it("tracks calls, failures, the last error and the plugin's own log lines", async () => {
		await install("plugins/notifier", manifest);
		const d = deps();
		const set = await loadPlugins(root, [{ dir: "plugins/notifier", approve: capabilityHash(manifest) }], d.deps);
		await set.dispatch(event);
		const [status] = set.statuses();
		expect(status).toMatchObject({ id: "notifier", state: "active", stats: { calls: 1, failures: 0, quota: 120 } });
		set.dispose();

		await install("plugins/bad", { ...manifest, id: "bad" });
		await writeFile(
			join(root, "plugins/bad/plugin.js"),
			`globalThis.__plugin = { onContentUpdated: async (e, ctx) => { ctx.log("about to fail"); throw new Error("boom"); } };`,
		);
		const bad = await loadPlugins(root, [{ dir: "plugins/bad", approve: capabilityHash(manifest) }], deps().deps);
		await bad.dispatch(event);
		const [row] = bad.statuses();
		expect(row?.stats).toMatchObject({ calls: 1, failures: 1 });
		expect(row?.lastError?.message).toContain("boom");
		expect(row?.logs?.[0]).toContain("about to fail");
		bad.dispose();
	});

	it("drops calls over the per-minute quota and recovers in the next minute", async () => {
		await install("plugins/notifier", hookPlugin);
		const d = deps();
		let t = 1_000_000;
		const set = await loadPlugins(root, [{ dir: "plugins/notifier", approve: capabilityHash(hookPlugin) }], d.deps, {
			now: () => t,
		});
		for (let i = 0; i < 4; i++) await set.dispatch(event);
		expect(d.fetched).toHaveLength(2);
		const [row] = set.statuses();
		expect(row?.lastError?.message).toMatch(/quota/i);
		expect(row?.stats).toMatchObject({ callsThisMinute: 2, quota: 2 });
		t += 61_000;
		await set.dispatch(event);
		expect(d.fetched).toHaveLength(3);
		set.dispose();
	});

	it("route calls over quota answer 429, and a disabled plugin neither runs hooks nor answers routes", async () => {
		const routed = { ...manifest, routes: [{ path: "/hi", methods: ["GET"] }], limits: { callsPerMinute: 1 } };
		await install("plugins/notifier", routed);
		await writeFile(
			join(root, "plugins/notifier/plugin.js"),
			`globalThis.__plugin = { fetch: async () => ({ status: 200, body: "ok" }), onContentUpdated: async () => {} };`,
		);
		const set = await loadPlugins(root, [{ dir: "plugins/notifier", approve: capabilityHash(routed) }], deps().deps);
		expect((await set.request("notifier", "GET", "/hi"))?.status).toBe(200);
		expect((await set.request("notifier", "GET", "/hi"))?.status).toBe(429);

		expect(set.setEnabled("notifier", false)).toBe(true);
		expect((await set.request("notifier", "GET", "/hi"))?.status).toBe(503);
		expect(set.statuses()[0]?.state).toBe("disabled");
		expect(set.setEnabled("nope", false)).toBe(false);
		set.dispose();
	});

	it("starts disabled when the admin turned it off before", async () => {
		await install();
		const set = await loadPlugins(root, [{ dir: "plugins/notifier", approve: capabilityHash(manifest) }], deps().deps, {
			disabled: new Set(["notifier"]),
		});
		expect(set.statuses()[0]?.state).toBe("disabled");
		set.dispose();
	});

	it("reports a plugin awaiting approval with the hash to approve, and loads it once approved in the admin", async () => {
		await install();
		const hash = capabilityHash(manifest);
		const waiting = await loadPlugins(root, [{ dir: "plugins/notifier" }], deps().deps);
		expect(waiting.loaded).toEqual([]);
		expect(waiting.statuses()[0]).toMatchObject({ state: "needs-approval", pendingHash: hash, id: "notifier" });
		waiting.dispose();

		const approved = await loadPlugins(root, [{ dir: "plugins/notifier" }], deps().deps, {
			approvals: { "plugins/notifier": hash },
		});
		expect(approved.loaded).toEqual(["notifier"]);
		approved.dispose();

		const stale = await loadPlugins(root, [{ dir: "plugins/notifier" }], deps().deps, {
			approvals: { "plugins/notifier": "0".repeat(64) },
		});
		expect(stale.statuses()[0]?.state).toBe("needs-approval");
		stale.dispose();
	});

	it("refuses installed files that were edited after the lock was written", async () => {
		await install();
		const { readFile } = await import("node:fs/promises");
		const { fileDigest } = await import("../../src/plugins/loader.ts");
		const lock = {
			notifier: {
				sha256: fileDigest(
					await readFile(join(root, "plugins/notifier/manifest.json"), "utf8"),
					await readFile(join(root, "plugins/notifier/plugin.js"), "utf8"),
				),
			},
		};
		const entry = [{ dir: "plugins/notifier", approve: capabilityHash(manifest) }];
		const ok = await loadPlugins(root, entry, deps().deps, { lock });
		expect(ok.loaded).toEqual(["notifier"]);
		ok.dispose();

		await writeFile(join(root, "plugins/notifier/plugin.js"), `${code}\n// tampered`);
		const tampered = await loadPlugins(root, entry, deps().deps, { lock });
		expect(tampered.loaded).toEqual([]);
		expect(tampered.errors[0]).toMatch(/changed since they were installed/);
		tampered.dispose();
	});
});
