// Hand-written on purpose: Better Auth's inferred types cannot be named portably (TS2883),
// so the published surface is this narrow description. `tests/public-types.ts` keeps it in sync with `src`.
import type { DatabaseSync } from "node:sqlite";

export declare const ROLES: readonly ["admin", "editor", "author", "viewer"];
export type Role = (typeof ROLES)[number];
export declare const PERMISSIONS: readonly string[];
export type Permission = string;
export declare function permissionsFor(role: string | null | undefined): Permission[];

export declare const SOCIAL_PROVIDER_IDS: readonly ["github", "google", "microsoft"];
export type SocialProviderId = (typeof SOCIAL_PROVIDER_IDS)[number];
export interface SocialProviderConfig {
	clientId: string;
	clientSecret: string;
	hd?: string;
	tenantId?: string;
}
export type SocialProvidersConfig = Partial<Record<SocialProviderId, SocialProviderConfig>>;

export interface AuditEvent {
	type: string;
	ok: boolean;
	actor?: string;
	email?: string;
	at: string;
}

export interface AuthOptions {
	db: DatabaseSync;
	secret: string;
	baseURL: string;
	quiet?: boolean;
	onAuditEvent?: (event: AuditEvent) => void;
	sendMagicLink?: (input: { email: string; url: string }) => Promise<void>;
	sendResetPassword?: (input: { email: string; url: string; token: string }) => Promise<void>;
	session?: { expiresIn: number; updateAge: number };
	passkey?: { rpID?: string; rpName?: string; origin?: string | string[] };
	socialProviders?: SocialProvidersConfig;
}

/** The Better Auth instance, reduced to what Wuppy's host code uses. */
export interface WuppyAuth {
	handler: (request: Request) => Promise<Response>;
	api: {
		getSession: (input: {
			headers: Headers;
		}) => Promise<{ user: { id: string; name: string; email: string; role?: string | null } } | null>;
	} & Record<string, (...args: never[]) => unknown>;
	options: unknown;
}

export declare function createAuth(options: AuthOptions): WuppyAuth;
export declare function createMigratedAuth(options: AuthOptions): Promise<WuppyAuth>;
export declare function migrateAuth(auth: WuppyAuth): Promise<void>;
export declare function needsSetup(db: DatabaseSync): boolean;
export declare function userFromRequest(
	auth: WuppyAuth,
	req: Request,
): Promise<{ id: string; name: string; permissions: Permission[] } | null>;

export interface Invitation {
	id: string;
	email: string;
	role: Role;
	tokenHash: string;
	invitedBy: string | null;
	createdAt: string;
	expiresAt: string;
	acceptedAt: string | null;
}
export type PendingInvitation = Pick<Invitation, "id" | "email" | "role" | "invitedBy" | "createdAt" | "expiresAt">;

export declare const INVITATION_TTL_MS: number;
export declare function ensureInvitationTable(db: DatabaseSync): void;
export declare function createInvitation(
	db: DatabaseSync,
	input: { email: string; role: Role; invitedBy?: string | null; ttlMs?: number },
): { token: string; invitation: Invitation };
export declare function findInvitationByToken(db: DatabaseSync, token: string): Invitation | null;
export declare function findValidInvitation(
	db: DatabaseSync,
	token: string,
	email?: string,
	now?: string,
): Invitation | null;
export declare function hashInvitationToken(token: string): string;
export declare function isInvitationRole(value: unknown): value is Role;
export declare function listPendingInvitations(db: DatabaseSync): PendingInvitation[];
export declare function markInvitationAccepted(db: DatabaseSync, id: string): boolean;
export declare function normalizeInvitationEmail(email: string): string;
export declare function revokeInvitation(db: DatabaseSync, id: string): boolean;
export declare function acceptInvitation(
	db: DatabaseSync,
	input: { token: string; userId: string },
): { email: string; role: Role } | null;
