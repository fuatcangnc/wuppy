import { atom } from "nanostores";
import { api } from "../lib/api.ts";

export interface SessionUser {
	id: string;
	email: string;
	name: string;
	role?: string | null;
	twoFactorEnabled?: boolean | null;
}
export type Session =
	| { status: "loading" }
	| { status: "error"; message: string }
	| {
			status: "anon";
			needsSetup: boolean;
			setup?: { siteName?: string; siteUrl?: string };
			twoFactor?: true;
			error?: string;
	  }
	| { status: "authed"; user: SessionUser };

export const $session = atom<Session>({ status: "loading" });
/** OAuth providers configured on the server, exposed for login/linking UI. */
export const $socialProviders = atom<string[]>([]);

export async function loadSession(): Promise<void> {
	try {
		const [{ needsSetup, siteName, siteUrl, socialProviders }, current] = await Promise.all([
			api<{ needsSetup: boolean; siteName?: string; siteUrl?: string; socialProviders?: string[] }>(
				"GET",
				"/api/setup",
			),
			api<{ user: SessionUser } | null>("GET", "/api/auth/get-session"),
		]);
		$socialProviders.set(Array.isArray(socialProviders) ? socialProviders : []);
		const setup = needsSetup && (siteName || siteUrl) ? { siteName, siteUrl } : undefined;
		$session.set(
			current?.user
				? { status: "authed", user: current.user }
				: { status: "anon", needsSetup, ...(setup ? { setup } : {}) },
		);
	} catch (e) {
		$session.set({ status: "error", message: (e as Error).message });
	}
}

async function authenticate(path: string, body: Record<string, string>): Promise<void> {
	try {
		const res = await api<{ twoFactorRedirect?: boolean } | null>("POST", path, body);
		if (res?.twoFactorRedirect) {
			const prev = $session.get();
			$session.set({
				status: "anon",
				needsSetup: prev.status === "anon" && prev.needsSetup,
				...(prev.status === "anon" && prev.setup ? { setup: prev.setup } : {}),
				twoFactor: true,
			});
			return;
		}
		await loadSession();
	} catch (e) {
		fail((e as Error).message);
	}
}

function fail(error: string, twoFactor = false): void {
	const prev = $session.get();
	$session.set({
		status: "anon",
		needsSetup: prev.status === "anon" && prev.needsSetup,
		...(prev.status === "anon" && prev.setup ? { setup: prev.setup } : {}),
		...(twoFactor || (prev.status === "anon" && prev.twoFactor) ? { twoFactor: true as const } : {}),
		error,
	});
}

/** Second step of sign-in when the account has two-factor enabled. */
export async function verifyCode(code: string, backup = false): Promise<void> {
	try {
		await api("POST", backup ? "/api/auth/two-factor/verify-backup-code" : "/api/auth/two-factor/verify-totp", {
			code,
		});
		await loadSession();
	} catch (e) {
		fail((e as Error).message, true);
	}
}

export const signIn = (email: string, password: string) => authenticate("/api/auth/sign-in/email", { email, password });
export const signUp = (name: string, email: string, password: string) =>
	authenticate("/api/auth/sign-up/email", { name, email, password });

export async function signOut(): Promise<void> {
	await api("POST", "/api/auth/sign-out", {});
	await loadSession();
}
