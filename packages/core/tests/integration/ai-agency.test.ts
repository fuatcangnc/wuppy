import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { permissionsFor } from "@wuppycms/auth";
import { NoopGit } from "@wuppycms/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aiConfigFromEnv, type AiConfig } from "../../src/ai/chat.ts";
import { ChatHistory } from "../../src/ai/history.ts";
import { careRound, sendMonthlyReports } from "../../src/sites/care.ts";
import type { SiteNetwork } from "../../src/sites/connect.ts";
import { createApp, type User } from "../../src/api/app.ts";
import { AuditLog } from "../../src/audit/index.ts";
import { CommentService } from "../../src/comments/index.ts";
import { collectionSchema } from "../../src/content-types/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { MediaService } from "../../src/media/index.ts";
import { RedirectService } from "../../src/redirects/service.ts";
import { ApiTokenService, bearerUser } from "../../src/security/api-tokens.ts";
import { proxyPath } from "../../src/sites/proxy.ts";
import { SiteStore } from "../../src/sites/store.ts";

const H = { "X-Wuppy-Request": "1", "Content-Type": "application/json" };
const BEARER = { authorization: "Bearer wuppy_test", "content-type": "application/json" };

function makeApp(root: string, db: DatabaseSync, extra: Partial<Parameters<typeof createApp>[0]>) {
	const git = new NoopGit();
	const json = new JsonStore(root, git);
	return createApp({
		service: new ContentService(root, [collectionSchema.parse({ name: "posts", dir: "content/posts" })], git),
		media: new MediaService(root, git),
		json,
		comments: new CommentService(db),
		redirects: new RedirectService(json, db, []),
		userCount: () => 1,
		getUser: async () => null,
		...extra,
	});
}

let roots: string[] = [];
let hub: ReturnType<typeof createApp>;
let remote: ReturnType<typeof createApp>;
let sites: SiteStore;
let me: User;
let siteId: string;
let mails: { to: string; subject: string }[];
let provider: { body: Record<string, unknown> }[];
let replies: unknown[];
let net: SiteNetwork;
/** Paths the fake internet answers with 200 text, as if a site leaked them. */
let leaked: string[];

const admin: User = { id: "boss", email: "boss@x.test", permissions: permissionsFor("admin") };
const client: User = { id: "cli", email: "cli@x.test", permissions: permissionsFor("client") };

const ai: AiConfig = {
	baseUrl: "https://llm.test/v1",
	models: ["model-a"],
	fetch: (async (_url: string, init: RequestInit) => {
		provider.push({ body: JSON.parse(String(init.body)) as Record<string, unknown> });
		const reply = replies.shift();
		return reply instanceof Response ? reply : Response.json({ choices: [{ message: reply }] });
	}) as typeof fetch,
};

beforeEach(async () => {
	roots = [await mkdtemp(join(tmpdir(), "wuppy-ai-r-")), await mkdtemp(join(tmpdir(), "wuppy-ai-h-"))];
	const remoteDb = new DatabaseSync(":memory:");
	remoteDb.exec("CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT, name TEXT, role TEXT, banned INTEGER)");
	remoteDb.prepare("INSERT INTO user VALUES ('owner', 'o@x.test', 'o', 'admin', 0)").run();
	const remoteTokens = new ApiTokenService(remoteDb);
	remote = makeApp(roots[0]!, remoteDb, {
		tokens: remoteTokens,
		getUser: async (req) => bearerUser(remoteTokens, remoteDb, req),
	});
	const hubDb = new DatabaseSync(":memory:");
	hubDb.exec("CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT, name TEXT, role TEXT, banned INTEGER)");
	hubDb
		.prepare(
			"INSERT INTO user VALUES ('boss', 'boss@x.test', 'Boss', 'admin', 0), ('cli', 'cli@x.test', 'Cli', 'client', 0)",
		)
		.run();
	sites = new SiteStore(hubDb, "s".repeat(40));
	mails = [];
	provider = [];
	replies = [];
	leaked = [];
	net = {
		allowPrivate: true,
		fetch: async (url, init) =>
			leaked.includes(new URL(url).pathname) ? new Response("SECRET=1") : remote.request(url, init),
	};
	hub = makeApp(roots[1]!, hubDb, {
		sites,
		ai,
		audit: new AuditLog(hubDb),
		sendEmail: async (m) => void mails.push({ to: m.to, subject: m.subject }),
		siteNetwork: net,
		chats: new ChatHistory(hubDb),
		getUser: async () => me,
	});
	me = admin;
	const token = remoteTokens.create({
		name: "hub",
		userId: "owner",
		permissions: permissionsFor("editor"),
		expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
		kind: "hub",
	}).token;
	const res = await hub.request("/api/sites", {
		method: "POST",
		headers: H,
		body: JSON.stringify({ name: "Müşteri 1", url: "https://musteri1.test", token }),
	});
	siteId = ((await res.json()) as { data: { id: string } }).data.id;
});
afterEach(() => Promise.all(roots.map((r) => rm(r, { recursive: true, force: true }))));

