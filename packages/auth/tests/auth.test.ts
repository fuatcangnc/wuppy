import { DatabaseSync } from "node:sqlite";
import { getMigrations } from "better-auth/db/migration";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuth, needsSetup, userFromRequest, type AuditEvent } from "../src/config/index.ts";
import { createInvitation, findValidInvitation } from "../src/invitations/index.ts";

let auth: ReturnType<typeof createAuth>;
let db: DatabaseSync;
let events: AuditEvent[];
beforeEach(async () => {
	db = new DatabaseSync(":memory:");
	events = [];
	auth = createAuth({
		db,
		onAuditEvent: (e) => events.push(e),
		secret: "x".repeat(40),
		baseURL: "http://localhost:4321",
	});
	await (await getMigrations(auth.options)).runMigrations();
});

const bearer = (res: Response) =>
	res.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");

const makeAuth = (deliveries: Array<{ email: string; url: string }>) =>
	createAuth({
		db,
		secret: "x".repeat(40),
		baseURL: "http://localhost:4321",
		sendMagicLink: async (input) => {
			deliveries.push(input);
		},
	});

const requestMagicLink = (instance: ReturnType<typeof createAuth>, email: string) =>
	instance.handler(
		new Request("http://localhost:4321/api/auth/sign-in/magic-link", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "http://localhost:4321",
				"x-wuppy-client-ip": "198.51.100.40",
			},
			body: JSON.stringify({ email, callbackURL: "/admin/" }),
		}),
	);

const attempt = (ip: string) =>
	auth.handler(
		new Request("http://localhost:4321/api/auth/sign-in/email", {
			method: "POST",
			headers: { "content-type": "application/json", origin: "http://localhost:4321", "x-wuppy-client-ip": ip },
			body: JSON.stringify({ email: "a@x.test", password: "wrong-password-123" }),
		}),
	);

const attemptSignUp = (email: string, invite?: string) =>
	auth.handler(
		new Request("http://localhost:4321/api/auth/sign-up/email", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "http://localhost:4321",
				...(invite ? { "x-wuppy-invite": invite } : {}),
			},
			body: JSON.stringify({ email, password: "correct-horse-battery", name: email }),
		}),
	);

async function signUp(email: string) {
	const res = await auth.api.signUpEmail({
		body: { email, password: "correct-horse-battery", name: email },
		asResponse: true,
	});
	expect(res.status).toBe(200);
	const cookie = res.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");
	return new Request("http://localhost:4321/api/x", { headers: { cookie } });
}

