// Passkeys pull in tsyringe, which throws unless this polyfill ran first; bundlers may otherwise order it after.
import "reflect-metadata";
import type { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { admin, magicLink, twoFactor } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import type { SocialProviders } from "better-auth/social-providers";
import { ensureInvitationTable, findValidInvitation } from "../invitations/index.ts";
import { isLastAdminChange, LAST_ADMIN_MESSAGE } from "../last-admin.ts";
import { permissionsFor } from "../permissions/index.ts";

export const SOCIAL_PROVIDER_IDS = ["github", "google", "microsoft"] as const;
export type SocialProviderId = (typeof SOCIAL_PROVIDER_IDS)[number];
export interface SocialProviderConfig {
	clientId: string;
	clientSecret: string;
	/** Google Workspace hosted domain restriction. */
	hd?: string;
	/** Microsoft Entra ID tenant; defaults to "common" when omitted. */
	tenantId?: string;
}
export type SocialProvidersConfig = Partial<Record<SocialProviderId, SocialProviderConfig>>;

export interface AuthOptions {
	db: DatabaseSync;
	secret: string;
	baseURL: string;
	/** Silence Better Auth's own logger (used for the migration-only instance). */
	quiet?: boolean;
	/** Called for security-relevant events. Must not throw; errors are swallowed so auth never breaks. */
	onAuditEvent?: (event: AuditEvent) => void;
	/** Magic-link delivery. Defaults to a console log in development. */
	sendMagicLink?: (input: { email: string; url: string }) => Promise<void>;
	/** Password-reset delivery. When unset, Better Auth rejects reset requests. */
	sendResetPassword?: (input: { email: string; url: string; token: string }) => Promise<void>;
	/** Absolute lifetime and refresh interval for sessions, in seconds. */
	session?: { expiresIn: number; updateAge: number };
	/** WebAuthn relying-party settings. */
	passkey?: { rpID?: string; rpName?: string; origin?: string | string[] };
	/** Optional OAuth identity providers. New OAuth users are always rejected. */
	socialProviders?: SocialProvidersConfig;
}

export interface AuditEvent {
	type: string;
	ok: boolean;
	/** User id performing the action (the new user's id for sign-up/sign-in). */
	actor?: string;
	/** Email the action targeted. Never the password. */
	email?: string;
	/** Short non-secret context, e.g. `POST /api/media → 201` for a managed-site write. */
	detail?: string;
	at: string;
}

const TRACKED: Record<string, string> = {
	"/sign-up/email": "auth.sign_up",
	"/sign-in/email": "auth.sign_in",
	"/sign-out": "auth.sign_out",
	"/two-factor/enable": "auth.2fa_enable",
	"/two-factor/disable": "auth.2fa_disable",
	"/two-factor/verify-totp": "auth.2fa_verify",
	"/two-factor/verify-backup-code": "auth.2fa_backup_code",
	"/passkey/verify-registration": "auth.passkey_add",
	"/passkey/verify-authentication": "auth.passkey_sign_in",
	"/passkey/delete-passkey": "auth.passkey_delete",
	"/passkey/update-passkey": "auth.passkey_update",
	"/admin/create-user": "user.create",
	"/admin/set-role": "user.set_role",
	"/admin/update-user": "user.update",
	"/admin/set-user-password": "user.set_password",
	"/admin/ban-user": "user.ban",
	"/admin/revoke-user-session": "user.revoke_session",
	"/admin/revoke-user-sessions": "user.revoke_sessions",
	"/admin/remove-user": "user.remove",
};

const countUsers = (db: DatabaseSync) => (db.prepare("SELECT COUNT(*) AS n FROM user").get() as { n: number }).n;

/** Invalidates pending magic links for one account after two-factor is enabled. */
function deleteMagicLinksForEmail(db: DatabaseSync, email: string): void {
	const rows = db
		.prepare("SELECT identifier, value FROM verification WHERE identifier LIKE 'magic-link:%'")
		.all() as Array<{ identifier: string; value: string }>;
	const remove = db.prepare("DELETE FROM verification WHERE identifier = ?");
	for (const row of rows) {
		try {
			const parsed = JSON.parse(row.value) as { email?: unknown };
			if (typeof parsed.email === "string" && parsed.email.toLowerCase() === email.toLowerCase()) {
				remove.run(row.identifier);
			}
		} catch {
			// Ignore unrelated or malformed verification records.
		}
	}
}

/** True until the first account exists (the setup screen creates it). */
export const needsSetup = (db: DatabaseSync): boolean => countUsers(db) === 0;

export function createAuth({
	db,
	secret,
	baseURL,
	quiet,
	onAuditEvent,
	sendMagicLink,
	sendResetPassword,
	session: sessionPolicy,
	passkey: passkeyOptions,
	socialProviders,
}: AuthOptions) {
	if (secret.length < 32) throw new Error("Auth secret must be at least 32 characters");
	ensureInvitationTable(db);
	const origin = new URL(baseURL);
	const socialIds = Object.keys(socialProviders ?? {}) as SocialProviderId[];
	// OAuth is a sign-in method for explicitly linked accounts, never a public
	// registration path; the invite gate therefore stays intact.
	const oauthProviders = socialProviders
		? (Object.fromEntries(
				socialIds.map((id) => [id, { ...socialProviders[id], disableSignUp: true, disableImplicitSignUp: true }]),
			) as SocialProviders)
		: undefined;
	const trustedOrigins = [baseURL];
	// Local development is commonly opened as either loopback spelling; both are the same site.
	if (origin.hostname === "localhost" || origin.hostname === "127.0.0.1" || origin.hostname === "::1") {
		trustedOrigins.push(
			`http://localhost:${origin.port || 80}`,
			`http://127.0.0.1:${origin.port || 80}`,
			`http://[::1]:${origin.port || 80}`,
		);
	}
	return betterAuth({
		database: db,
		secret,
		baseURL,
		trustedOrigins,
		advanced: { ipAddress: { ipAddressHeaders: ["x-wuppy-client-ip"] } },
		...(quiet ? { logger: { disabled: true } } : {}),
		...(sessionPolicy ? { session: sessionPolicy } : {}),
		...(oauthProviders ? { socialProviders: oauthProviders } : {}),
		...(socialIds.length > 0
			? {
					account: {
						// A linked GitHub account may carry repo access (Themes); keep provider tokens encrypted at rest.
						encryptOAuthTokens: true,
						accountLinking: {
							enabled: true,
							disableImplicitLinking: true,
							requireLocalEmailVerified: false,
							allowDifferentEmails: false,
							trustedProviders: socialIds,
						},
					},
				}
			: {}),
		emailAndPassword: {
			enabled: true,
			resetPasswordTokenExpiresIn: 60 * 30,
			revokeSessionsOnPasswordReset: true,
			...(sendResetPassword
				? {
						sendResetPassword: async ({ user, url, token }: { user: { email: string }; url: string; token: string }) =>
							sendResetPassword({ email: user.email, url, token }),
					}
				: {}),
		},
		// Brute-force protection on, also in development; sign-in is the tight one.
		rateLimit: {
			enabled: true,
			window: 60,
			max: 100,
			customRules: {
				"/sign-in/email": { window: 60, max: 5 },
				"/sign-in/magic-link": { window: 60, max: 5 },
				"/sign-up/email": { window: 60, max: 5 },
				"/request-password-reset": { window: 60, max: 3 },
				"/sign-in/social": { window: 60, max: 10 },
				"/link-social": { window: 60, max: 10 },
				"/passkey/generate-register-options": { window: 60, max: 10 },
				"/passkey/verify-registration": { window: 60, max: 10 },
				"/passkey/generate-authenticate-options": { window: 60, max: 10 },
				"/passkey/verify-authentication": { window: 60, max: 5 },
			},
		},
		plugins: [
			admin({ defaultRole: "viewer", adminRoles: ["admin"] }),
			twoFactor({ issuer: "Wuppy" }),
			magicLink({
				// Magic links never create accounts; registration is invitation-only.
				disableSignUp: true,
				sendMagicLink: async ({ email, url }) => {
					const user = db.prepare("SELECT twoFactorEnabled FROM user WHERE lower(email) = lower(?)").get(email) as
						{ twoFactorEnabled?: number } | undefined;
					// Never reveal whether an address exists. Magic links are also not
					// an alternative second-factor bypass for TOTP-protected accounts.
					if (!user || user.twoFactorEnabled) return;
					if (sendMagicLink) return sendMagicLink({ email, url });
					console.info(`[wuppy] Magic link for ${email}: ${url}`);
				},
			}),
			passkey({
				rpName: passkeyOptions?.rpName ?? "Wuppy",
				...(passkeyOptions?.rpID ? { rpID: passkeyOptions.rpID } : {}),
				...(passkeyOptions?.origin ? { origin: passkeyOptions.origin } : {}),
			}),
		],
		hooks: {
			// Public registration only exists to create the owner. After that, a
			// valid invitation token is required; the token is consumed when the
			// accept endpoint applies the invited role.
			before: createAuthMiddleware(async (ctx) => {
				const body = (ctx.body ?? {}) as {
					email?: unknown;
					userId?: unknown;
					role?: unknown;
					banned?: unknown;
					data?: { role?: unknown; banned?: unknown };
				};
				if (ctx.path === "/sign-up/email" && countUsers(db) > 0) {
					const email = typeof body.email === "string" ? body.email : "";
					const token = ctx.headers?.get("x-wuppy-invite") ?? "";
					if (!token || !findValidInvitation(db, token, email)) {
						throw new APIError("FORBIDDEN", { message: "Registration is closed. An invitation is required." });
					}
					return;
				}

				const userId = body.userId === undefined || body.userId === null ? "" : String(body.userId);
				if (!userId) return;
				const change =
					ctx.path === "/admin/set-role"
						? { role: body.role }
						: ctx.path === "/admin/update-user"
							? { role: body.data?.role, banned: body.data?.banned }
							: ctx.path === "/admin/remove-user"
								? { remove: true }
								: ctx.path === "/admin/ban-user"
									? { banned: true }
									: null;
				if (change && isLastAdminChange(db, userId, change)) {
					throw new APIError("BAD_REQUEST", { message: LAST_ADMIN_MESSAGE });
				}
			}),
			after: createAuthMiddleware(async (ctx) => {
				if (
					(ctx.path === "/two-factor/enable" || ctx.path === "/two-factor/verify-totp") &&
					!(ctx.context.returned instanceof Error)
				) {
					const email = (ctx.context as { session?: { user?: { email?: string } } }).session?.user?.email;
					if (email) deleteMagicLinksForEmail(db, email);
				}
				const type = TRACKED[ctx.path] ?? (ctx.path.startsWith("/callback/") ? "auth.oauth_sign_in" : undefined);
				if (!type || !onAuditEvent) return;
				const ctxAny = ctx.context as {
					session?: { user?: { id?: string } } | null;
					newSession?: { user?: { id?: string } } | null;
				};
				const body = (ctx.body ?? {}) as { email?: unknown };
				try {
					onAuditEvent({
						type,
						ok: !(ctx.context.returned instanceof Error),
						actor: ctxAny.session?.user?.id ?? ctxAny.newSession?.user?.id,
						email: typeof body.email === "string" ? body.email : undefined,
						at: new Date().toISOString(),
					});
				} catch {
					// auditing must never break authentication
				}
			}),
		},
		databaseHooks: {
			user: {
				create: {
					// The first account owns the site; everyone after starts read-only.
					before: async (user) => {
						return {
							data: { ...user, role: needsSetup(db) ? "admin" : ((user as { role?: string }).role ?? "viewer") },
						};
					},
				},
			},
		},
	});
}

export type WuppyAuth = ReturnType<typeof createAuth>;

/** Adapter for `createApp({ getUser })`. */
export async function userFromRequest(auth: WuppyAuth, req: Request) {
	const session = await auth.api.getSession({ headers: req.headers });
	if (!session) return null;
	const role = (session.user as { role?: string | null }).role;
	return {
		id: session.user.id,
		name: session.user.name || session.user.email,
		email: session.user.email,
		permissions: permissionsFor(role),
	};
}

/** Creates/updates the auth tables. Safe to call on every startup. */
export async function migrateAuth(auth: WuppyAuth): Promise<void> {
	await (await getMigrations(auth.options)).runMigrations();
}

/** Migrates first (silently), then returns the real instance, so startup logs no false "missing tables" error. */
export async function createMigratedAuth(opts: AuthOptions): Promise<WuppyAuth> {
	await migrateAuth(createAuth({ ...opts, quiet: true }));
	return createAuth(opts);
}