interface Rpc {
	result: {
		protocolVersion: string;
		capabilities: { tools?: unknown };
		tools: { name: string; inputSchema: { type: string } }[];
		isError: boolean;
		content: { text: string }[];
	};
	error: { code: number };
}
const mcp = async (method: string, params?: unknown, id: number | null = 1) => {
	const res = await hub.request("/api/mcp", {
		method: "POST",
		headers: BEARER,
		body: JSON.stringify({ jsonrpc: "2.0", ...(id === null ? {} : { id }), method, params }),
	});
	return { status: res.status, body: res.status === 202 ? null : ((await res.json()) as Rpc) };
};
const callTool = async (name: string, args: unknown) => {
	const { body } = await mcp("tools/call", { name, arguments: args });
	return { isError: body!.result.isError, text: body!.result.content[0]!.text };
};

describe("MCP server", () => {
	it("speaks the protocol: initialize, notifications, tools/list, unknown methods", async () => {
		const init = await mcp("initialize", { protocolVersion: "2025-03-26", capabilities: {} });
		expect(init.body!.result.protocolVersion).toBe("2025-03-26");
		expect(init.body!.result.capabilities.tools).toBeDefined();
		expect((await mcp("notifications/initialized", undefined, null)).status).toBe(202);
		const tools = (await mcp("tools/list")).body!.result.tools;
		expect(tools.map((t) => t.name)).toContain("list_sites");
		expect(tools.every((t) => t.inputSchema.type === "object")).toBe(true);
		expect((await mcp("nope")).body!.error.code).toBe(-32601);
		expect((await hub.request("/api/mcp")).status).toBe(405);
	});

	it("accepts only Bearer tokens, so a browser session cannot be used for it", async () => {
		const res = await hub.request("/api/mcp", {
			method: "POST",
			headers: H,
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
		});
		expect(res.status).toBe(401);
	});

	it("tools go through the hub's own API: content of a managed site by name", async () => {
		expect(JSON.parse((await callTool("list_sites", {})).text)[0]).toMatchObject({ name: "Müşteri 1", role: "admin" });
		const draft = await callTool("create_draft", {
			site: "musteri1",
			collection: "posts",
			slug: "merhaba",
			title: "Merhaba",
			body: "Selam\n",
		});
		expect(draft.isError).toBe(false);
		const listed = JSON.parse((await callTool("list_content", { site: "Müşteri 1", collection: "posts" })).text);
		expect(listed).toEqual([expect.objectContaining({ slug: "merhaba", status: "draft" })]);
		// It landed on the managed site, not on the hub.
		expect(JSON.parse((await callTool("list_content", { site: "local", collection: "posts" })).text)).toEqual([]);
		expect((await callTool("read_content", { site: siteId, collection: "posts", slug: "nope" })).isError).toBe(true);
	});

	it("a client sees only their own site, read-only, and none of the agency's notes", async () => {
		sites.setContext("agency", "Internal: be careful with this client");
		sites.setMember(siteId, "cli", "viewer");
		me = client;
		expect(JSON.parse((await callTool("list_sites", {})).text)).toHaveLength(1);
		expect((await callTool("list_content", { site: "local", collection: "posts" })).text).toMatch(/Not allowed/);
		const write = await callTool("create_draft", {
			site: siteId,
			collection: "posts",
			slug: "x",
			title: "X",
			body: "",
		});
		expect(write).toMatchObject({ isError: true, text: expect.stringMatching(/Not allowed/) });
		const notes = await callTool("get_context", { site: siteId });
		expect(notes.isError).toBe(true);
		expect(notes.text).not.toContain("Internal");
		sites.removeMember(siteId, "cli");
		expect((await callTool("check_site", { site: siteId })).text).toMatch(/No site matches/);
	});
});