describe("auth", () => {
	it("first user becomes admin", async () => {
		const first = await userFromRequest(auth, await signUp("a@x.test"));
		expect(first?.permissions).toContain("git:revert");
	});

	it("public sign-up closes after the first user", async () => {
		await signUp("a@x.test");
		await expect(
			auth.api.signUpEmail({ body: { email: "b@x.test", password: "correct-horse-battery", name: "b" } }),
		).rejects.toMatchObject({ statusCode: 403 });
	});

	describe("magic links", () => {
		it("never creates accounts or emails unknown addresses", async () => {
			const deliveries: Array<{ email: string; url: string }> = [];
			const instance = makeAuth(deliveries);
			const response = await requestMagicLink(instance, "unknown@x.test");
			expect(response.status).toBe(200);
			expect(deliveries).toHaveLength(0);
			expect(db.prepare("SELECT id FROM user WHERE email = ?").get("unknown@x.test")).toBeUndefined();
		});

		it("sends a link to an existing account", async () => {
			const deliveries: Array<{ email: string; url: string }> = [];
			const instance = makeAuth(deliveries);
			await instance.api.signUpEmail({
				body: { email: "a@x.test", password: "correct-horse-battery", name: "A" },
			});

			const response = await requestMagicLink(instance, "a@x.test");
			expect(response.status).toBe(200);
			expect(deliveries).toHaveLength(1);
			expect(deliveries[0]?.email).toBe("a@x.test");
			expect(deliveries[0]?.url).toContain("/api/auth/magic-link/verify");
		});

		it("does not send a link when two-factor is enabled", async () => {
			const deliveries: Array<{ email: string; url: string }> = [];
			const instance = makeAuth(deliveries);
			await instance.api.signUpEmail({
				body: { email: "a@x.test", password: "correct-horse-battery", name: "A" },
			});
			db.prepare("UPDATE user SET twoFactorEnabled = 1 WHERE email = ?").run("a@x.test");

			const response = await requestMagicLink(instance, "a@x.test");
			expect(response.status).toBe(200);
			expect(deliveries).toHaveLength(0);
		});
	});

	it("replacing a pending invitation invalidates the old token", () => {
		const first = createInvitation(db, { email: "a@x.test", role: "viewer" });
		const second = createInvitation(db, { email: "a@x.test", role: "editor" });
		expect(findValidInvitation(db, first.token)).toBeNull();
		expect(findValidInvitation(db, second.token, "a@x.test")?.role).toBe("editor");
	});

	it("does not let an invited sign-up choose its own role", async () => {
		await signUp("a@x.test");
		const { token } = createInvitation(db, { email: "b@x.test", role: "viewer" });
		const res = await auth.handler(
			new Request("http://localhost:4321/api/auth/sign-up/email", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:4321",
					"x-wuppy-invite": token,
				},
				body: JSON.stringify({
					email: "b@x.test",
					password: "correct-horse-battery",
					name: "B",
					role: "admin",
				}),
			}),
		);
		const body = await res.text();
		expect(res.status).toBe(400);
		expect(body).toContain("role is not allowed to be set");
		expect(db.prepare("SELECT id FROM user WHERE email = ?").get("b@x.test")).toBeUndefined();
	});

	it("allows sign-up only with a matching, unexpired invitation", async () => {
		await signUp("a@x.test");
		const { token } = createInvitation(db, { email: "b@x.test", role: "editor", invitedBy: "owner" });

		expect((await attemptSignUp("b@x.test")).status).toBe(403);
		expect((await attemptSignUp("other@x.test", token)).status).toBe(403);
		expect((await attemptSignUp("b@x.test", token)).status).toBe(200);
		expect(findValidInvitation(db, token, "b@x.test")).not.toBeNull();
		const invitedUser = db.prepare("SELECT role FROM user WHERE email = ?").get("b@x.test") as { role: string };
		expect(invitedUser.role).toBe("viewer");

		const expired = createInvitation(db, { email: "c@x.test", role: "viewer", ttlMs: -1_000 });
		expect((await attemptSignUp("c@x.test", expired.token)).status).toBe(403);
	});

	it("an admin can still add users, who start as viewers", async () => {
		const adminReq = await signUp("a@x.test");
		await auth.api.createUser({
			body: { email: "b@x.test", password: "correct-horse-battery", name: "b", role: "viewer" as "user" },
			headers: adminReq.headers,
		});
		const res = await auth.api.signInEmail({
			body: { email: "b@x.test", password: "correct-horse-battery" },
			asResponse: true,
		});
		const viewer = await userFromRequest(auth, new Request("http://localhost/x", { headers: { cookie: bearer(res) } }));
		expect(viewer?.permissions).toEqual(["content:read"]);
	});

	it("blocks demoting the last active admin", async () => {
		const adminReq = await signUp("a@x.test");
		const adminId = (db.prepare("SELECT id FROM user WHERE email = ?").get("a@x.test") as { id: string }).id;
		await expect(
			auth.api.setRole({ body: { userId: adminId, role: "viewer" as "user" }, headers: adminReq.headers }),
		).rejects.toMatchObject({ statusCode: 400 });
		expect((db.prepare("SELECT role FROM user WHERE id = ?").get(adminId) as { role: string }).role).toBe("admin");

		await expect(
			auth.api.adminUpdateUser({
				body: { userId: adminId, data: { role: ["viewer"] } },
				headers: adminReq.headers,
			}),
		).rejects.toMatchObject({ statusCode: 400 });
		expect((db.prepare("SELECT role FROM user WHERE id = ?").get(adminId) as { role: string }).role).toBe("admin");
	});

	it("allows demoting an admin when another active admin remains", async () => {
		const adminReq = await signUp("a@x.test");
		const adminId = (db.prepare("SELECT id FROM user WHERE email = ?").get("a@x.test") as { id: string }).id;
		await auth.api.createUser({
			body: { email: "b@x.test", password: "correct-horse-battery", name: "b", role: "admin" as "user" },
			headers: adminReq.headers,
		});
		await auth.api.setRole({ body: { userId: adminId, role: "viewer" as "user" }, headers: adminReq.headers });
		expect((db.prepare("SELECT role FROM user WHERE id = ?").get(adminId) as { role: string }).role).toBe("viewer");
	});

	it("reports whether setup is needed", async () => {
		expect(needsSetup(db)).toBe(true);
		await signUp("a@x.test");
		expect(needsSetup(db)).toBe(false);
	});

	it("applies a custom session lifetime", async () => {
		const policyDb = new DatabaseSync(":memory:");
		const policyAuth = createAuth({
			db: policyDb,
			secret: "x".repeat(40),
			baseURL: "http://localhost:4321",
			session: { expiresIn: 3_600, updateAge: 600 },
		});
		await (await getMigrations(policyAuth.options)).runMigrations();
		const res = await policyAuth.api.signUpEmail({
			body: { email: "policy@x.test", password: "correct-horse-battery", name: "P" },
			asResponse: true,
		});
		expect(res.status).toBe(200);
		const row = policyDb.prepare("SELECT expiresAt FROM session LIMIT 1").get() as { expiresAt: string | number };
		const remaining = new Date(row.expiresAt).getTime() - Date.now();
		expect(remaining).toBeGreaterThan(3_500_000);
		expect(remaining).toBeLessThan(3_700_000);
	});

	it("migrates passkeys and exposes RP options only after sign-in", async () => {
		const passkeyDb = new DatabaseSync(":memory:");
		const passkeyAuth = createAuth({
			db: passkeyDb,
			secret: "x".repeat(40),
			baseURL: "http://localhost:4321",
			passkey: { rpID: "localhost", rpName: "Wuppy Test" },
		});
		await (await getMigrations(passkeyAuth.options)).runMigrations();
		expect(
			passkeyDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'passkey'").get(),
		).toBeTruthy();

		const signUpRes = await passkeyAuth.api.signUpEmail({
			body: { email: "passkey@x.test", password: "correct-horse-battery", name: "Passkey User" },
			asResponse: true,
		});
		expect(signUpRes.status).toBe(200);
		const cookie = bearer(signUpRes);
		const optionsRes = await passkeyAuth.handler(
			new Request("http://localhost:4321/api/auth/passkey/generate-register-options", {
				headers: { cookie, origin: "http://localhost:4321" },
			}),
		);
		expect(optionsRes.status).toBe(200);
		expect(await optionsRes.json()).toMatchObject({ rp: { id: "localhost", name: "Wuppy Test" } });

		const unauth = await passkeyAuth.handler(new Request("http://localhost:4321/api/auth/passkey/list-user-passkeys"));
		expect(unauth.status).toBe(401);
	});

	it("offers OAuth sign-in and linking while keeping implicit sign-up off", async () => {
		const oauthDb = new DatabaseSync(":memory:");
		const oauthAuth = createAuth({
			db: oauthDb,
			secret: "x".repeat(40),
			baseURL: "http://localhost:4321",
			socialProviders: { github: { clientId: "client-id", clientSecret: "client-secret" } },
		});
		await (await getMigrations(oauthAuth.options)).runMigrations();
		const signUpRes = await oauthAuth.api.signUpEmail({
			body: { email: "oauth@x.test", password: "correct-horse-battery", name: "OAuth User" },
			asResponse: true,
		});
		expect(signUpRes.status).toBe(200);
		const cookie = bearer(signUpRes);

		const signInRes = await oauthAuth.handler(
			new Request("http://localhost:4321/api/auth/sign-in/social", {
				method: "POST",
				headers: { "content-type": "application/json", origin: "http://localhost:4321" },
				body: JSON.stringify({ provider: "github", callbackURL: "http://localhost:4321/admin/" }),
			}),
		);
		expect(signInRes.status).toBe(200);
		const signInBody = (await signInRes.json()) as { url?: string; redirect?: boolean };
		expect(signInBody.redirect).toBe(true);
		expect(signInBody.url).toContain("github.com/login/oauth/authorize");

		const linkRes = await oauthAuth.handler(
			new Request("http://localhost:4321/api/auth/link-social", {
				method: "POST",
				headers: { "content-type": "application/json", origin: "http://localhost:4321", cookie },
				body: JSON.stringify({ provider: "github", callbackURL: "http://localhost:4321/admin/security" }),
			}),
		);
		expect(linkRes.status).toBe(200);
		const linkBody = (await linkRes.json()) as { url?: string; redirect?: boolean };
		expect(linkBody.redirect).toBe(true);
		expect(linkBody.url).toContain("github.com/login/oauth/authorize");

		const unknown = await oauthAuth.handler(
			new Request("http://localhost:4321/api/auth/sign-in/social", {
				method: "POST",
				headers: { "content-type": "application/json", origin: "http://localhost:4321" },
				body: JSON.stringify({ provider: "gitlab", callbackURL: "http://localhost:4321/admin/" }),
			}),
		);
		expect(unknown.status).toBe(404);
		expect(
			(oauthAuth.options.account as { accountLinking?: { disableImplicitLinking?: boolean } }).accountLinking
				?.disableImplicitLinking,
		).toBe(true);
	});

	it("links OAuth explicitly, blocks implicit linking and keeps OAuth sign-up closed", async () => {
		const oauthDb = new DatabaseSync(":memory:");
		const oauthAuth = createAuth({
			db: oauthDb,
			secret: "x".repeat(40),
			baseURL: "http://localhost:4321",
			socialProviders: { github: { clientId: "client-id", clientSecret: "client-secret" } },
		});
		await (await getMigrations(oauthAuth.options)).runMigrations();
		const signUpRes = await oauthAuth.api.signUpEmail({
			body: { email: "oauth@x.test", password: "correct-horse-battery", name: "OAuth User" },
			asResponse: true,
		});
		expect(signUpRes.status).toBe(200);
		const sessionCookie = bearer(signUpRes);

		let providerEmail = "oauth@x.test";
		let providerAccountId = 991;
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (input: string | URL | Request) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
			if (url.startsWith("https://github.com/login/oauth/access_token")) {
				return Response.json({ access_token: "github-token", token_type: "bearer", scope: "read:user,user:email" });
			}
			if (url === "https://api.github.com/user/emails") {
				return Response.json([{ email: providerEmail, primary: true, verified: true }]);
			}
			if (url === "https://api.github.com/user") {
				return Response.json({
					id: providerAccountId,
					login: "oauth-user",
					name: "OAuth User",
					email: providerEmail,
					avatar_url: "",
				});
			}
			throw new Error(`Unexpected OAuth fetch: ${url}`);
		}) as typeof fetch;

		const start = async (path: "sign-in/social" | "link-social", body: Record<string, unknown>, cookie = "") => {
			const res = await oauthAuth.handler(
				new Request(`http://localhost:4321/api/auth/${path}`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: "http://localhost:4321",
						...(cookie ? { cookie } : {}),
					},
					body: JSON.stringify(body),
				}),
			);
			expect(res.status).toBe(200);
			const data = (await res.json()) as { url?: string };
			const state = data.url ? new URL(data.url).searchParams.get("state") : null;
			if (!state) throw new Error("OAuth start did not return state");
			return { state, cookie: [cookie, bearer(res)].filter(Boolean).join("; ") };
		};

		const callback = async (state: string, cookie: string) => {
			const res = await oauthAuth.handler(
				new Request(
					`http://localhost:4321/api/auth/callback/github?code=test-code&state=${encodeURIComponent(state)}`,
					{ headers: { origin: "http://localhost:4321", cookie } },
				),
			);
			return { status: res.status, location: res.headers.get("location") ?? "" };
		};

		try {
			const signInStart = await start("sign-in/social", {
				provider: "github",
				callbackURL: "http://localhost:4321/admin/",
				errorCallbackURL: "http://localhost:4321/admin/?oauth_error=1",
			});
			const unlinked = await callback(signInStart.state, signInStart.cookie);
			expect(unlinked.status).toBe(302);
			expect(unlinked.location).toContain("error=account_not_linked");
			expect(oauthDb.prepare("SELECT userId FROM account WHERE providerId = ?").all("github")).toHaveLength(0);

			const linkStart = await start(
				"link-social",
				{ provider: "github", callbackURL: "http://localhost:4321/admin/security" },
				sessionCookie,
			);
			const linked = await callback(linkStart.state, linkStart.cookie);
			expect(linked.status).toBe(302);
			expect(linked.location).toContain("/admin/security");
			const linkedAccounts = oauthDb.prepare("SELECT userId FROM account WHERE providerId = ?").all("github") as {
				userId: string;
			}[];
			expect(linkedAccounts).toHaveLength(1);
			const localUser = oauthDb.prepare('SELECT id FROM "user" WHERE email = ?').get("oauth@x.test") as {
				id: string;
			};
			expect(linkedAccounts[0]?.userId).toBe(localUser.id);

			const signInAfterLink = await start("sign-in/social", {
				provider: "github",
				callbackURL: "http://localhost:4321/admin/",
			});
			const signedIn = await callback(signInAfterLink.state, signInAfterLink.cookie);
			expect(signedIn.status).toBe(302);
			expect(signedIn.location).toContain("/admin/");

			providerEmail = "new-oauth@x.test";
			providerAccountId = 992;
			const newUserStart = await start("sign-in/social", {
				provider: "github",
				callbackURL: "http://localhost:4321/admin/",
				errorCallbackURL: "http://localhost:4321/admin/?oauth_error=1",
			});
			const blocked = await callback(newUserStart.state, newUserStart.cookie);
			console.error(
				"OAUTH DEBUG",
				blocked,
				oauthDb.prepare('SELECT email FROM "user"').all(),
				oauthDb.prepare("SELECT providerId, accountId, userId FROM account").all(),
			);
			expect(blocked.status).toBe(302);
			expect(blocked.location).toContain("error=signup_disabled");
			expect(oauthDb.prepare('SELECT id FROM "user" WHERE email = ?').get("new-oauth@x.test")).toBeUndefined();
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("no session means no user", async () => {
		expect(await userFromRequest(auth, new Request("http://localhost:4321/api/x"))).toBeNull();
	});

	it("rejects short secrets", () => {
		expect(() =>
			createAuth({ db: new DatabaseSync(":memory:"), secret: "short", baseURL: "http://localhost" }),
		).toThrow(/secret/i);
	});

	it("records sign-up, failed and successful sign-in, and admin user creation", async () => {
		const adminReq = await signUp("a@x.test");
		await auth.api.signInEmail({ body: { email: "a@x.test", password: "wrong-password-123" } }).catch(() => {});
		await auth.api.signInEmail({ body: { email: "a@x.test", password: "correct-horse-battery" } });
		await auth.api.createUser({
			body: { email: "b@x.test", password: "correct-horse-battery", name: "b", role: "viewer" as "user" },
			headers: adminReq.headers,
		});
		expect(events.map((e) => [e.type, e.ok])).toEqual([
			["auth.sign_up", true],
			["auth.sign_in", false],
			["auth.sign_in", true],
			["user.create", true],
		]);
		expect(events.at(-1)).toMatchObject({ email: "b@x.test" });
		expect(events.at(-1)?.actor).toBeTruthy();
		expect(JSON.stringify(events)).not.toContain("correct-horse-battery");
	});

	it("a failing audit sink never breaks authentication", async () => {
		const a = createAuth({
			db,
			secret: "x".repeat(40),
			baseURL: "http://localhost",
			onAuditEvent: () => {
				throw new Error("disk full");
			},
		});
		await (await import("../src/config/index.ts")).migrateAuth(a);
		const res = await a.api.signUpEmail({ body: { email: "c@x.test", password: "correct-horse-battery", name: "c" } });
		expect(res.user.email).toBe("c@x.test");
	});

	it("throttles repeated sign-in attempts per client", async () => {
		await signUp("a@x.test");
		const statuses: number[] = [];
		for (let i = 0; i < 8; i++) statuses.push((await attempt("203.0.113.9")).status);
		expect(statuses.slice(0, 5)).not.toContain(429);
		expect(statuses.at(-1)).toBe(429);
		expect((await attempt("203.0.113.77")).status).not.toBe(429);
	});

	it("emails a reset link and changes the password", async () => {
		const sent: { email: string; url: string; token: string }[] = [];
		const resetAuth = createAuth({
			db: new DatabaseSync(":memory:"),
			secret: "x".repeat(40),
			baseURL: "http://localhost:4321",
			sendResetPassword: async (input) => {
				sent.push(input);
			},
		});
		await (await getMigrations(resetAuth.options)).runMigrations();
		await resetAuth.api.signUpEmail({
			body: { email: "r@x.test", password: "old-password-123", name: "R" },
		});

		const requested = await resetAuth.api.requestPasswordReset({
			body: { email: "r@x.test", redirectTo: "http://localhost:4321/admin/" },
		});
		expect(requested.status).toBe(true);
		expect(sent).toHaveLength(1);
		expect(sent[0]?.email).toBe("r@x.test");
		expect(sent[0]?.url).toContain("/reset-password/");
		expect(sent[0]?.token).toBeTruthy();

		const reset = await resetAuth.api.resetPassword({
			body: { newPassword: "new-password-123", token: sent[0]!.token },
		});
		expect(reset.status).toBe(true);

		const signIn = (password: string) =>
			resetAuth.handler(
				new Request("http://localhost:4321/api/auth/sign-in/email", {
					method: "POST",
					headers: { "content-type": "application/json", origin: "http://localhost:4321" },
					body: JSON.stringify({ email: "r@x.test", password }),
				}),
			);
		expect((await signIn("old-password-123")).status).toBe(401);
		expect((await signIn("new-password-123")).status).toBe(200);

		const unknown = await resetAuth.api.requestPasswordReset({
			body: { email: "missing@x.test", redirectTo: "http://localhost:4321/admin/" },
		});
		expect(unknown.status).toBe(true);
		expect(sent).toHaveLength(1);
	});
});
