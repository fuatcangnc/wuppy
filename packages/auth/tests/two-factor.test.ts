import { DatabaseSync } from "node:sqlite";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuth, migrateAuth, userFromRequest } from "../src/config/index.ts";

const PASSWORD = "correct-horse-battery";
let auth: ReturnType<typeof createAuth>;
let db: DatabaseSync;

beforeEach(async () => {
	db = new DatabaseSync(":memory:");
	auth = createAuth({
		db,
		secret: "x".repeat(40),
		baseURL: "http://localhost:4321",
		sendMagicLink: async () => {},
	});
	await migrateAuth(auth);
});

// Later Set-Cookie headers override earlier ones; cleared cookies (empty value) are dropped.
const jar = (...responses: Response[]) => {
	const map = new Map<string, string>();
	for (const r of responses) {
		for (const c of r.headers.getSetCookie()) {
			const [pair = ""] = c.split(";");
			const i = pair.indexOf("=");
			if (pair.slice(i + 1)) map.set(pair.slice(0, i), pair.slice(i + 1));
			else map.delete(pair.slice(0, i));
		}
	}
	return [...map].map(([k, v]) => `${k}=${v}`).join("; ");
};
const cookies = (res: Response) => jar(res);
const withCookie = (cookie: string) => new Headers({ cookie });
// The URI carries the secret base32-encoded; the OTP generator wants the raw secret.
const secretOf = (uri: string) => new TextDecoder().decode(base32.decode(new URL(uri).searchParams.get("secret")!));

const pendingMagicLinks = () =>
	(db.prepare("SELECT COUNT(*) AS n FROM verification WHERE identifier LIKE 'magic-link:%'").get() as { n: number }).n;

async function ownerWithTotp() {
	const signUp = await auth.api.signUpEmail({
		body: { email: "a@x.test", password: PASSWORD, name: "A" },
		asResponse: true,
	});
	const session = cookies(signUp);
	const enabled = (await auth.api.enableTwoFactor({
		body: { password: PASSWORD, method: "totp" },
		headers: withCookie(session),
	})) as { totpURI: string; backupCodes: string[] };
	const secret = secretOf(enabled.totpURI);
	const code = await createOTP(secret).totp();
	await auth.api.verifyTOTP({ body: { code }, headers: withCookie(session) });
	return { secret, backupCodes: enabled.backupCodes };
}

describe("two-factor (TOTP)", () => {
	it("after enabling, password alone no longer signs in", async () => {
		await ownerWithTotp();
		const res = await auth.api.signInEmail({ body: { email: "a@x.test", password: PASSWORD }, asResponse: true });
		expect(await res.clone().json()).toMatchObject({ twoFactorRedirect: true });
		const user = await userFromRequest(auth, new Request("http://localhost/x", { headers: withCookie(cookies(res)) }));
		expect(user).toBeNull();
	});

	it("a valid TOTP code completes the sign-in", async () => {
		const { secret } = await ownerWithTotp();
		const first = await auth.api.signInEmail({ body: { email: "a@x.test", password: PASSWORD }, asResponse: true });
		const pending = cookies(first);
		const code = await createOTP(secret).totp();
		const done = await auth.api.verifyTOTP({ body: { code }, headers: withCookie(pending), asResponse: true });
		expect(done.status).toBe(200);
		const user = await userFromRequest(
			auth,
			new Request("http://localhost/x", { headers: withCookie(jar(first, done)) }),
		);
		expect(user?.permissions).toContain("git:revert");
	});

	it("a wrong code is rejected", async () => {
		await ownerWithTotp();
		const first = await auth.api.signInEmail({ body: { email: "a@x.test", password: PASSWORD }, asResponse: true });
		await expect(
			auth.api.verifyTOTP({ body: { code: "000000" }, headers: withCookie(cookies(first)) }),
		).rejects.toBeTruthy();
	});

	it("invalidates pending magic links when two-factor is enabled", async () => {
		const signUp = await auth.api.signUpEmail({
			body: { email: "a@x.test", password: PASSWORD, name: "A" },
			asResponse: true,
		});
		const session = cookies(signUp);
		const enabled = (await auth.api.enableTwoFactor({
			body: { password: PASSWORD, method: "totp" },
			headers: withCookie(session),
		})) as { totpURI: string };

		const link = await auth.handler(
			new Request("http://localhost:4321/api/auth/sign-in/magic-link", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:4321",
					"x-wuppy-client-ip": "198.51.100.50",
				},
				body: JSON.stringify({ email: "a@x.test" }),
			}),
		);
		expect(link.status).toBe(200);

		expect(pendingMagicLinks()).toBe(1);

		const code = await createOTP(secretOf(enabled.totpURI)).totp();
		await auth.api.verifyTOTP({ body: { code }, headers: withCookie(session) });
		expect(pendingMagicLinks()).toBe(0);
	});

	it("a backup code works once", async () => {
		const { backupCodes } = await ownerWithTotp();
		const first = await auth.api.signInEmail({ body: { email: "a@x.test", password: PASSWORD }, asResponse: true });
		const pending = cookies(first);
		await auth.api.verifyBackupCode({ body: { code: backupCodes[0]! }, headers: withCookie(pending) });
		const second = await auth.api.signInEmail({ body: { email: "a@x.test", password: PASSWORD }, asResponse: true });
		await expect(
			auth.api.verifyBackupCode({ body: { code: backupCodes[0]! }, headers: withCookie(cookies(second)) }),
		).rejects.toBeTruthy();
	});
});