describe("agency context and email", () => {
	it("stores the playbook and a client brief for site managers only", async () => {
		await hub.request("/api/ai/context", { method: "PUT", headers: H, body: JSON.stringify({ text: "Be brief." }) });
		await hub.request(`/api/sites/${siteId}/context`, {
			method: "PUT",
			headers: H,
			body: JSON.stringify({ text: "Warm, informal voice." }),
		});
		expect(JSON.parse((await callTool("get_context", { site: siteId })).text)).toMatchObject({
			agency: { text: "Be brief." },
			client: { text: "Warm, informal voice." },
		});
		me = client;
		expect((await hub.request("/api/ai/context")).status).toBe(403);
	});

	it("emails only members of the site", async () => {
		const send = (to: string) =>
			hub.request(`/api/sites/${siteId}/email`, {
				method: "POST",
				headers: H,
				body: JSON.stringify({ to, subject: "Report", text: "Hi" }),
			});
		expect((await send("cli@x.test")).status).toBe(422);
		sites.setMember(siteId, "cli", "viewer");
		expect((await send("cli@x.test")).status).toBe(200);
		expect(mails).toEqual([{ to: "cli@x.test", subject: "Report" }]);
	});

	it("a hub never reaches a managed site's own assistant", () => {
		expect(proxyPath("/api/ai/chat", "POST")).toBeNull();
		expect(proxyPath("/api/mcp", "POST")).toBeNull();
	});
});

const ask = (body: Record<string, unknown>) =>
	hub.request("/api/ai/chat", {
		method: "POST",
		headers: H,
		body: JSON.stringify({ model: "model-a", messages: [{ role: "user", content: "Siteler nasıl?" }], ...body }),
	});
const offeredTools = () =>
	(provider.at(-1)!.body.tools as { function: { name: string } }[]).map((t) => t.function.name);

describe("assistant chat", () => {
	it("runs tools with the user's access and answers in text", async () => {
		sites.setContext(siteId, "Client likes short answers.");
		replies = [
			{
				content: null,
				tool_calls: [{ id: "t1", type: "function", function: { name: "list_sites", arguments: "{}" } }],
			},
			{ content: "Müşteri 1 çalışıyor." },
		];
		const res = await ask({ agent: "site-care", site: siteId });
		expect(res.status).toBe(200);
		const { data } = (await res.json()) as { data: { reply: string; steps: { tool: string; ok: boolean }[] } };
		expect(data.reply).toBe("Müşteri 1 çalışıyor.");
		expect(data.steps).toEqual([expect.objectContaining({ tool: "list_sites", ok: true })]);
		const system = (provider[0]!.body.messages as { content: string }[])[0]!.content;
		expect(system).toContain("Client likes short answers.");
		// The tool result went back to the model as a tool message.
		expect(JSON.stringify(provider[1]!.body.messages)).toContain("Müşteri 1");
	});

	it("offers write tools only when the user allows changes", async () => {
		replies = [{ content: "ok" }, { content: "ok" }];
		await ask({ agent: "editor" });
		expect(offeredTools()).not.toContain("create_draft");
		await ask({ agent: "editor", allowWrites: true });
		expect(offeredTools()).toContain("create_draft");
		// A tool the agent does not have is refused even if the model asks for it.
		replies = [
			{
				content: null,
				tool_calls: [
					{ id: "t1", type: "function", function: { name: "email_site_member", arguments: '{"site":"x"}' } },
				],
			},
			{ content: "done" },
		];
		const { data } = (await (await ask({ agent: "editor", allowWrites: true })).json()) as {
			data: { steps: { ok: boolean; result: string }[] };
		};
		expect(data.steps[0]).toMatchObject({ ok: false, result: "Unknown tool: email_site_member" });
	});

	it("refuses unknown models and reports when it is not set up", async () => {
		expect((await ask({ model: "other" })).status).toBe(422);
		expect(aiConfigFromEnv({})).toBeNull();
		expect(aiConfigFromEnv({ WUPPY_AI_BASE_URL: "https://x/v1/", WUPPY_AI_MODELS: "a, b" })).toEqual({
			baseUrl: "https://x/v1",
			models: ["a", "b"],
		});
	});
});

