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

const run = async (m: Manifest, body: string, d = deps()) => {
	const p = await loadPlugin(m, `globalThis.__plugin = { onContentUpdated: async (e, ctx) => { ${body} } };`, d);
	const res = await p.dispatch("onContentUpdated", event);
	p.dispose();
	return res;
};

describe("write, secret, email and settings capabilities", () => {
	const caps = manifest({
		capabilities: { content: { read: ["posts"], write: ["posts"] }, secrets: ["API_KEY"], email: true },
		settings: [
			{ key: "greeting", label: "Greeting", default: "hi" },
			{ key: "count", label: "Count", type: "number" },
		],
	});

	it("writes only to declared collections, validating the document shape", async () => {
		const written: unknown[] = [];
		const d = deps({ writeContent: async (id, c, s, doc) => void written.push([id, c, s, doc]) });
		expect(await run(caps, `await ctx.content.put("posts", "new", { data: { title: "T" }, body: "b" });`, d)).toEqual({
			ok: true,
		});
		expect(written).toEqual([["t", "posts", "new", { data: { title: "T" }, body: "b" }]]);

		const denied = await run(caps, `await ctx.content.put("pages", "x", { data: {}, body: "" });`, d);
		expect(denied).toMatchObject({ ok: false, error: expect.stringContaining("write denied") });
		const bad = await run(caps, `await ctx.content.put("posts", "x", { data: [], body: 1 });`, d);
		expect(bad).toMatchObject({ ok: false, error: expect.stringContaining("needs { data: object, body: string }") });
		expect(written).toHaveLength(1);
		const readOnly = await run(manifest(), `await ctx.content.put("posts", "x", { data: {}, body: "" });`, d);
		expect(readOnly.ok).toBe(false);
	});

	it("hands out only declared secrets, and undefined when unset", async () => {
		const seen: unknown[] = [];
		const d = deps({
			secret: (_id, name) => (name === "API_KEY" ? "s3cr3t" : undefined),
			log: (m) => void seen.push(m),
		});
		await run(caps, `ctx.log(String(ctx.secret("API_KEY")));`, d);
		expect(seen).toEqual(["s3cr3t"]);
		const other = await run(caps, `ctx.secret("OTHER");`, d);
		expect(other).toMatchObject({ ok: false, error: expect.stringContaining("Secret access denied") });
		seen.length = 0;
		await run(caps, `ctx.log(String(ctx.secret("API_KEY")));`, deps({ log: (m) => void seen.push(m) }));
		expect(seen).toEqual(["undefined"]);
	});

	it("sends email only with the capability and a well-formed message", async () => {
		const sent: unknown[] = [];
		const d = deps({ sendEmail: async (id, m) => void sent.push([id, m]) });
		await run(caps, `await ctx.email.send({ to: "a@example.com", subject: "S", text: "T" });`, d);
		expect(sent).toEqual([["t", { to: "a@example.com", subject: "S", text: "T" }]]);
		const noCap = await run(manifest(), `await ctx.email.send({ to: "a@example.com", subject: "S", text: "T" });`, d);
		expect(noCap).toMatchObject({ ok: false, error: expect.stringContaining("Email access denied") });
		const malformed = await run(caps, `await ctx.email.send({ to: 1 });`, d);
		expect(malformed.ok).toBe(false);
		expect(sent).toHaveLength(1);
	});

	it("exposes frozen settings with defaults, read fresh on each call", async () => {
		let stored: Record<string, string | boolean | number> = { greeting: "hello" };
		const seen: string[] = [];
		const d = deps({ settings: () => stored, log: (m) => void seen.push(m) });
		const p = await loadPlugin(
			caps,
			`globalThis.__plugin = { onContentUpdated: async (e, ctx) => { ctx.log(JSON.stringify(ctx.settings) + Object.isFrozen(ctx.settings)); } };`,
			d,
		);
		await p.dispatch("onContentUpdated", event);
		stored = { greeting: "changed", count: 3 };
		await p.dispatch("onContentUpdated", event);
		p.dispose();
		expect(seen).toEqual(['{"greeting":"hello"}true', '{"greeting":"changed","count":3}true']);
	});
});
