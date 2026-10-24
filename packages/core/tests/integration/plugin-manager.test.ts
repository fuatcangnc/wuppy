import { generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { NoopGit } from "@wuppycms/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type User } from "../../src/api/app.ts";
import { CommentService } from "../../src/comments/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { MediaService } from "../../src/media/index.ts";
import { capabilityHash, fileDigest } from "../../src/plugins/loader.ts";
import { PluginManager } from "../../src/plugins/manager.ts";
import { RegistryClient, signedMessage, type RegistryConfig } from "../../src/plugins/registry.ts";
import { RedirectService } from "../../src/redirects/service.ts";

const ADMIN: User = { id: "a", permissions: ["plugins:manage", "content:read"] };
const H = { "X-Wuppy-Request": "1", "Content-Type": "application/json" };

const manifest = {
	id: "hello",
	version: "1.0.0",
	routes: [{ path: "/page", methods: ["GET"] }],
	adminPages: [{ path: "/page", label: "Hello page" }],
	settings: [{ key: "greeting", label: "Greeting", default: "hi" }],
	capabilities: {},
};
const code = `globalThis.__plugin = { fetch: async (req, ctx) => ({ status: 200, body: JSON.stringify({ html: "<p>" + ctx.settings.greeting + "</p><script>alert(1)</script>" }) }) };`;

const keys = () => {
	const { publicKey, privateKey } = generateKeyPairSync("ed25519");
	return { privateKey, publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64") };
};

let root: string;
let json: JsonStore;
let manager: PluginManager;
const baseDeps = { log: () => {}, readContent: async () => null, fetch: async () => ({ status: 200, body: "" }) };
const make = (configured = [] as { dir: string; approve?: string }[], registry?: RegistryClient) =>
	new PluginManager(root, json, configured, { ...baseDeps, ...(registry ? { registry } : {}) });

async function writePlugin(dir: string, m: object = manifest, c = code) {
	await mkdir(join(root, dir), { recursive: true });
	await writeFile(join(root, dir, "manifest.json"), JSON.stringify(m));
	await writeFile(join(root, dir, "plugin.js"), c);
}

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-pm-"));
	json = new JsonStore(root, new NoopGit());
});
afterEach(async () => {
	manager?.dispose();
	await rm(root, { recursive: true, force: true });
});

describe("approval, enable switch and settings", () => {
	it("a plugin with no approval waits; approving the reviewed hash starts it, a stale hash is refused", async () => {
		await writePlugin("plugins/hello");
		manager = make([{ dir: "plugins/hello" }]);
		await manager.load();
		const [row] = manager.statuses();
		expect(row).toMatchObject({ state: "needs-approval", id: "hello", pendingHash: capabilityHash(manifest) });

		expect(await manager.approve("plugins/hello", "0".repeat(64))).toBe(false);
		expect(await manager.approve("plugins/hello", row!.pendingHash!)).toBe(true);
		expect(manager.statuses()[0]?.state).toBe("active");

		// A later update that widens capabilities is not covered by the old approval.
		await writePlugin("plugins/hello", { ...manifest, capabilities: { secrets: ["API_KEY"] } });
		await manager.load();
		expect(manager.statuses()[0]?.state).toBe("needs-approval");
	});

	it("enable/disable and settings survive a restart and reach the plugin", async () => {
		await writePlugin("plugins/hello");
		manager = make([{ dir: "plugins/hello", approve: capabilityHash(manifest) }]);
		await manager.load();
		expect(await manager.setEnabled("hello", false)).toBe(true);
		expect(await manager.saveSettings("hello", { greeting: "hey", evil: 1 })).toEqual({ greeting: "hey" });
		manager.dispose();

		manager = make([{ dir: "plugins/hello", approve: capabilityHash(manifest) }]);
		await manager.load();
		expect(manager.statuses()[0]?.state).toBe("disabled");
		expect(manager.settingsOf("hello")?.values).toEqual({ greeting: "hey" });
		await manager.setEnabled("hello", true);
		const page = await manager.adminPage("hello", 0);
		expect(page?.html).toBe("<p>hey</p>"); // the script element and its content are dropped
		expect(page?.label).toBe("Hello page");
		expect(await manager.adminPage("hello", 3)).toBeNull();
	});
});