const sse = (chunks: unknown[]) =>
	new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n", {
		headers: { "content-type": "text/event-stream" },
	});
const delta = (d: Record<string, unknown>) => ({ choices: [{ delta: d }] });

describe("streaming and saved chats", () => {
	it("streams text and steps, reassembling tool calls split across chunks", async () => {
		replies = [
			sse([
				delta({ tool_calls: [{ index: 0, id: "t1", function: { name: "list_", arguments: "" } }] }),
				delta({ tool_calls: [{ index: 0, function: { name: "sites", arguments: "{}" } }] }),
			]),
			sse([delta({ content: "Hepsi " }), delta({ content: "yolunda." })]),
		];
		const res = await ask({ stream: true });
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const text = await res.text();
		expect(provider[0]!.body.stream).toBe(true);
		expect(text).toMatch(/event: step\ndata: .*list_sites/);
		expect(text).toContain('"text":"yolunda."');
		const done = JSON.parse(/event: done\ndata: (.*)/.exec(text)![1]!) as { reply: string; chatId: string };
		expect(done.reply).toBe("Hepsi yolunda.");
		expect(done.chatId).toBeTruthy();
	});

	it("keeps each user's chats to themselves", async () => {
		replies = [{ content: "Merhaba" }];
		const { data } = (await (await ask({})).json()) as { data: { chatId: string } };
		const list = (await (await hub.request("/api/ai/chats")).json()) as { data: { id: string; title: string }[] };
		expect(list.data).toEqual([expect.objectContaining({ id: data.chatId, title: "Siteler nasıl?" })]);
		const saved = (await (await hub.request(`/api/ai/chats/${data.chatId}`)).json()) as {
			data: { turns: { content: string }[] };
		};
		expect(saved.data.turns.map((t) => t.content)).toEqual(["Siteler nasıl?", "Merhaba"]);
		me = client;
		expect((await hub.request(`/api/ai/chats/${data.chatId}`)).status).toBe(404);
		expect(((await (await hub.request("/api/ai/chats")).json()) as { data: unknown[] }).data).toEqual([]);
		// Continuing someone else's chat id starts a new chat instead of writing into theirs.
		replies = [{ content: "x" }];
		const other = (await (await ask({ chatId: data.chatId })).json()) as { data: { chatId: string } };
		expect(other.data.chatId).not.toBe(data.chatId);
		me = admin;
		expect((await hub.request(`/api/ai/chats/${data.chatId}`, { method: "DELETE", headers: H })).status).toBe(200);
	});
});

const complete = (body: Record<string, unknown>, headers: Record<string, string> = BEARER) =>
	hub.request("/api/v1/chat/completions", {
		method: "POST",
		headers,
		body: JSON.stringify({ model: "site-care", messages: [{ role: "user", content: "Durum?" }], ...body }),
	});

describe("OpenAI-compatible API", () => {
	it("lists agents as models and answers read-only, with the app's system prompt as context", async () => {
		const models = (await (await hub.request("/api/v1/models", { headers: BEARER })).json()) as {
			data: { id: string }[];
		};
		expect(models.data.map((m) => m.id)).toContain("site-care");
		replies = [{ content: "İyi." }];
		const res = await complete({
			messages: [
				{ role: "system", content: "Answer in one word." },
				{ role: "user", content: [{ type: "text", text: "Durum?" }] },
			],
		});
		expect(res.status).toBe(200);
		expect(((await res.json()) as { choices: { message: { content: string } }[] }).choices[0]!.message.content).toBe(
			"İyi.",
		);
		const sent = provider.at(-1)!.body;
		expect(sent.model).toBe("model-a");
		expect((sent.messages as { content: string }[])[0]!.content).toContain("Answer in one word.");
		expect(offeredTools()).not.toContain("email_site_member");
		expect((await complete({}, H)).status).toBe(401);
		expect((await complete({ model: "model-a" })).status).toBe(422);
	});

	it("streams OpenAI chunks ending with [DONE]", async () => {
		replies = [sse([delta({ content: "Tamam" })])];
		const text = await (await complete({ stream: true })).text();
		expect(text).toContain('"content":"Tamam"');
		expect(text).toContain('"finish_reason":"stop"');
		expect(text.trim().endsWith("data: [DONE]")).toBe(true);
	});
});

