import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capabilityHash } from "../../src/plugins/loader.ts";
import { createServer } from "../../src/server.ts";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-srv-"));
	await writeFile(
		join(root, "wuppy.config.mjs"),
		'export default { collections: [{ name: "posts", dir: "content/posts" }] };',
	);
});
afterEach(() => {
	vi.restoreAllMocks();
	return rm(root, { recursive: true, force: true });
});

// Each request pretends to come from its own client so the auth rate limiter (shared in-process) does not couple tests.
let ipCounter = 0;
const ip = () => `198.51.100.${++ipCounter % 250}`;
const H = { "X-Wuppy-Request": "1", "Content-Type": "application/json" };

async function signUp(app: Awaited<ReturnType<typeof createServer>>, email: string) {
	const res = await app.request("/api/auth/sign-up/email", {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: "http://localhost:4321", "x-wuppy-client-ip": ip() },
		body: JSON.stringify({ email, password: "correct-horse-battery", name: "N" }),
	});
	expect(res.status).toBe(200);
	return res.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");
}

describe("createServer", () => {
	it("GET /api/setup is public and flips after the first user", async () => {
		const app = await createServer({ root, secret: "s".repeat(40), baseURL: "http://localhost:4321" });
		expect(await (await app.request("/api/setup")).json()).toEqual({
			needsSetup: true,
			siteName: "Wuppy",
			siteUrl: "",
			socialProviders: [],
		});
		await signUp(app, "a@x.test");
		expect(await (await app.request("/api/setup")).json()).toEqual({
			needsSetup: false,
			siteName: "Wuppy",
			siteUrl: "",
			socialProviders: [],
		});
	});

	it("anonymous is rejected; first user (admin) can write; second (viewer) cannot", async () => {
		const app = await createServer({ root, secret: "s".repeat(40), baseURL: "http://localhost:4321" });
		expect((await app.request("/api/content/posts")).status).toBe(401);

		const admin = await signUp(app, "a@x.test");
		const put = await app.request("/api/content/posts/hello", {
			method: "PUT",
			headers: { ...H, cookie: admin },
			body: JSON.stringify({ data: { title: "Hi" }, body: "text\n" }),
		});
		expect(put.status).toBe(200);

		const closed = await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: "http://localhost:4321", "x-wuppy-client-ip": ip() },
			body: JSON.stringify({ email: "evil@x.test", password: "correct-horse-battery", name: "E" }),
		});
		expect(closed.status).toBe(403);

		const mk = await app.request("/api/auth/admin/create-user", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "http://localhost:4321",
				cookie: admin,
				"x-wuppy-client-ip": ip(),
			},
			body: JSON.stringify({ email: "b@x.test", password: "correct-horse-battery", name: "B", role: "viewer" }),
		});
		expect(mk.status).toBe(200);
		const login = await app.request("/api/auth/sign-in/email", {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: "http://localhost:4321", "x-wuppy-client-ip": ip() },
			body: JSON.stringify({ email: "b@x.test", password: "correct-horse-battery" }),
		});
		const viewer = login.headers
			.getSetCookie()
			.map((c) => c.split(";")[0])
			.join("; ");
		const read = await app.request("/api/content/posts/hello", { headers: { cookie: viewer } });
		expect(read.status).toBe(200);
		const denied = await app.request("/api/content/posts/hello", {
			method: "DELETE",
			headers: { ...H, cookie: viewer },
		});
		expect(denied.status).toBe(403);
	});

	it("invites a user, applies the role on acceptance and revokes pending links", async () => {
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		const app = await createServer({ root, secret: "s".repeat(40), baseURL: "http://localhost:4321" });
		const admin = await signUp(app, "owner@x.test");

		const conflict = await app.request("/api/invitations", {
			method: "POST",
			headers: { ...H, cookie: admin },
			body: JSON.stringify({ email: "owner@x.test", role: "editor" }),
		});
		expect(conflict.status).toBe(409);

		const badRole = await app.request("/api/invitations", {
			method: "POST",
			headers: { ...H, cookie: admin },
			body: JSON.stringify({ email: "bad@x.test", role: "superuser" }),
		});
		expect(badRole.status).toBe(422);

		const created = await app.request("/api/invitations", {
			method: "POST",
			headers: { ...H, cookie: admin },
			body: JSON.stringify({ email: "editor@x.test", role: "editor" }),
		});
		expect(created.status).toBe(201);
		const createdBody = (await created.json()) as {
			data: { email: string; role: string; expiresAt: string };
		};
		expect(createdBody.data).toMatchObject({ email: "editor@x.test", role: "editor" });
		expect(JSON.stringify(createdBody)).not.toContain("invite=");

		const text = info.mock.calls.map((call) => String(call[0])).join("\n");
		const token = /\/admin\/\?invite=([A-Za-z0-9_-]+)/.exec(text)?.[1];
		expect(token).toBeTruthy();

		const list = (await (await app.request("/api/invitations", { headers: { cookie: admin } })).json()) as {
			data: Array<{ id: string; email: string; role: string }>;
		};
		expect(list.data).toHaveLength(1);
		expect(list.data[0]).toMatchObject({ email: "editor@x.test", role: "editor" });

		const closed = await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: "http://localhost:4321", "x-wuppy-client-ip": ip() },
			body: JSON.stringify({ email: "editor@x.test", password: "correct-horse-battery", name: "Ed" }),
		});
		expect(closed.status).toBe(403);

		const acceptedSignUp = await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "http://localhost:4321",
				"x-wuppy-client-ip": ip(),
				"x-wuppy-invite": token!,
			},
			body: JSON.stringify({ email: "editor@x.test", password: "correct-horse-battery", name: "Ed" }),
		});
		expect(acceptedSignUp.status).toBe(200);
		const editor = acceptedSignUp.headers
			.getSetCookie()
			.map((cookie) => cookie.split(";")[0])
			.join("; ");

		const accept = await app.request("/api/invitations/accept", {
			method: "POST",
			headers: { ...H, cookie: editor },
			body: JSON.stringify({ token }),
		});
		expect(accept.status).toBe(200);
		expect(await accept.json()).toEqual({ data: { ok: true, role: "editor" } });

		const session = (await (await app.request("/api/auth/get-session", { headers: { cookie: editor } })).json()) as {
			user?: { role?: string };
		};
		expect(session.user?.role).toBe("editor");

		const write = await app.request("/api/content/posts/hello", {
			method: "PUT",
			headers: { ...H, cookie: editor },
			body: JSON.stringify({ data: { title: "Hi" }, body: "text\n" }),
		});
		expect(write.status).toBe(200);
		expect((await app.request("/api/invitations", { headers: { cookie: editor } })).status).toBe(403);

		const pending = (await (await app.request("/api/invitations", { headers: { cookie: admin } })).json()) as {
			data: unknown[];
		};
		expect(pending.data).toEqual([]);

		const reused = await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "http://localhost:4321",
				"x-wuppy-client-ip": ip(),
				"x-wuppy-invite": token!,
			},
			body: JSON.stringify({ email: "other@x.test", password: "correct-horse-battery", name: "Other" }),
		});
		expect(reused.status).toBe(403);

		const second = await app.request("/api/invitations", {
			method: "POST",
			headers: { ...H, cookie: admin },
			body: JSON.stringify({ email: "revoked@x.test", role: "viewer" }),
		});
		expect(second.status).toBe(201);
		const secondTokens = [
			...info.mock.calls
				.map((call) => String(call[0]))
				.join("\n")
				.matchAll(/\/admin\/\?invite=([A-Za-z0-9_-]+)/g),
		].map((match) => match[1]);
		const secondToken = secondTokens.at(-1);
		expect(secondToken).toBeTruthy();
		const anonymousAccept = await app.request("/api/invitations/accept", {
			method: "POST",
			headers: H,
			body: JSON.stringify({ token: secondToken }),
		});
		expect(anonymousAccept.status).toBe(401);
		const wrongPersonAccept = await app.request("/api/invitations/accept", {
			method: "POST",
			headers: { ...H, cookie: editor },
			body: JSON.stringify({ token: secondToken }),
		});
		expect(wrongPersonAccept.status).toBe(400);
		const secondList = (await (await app.request("/api/invitations", { headers: { cookie: admin } })).json()) as {
			data: Array<{ id: string; email: string }>;
		};
		const invite = secondList.data.find((row) => row.email === "revoked@x.test");
		expect(invite).toBeTruthy();
		const revoke = await app.request(`/api/invitations/${invite!.id}`, {
			method: "DELETE",
			headers: { ...H, cookie: admin },
		});
		expect(revoke.status).toBe(200);
		expect((await (await app.request("/api/invitations", { headers: { cookie: admin } })).json()).data).toEqual([]);
	});

	it("runs an approved plugin when content is saved, logging its egress", async () => {
		const manifest = {
			id: "ping",
			version: "1.0.0",
			hooks: ["onContentUpdated"],
			capabilities: { network: [{ host: "hooks.example.com", methods: ["POST"] }] },
		};
		await mkdir(join(root, "plugins/ping"), { recursive: true });
		await writeFile(join(root, "plugins/ping/manifest.json"), JSON.stringify(manifest));
		await writeFile(
			join(root, "plugins/ping/plugin.js"),
			'globalThis.__plugin = { onContentUpdated: (e, ctx) => ctx.fetch("https://hooks.example.com/p", { method: "POST", body: e.slug }) };',
		);
		await writeFile(
			join(root, "wuppy.config.mjs"),
			`export default { collections: [{ name: "posts", dir: "content/posts" }], plugins: [{ dir: "plugins/ping", approve: "${capabilityHash(manifest)}" }] };`,
		);
		const logs: string[] = [];
		const fetched: string[] = [];
		const app = await createServer({
			root,
			secret: "s".repeat(40),
			baseURL: "http://localhost:4321",
			log: (m) => logs.push(m),
			pluginFetch: async (url) => (fetched.push(url), { status: 200, body: "" }),
		});
		const cookie = await signUp(app, "a@x.test");
		await app.request("/api/content/posts/hi", {
			method: "PUT",
			headers: { ...H, cookie },
			body: JSON.stringify({ data: {}, body: "x" }),
		});
		await vi.waitFor(() => expect(fetched).toEqual(["https://hooks.example.com/p"]));
		expect(logs.some((l) => l.includes("egress POST https://hooks.example.com/p"))).toBe(true);
	});
});