describe("registry", () => {
	const { privateKey, publicKey } = keys();
	const other = keys();
	const manifestText = JSON.stringify(manifest);
	const sha256 = fileDigest(manifestText, code);
	const sig = (key = privateKey) =>
		sign(null, Buffer.from(signedMessage("hello", "1.0.0", sha256)), key).toString("base64");

	const registry = (over: Partial<RegistryConfig> = {}): RegistryConfig => ({
		name: "main",
		url: "https://reg.example.com/index.json",
		publicKeys: [publicKey],
		...over,
	});
	const served =
		(entry: object = {}, bundle: object = { manifest: manifestText, code }) =>
		async (url: string) => {
			if (url.endsWith("index.json")) {
				return JSON.stringify({
					plugins: [
						{
							id: "hello",
							name: "Hello",
							description: "Says hi",
							version: "1.0.0",
							bundle: { url: "hello.json", sha256 },
							signature: sig(),
							...entry,
						},
					],
				});
			}
			if (url === "https://reg.example.com/hello.json") return JSON.stringify(bundle);
			throw new Error(`unexpected ${url}`);
		};

	it("searches, installs a signed package, pins its files, and leaves it waiting for approval", async () => {
		manager = make([], new RegistryClient([registry()], served()));
		await manager.load();
		const found = await manager.search("hi");
		expect(found.results).toMatchObject([
			{ id: "hello", registry: "main", verified: true, installedVersion: null, updateAvailable: false },
		]);

		expect(await manager.install("main", "hello")).toEqual({ dir: "plugins/hello", verified: true });
		expect(await readFile(join(root, "plugins/hello/plugin.js"), "utf8")).toBe(code);
		expect(manager.statuses()[0]).toMatchObject({
			id: "hello",
			state: "needs-approval",
			source: "registry",
			registry: "main",
		});
		expect((await manager.search("")).results[0]).toMatchObject({ installedVersion: "1.0.0", updateAvailable: false });

		await manager.approve("plugins/hello", manager.statuses()[0]!.pendingHash!);
		expect(manager.statuses()[0]?.state).toBe("active");

		// Editing the installed files afterwards is detected.
		await writeFile(join(root, "plugins/hello/plugin.js"), `${code} // edited`);
		await manager.load();
		expect(manager.statuses()[0]).toMatchObject({
			state: "error",
			error: expect.stringContaining("changed since they were installed"),
		});
	});

	it.each([
		["a signature from an untrusted key", { signature: sig(other.privateKey) }, undefined, /not signed by a key/],
		["a missing signature", { signature: undefined }, undefined, /not signed by a key/],
		["a bundle that differs from the published digest", {}, { manifest: manifestText, code: `${code}//x` }, /digest/],
		[
			"a manifest that disagrees with the listing",
			{ version: "1.0.0" },
			{ manifest: JSON.stringify({ ...manifest, version: "9.9.9" }), code },
			/digest|index says/,
		],
	])("refuses %s", async (_name, entry, bundle, message) => {
		manager = make([], new RegistryClient([registry()], served(entry, bundle)));
		await manager.load();
		await expect(manager.install("main", "hello")).rejects.toThrow(message);
		expect(manager.statuses()).toEqual([]);
	});

	it("an unsigned registry installs but is reported as unverified; unknown ids and registries fail", async () => {
		manager = make([], new RegistryClient([registry({ publicKeys: [] })], served({ signature: undefined })));
		await manager.load();
		expect((await manager.install("main", "hello")).verified).toBe(false);
		await expect(manager.install("main", "nope")).rejects.toThrow(/no plugin/);
		await expect(manager.install("other", "hello")).rejects.toThrow(/Unknown registry/);
	});

	const fetcher = async (url: string) => {
		if (url.includes("down.example.com")) throw new Error("ECONNREFUSED");
		return served()(url);
	};

	it("a registry that is down is reported without hiding the others", async () => {
		const a = registry({ name: "down", url: "https://down.example.com/index.json" });
		manager = make([], new RegistryClient([a, registry()], fetcher));
		await manager.load();
		const { results, errors } = await manager.search("");
		expect(results).toHaveLength(1);
		expect(errors[0]).toContain("down: ECONNREFUSED");
	});

	it("reports an update when the registry has a newer version, and removing deletes files, lock and state", async () => {
		manager = make([], new RegistryClient([registry()], served()));
		await manager.load();
		await manager.install("main", "hello");
		const newer = make([], new RegistryClient([registry()], served({ version: "2.0.0" })));
		manager.dispose();
		manager = newer;
		await manager.load();
		expect((await manager.search("")).results[0]).toMatchObject({ installedVersion: "1.0.0", updateAvailable: true });

		expect(await manager.remove("plugins/hello")).toBe(true);
		expect(manager.statuses()).toEqual([]);
		expect(await readFile(join(root, "plugins/hello/plugin.js"), "utf8").catch(() => null)).toBeNull();
		expect(await json.read("plugin-state", null)).toMatchObject({ installed: [], lock: {} });
	});

	it("never removes a plugin defined in wuppy.config, or anything outside plugins/", async () => {
		await writePlugin("plugins/hello");
		manager = make([{ dir: "plugins/hello", approve: capabilityHash(manifest) }]);
		await manager.load();
		expect(await manager.remove("plugins/hello")).toBe(false);
		expect(await manager.remove("../etc")).toBe(false);
		expect(await readFile(join(root, "plugins/hello/plugin.js"), "utf8")).toBe(code);
	});
});