describe("site care", () => {
	it("scans a site from the outside and flags leaked private files", async () => {
		const scan = async () =>
			(
				(await (await hub.request(`/api/sites/${siteId}/scan`, { method: "POST", headers: H })).json()) as {
					data: { findings: { id: string; severity: string; title: string }[]; passed: string[] };
				}
			).data;
		const clean = await scan();
		expect(clean.findings.map((f) => f.id)).toContain("hsts");
		expect(clean.findings.map((f) => f.id)).not.toContain("private-files");
		leaked = ["/.env"];
		expect((await scan()).findings).toContainEqual(
			expect.objectContaining({ id: "private-files", severity: "high", title: expect.stringContaining("/.env") }),
		);
		me = client;
		expect((await hub.request(`/api/sites/${siteId}/scan`, { method: "POST", headers: H })).status).toBe(403);
	});

	it("builds a report from site data, printable as PDF, for members only", async () => {
		await callTool("create_draft", { site: siteId, collection: "posts", slug: "a", title: "A", body: "" });
		const res = await hub.request(`/api/sites/${siteId}/report`);
		const { data } = (await res.json()) as {
			data: { site: { name: string }; content: { collections: { name: string; draft: number }[] } };
		};
		expect(data.site.name).toBe("Müşteri 1");
		expect(data.content.collections).toEqual([expect.objectContaining({ name: "posts", draft: 1 })]);
		const html = await (await hub.request(`/api/sites/${siteId}/report?format=html`)).text();
		expect(html).toContain("Müşteri 1");
		expect(html).toContain("Save as PDF");
		expect((await hub.request(`/api/sites/${siteId}/report?month=2026-13`)).status).toBe(422);
		me = client;
		expect((await hub.request(`/api/sites/${siteId}/report`)).status).toBe(404);
		sites.setMember(siteId, "cli", "viewer");
		expect((await hub.request(`/api/sites/${siteId}/report`)).status).toBe(200);
	});

	it("sends the monthly report once, only to a member, starting next month", async () => {
		const put = (email: string | null) =>
			hub.request(`/api/sites/${siteId}/report-settings`, {
				method: "PUT",
				headers: H,
				body: JSON.stringify({ email }),
			});
		expect((await put("cli@x.test")).status).toBe(422);
		sites.setMember(siteId, "cli", "viewer");
		expect((await put("cli@x.test")).status).toBe(200);
		const sent: { to: string; subject: string; html: string }[] = [];
		const send = async (m: { to: string; subject: string; html: string }) => void sent.push(m);
		expect(await sendMonthlyReports(sites, net, send)).toBe(0);
		const next = new Date();
		next.setUTCMonth(next.getUTCMonth() + 1, 2);
		expect(await sendMonthlyReports(sites, net, send, next)).toBe(1);
		expect(await sendMonthlyReports(sites, net, send, next)).toBe(0);
		expect(sent[0]).toMatchObject({ to: "cli@x.test", subject: expect.stringContaining("Müşteri 1") });
	});

	it("the hourly round records failures and reports them as problems", async () => {
		expect(await careRound(sites, net)).not.toContainEqual(expect.stringContaining("reach"));
		const broken: SiteNetwork = { allowPrivate: true, fetch: async () => new Response("", { status: 401 }) };
		const problems = await careRound(sites, broken);
		expect(sites.get(siteId)!.status).toBe("connection_error");
		expect(problems.join("\n")).toContain("Müşteri 1");
	});
});