describe("plugin admin API", () => {
	it("exposes the manager behind plugins:manage, keeps plugin routes separate and public pages sanitized", async () => {
		await writePlugin("plugins/hello");
		manager = make([{ dir: "plugins/hello" }]);
		await manager.load();
		const git = new NoopGit();
		const app = createApp({
			service: new ContentService(root, [], git),
			media: new MediaService(root, git),
			json,
			comments: new CommentService(new DatabaseSync(":memory:")),
			redirects: new RedirectService(json, new DatabaseSync(":memory:"), []),
			userCount: () => 1,
			pluginManager: manager,
			getUser: async () => ADMIN,
		});
		const send = (method: string, path: string, body?: unknown) =>
			app.request(path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });

		const list = (await (await send("GET", "/api/plugins")).json()).data;
		expect(list.plugins[0]).toMatchObject({ id: "hello", state: "needs-approval" });
		expect(list.errors[0]).toContain("not approved");

		expect(
			(await send("POST", "/api/plugin-admin/approve", { dir: "plugins/hello", hash: "1".repeat(64) })).status,
		).toBe(409);
		expect(
			(await send("POST", "/api/plugin-admin/approve", { dir: "plugins/hello", hash: list.plugins[0].pendingHash }))
				.status,
		).toBe(200);
		expect((await send("PUT", "/api/plugin-admin/hello/settings", { values: { greeting: "yo" } })).status).toBe(200);
		expect((await (await send("GET", "/api/plugin-admin/hello/settings")).json()).data.values).toEqual({
			greeting: "yo",
		});
		const page = (await (await send("GET", "/api/plugin-admin/hello/page/0")).json()).data;
		expect(page.html).toBe("<p>yo</p>");
		expect((await send("GET", "/api/plugin-admin/hello/page/9")).status).toBe(404);
		expect((await send("PUT", "/api/plugin-admin/nope/enabled", { enabled: false })).status).toBe(404);
		expect((await send("PUT", "/api/plugin-admin/hello/enabled", { enabled: false })).status).toBe(200);
		expect((await send("GET", "/api/plugins/hello/page")).status).toBe(503); // disabled -> route answers 503
		expect((await send("DELETE", "/api/plugin-admin?dir=plugins/hello")).status).toBe(409); // config-defined? not here: not installed
	});
});
