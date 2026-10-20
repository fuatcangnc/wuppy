import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { ROLES, type Role } from "../permissions/index.ts";

/** Invitations are valid for one week unless the caller overrides the TTL. */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

/** Safe shape for the admin list; never includes the token hash. */
export type PendingInvitation = Pick<Invitation, "id" | "email" | "role" | "invitedBy" | "createdAt" | "expiresAt">;

interface InvitationRow {
	id: string;
	email: string;
	role: string;
	tokenHash: string;
	invitedBy: string | null;
	createdAt: string;
	expiresAt: string;
	acceptedAt: string | null;
}

const rowToInvitation = (row: InvitationRow): Invitation => ({
	...row,
	role: row.role as Role,
});

export const normalizeInvitationEmail = (email: string): string => email.trim().toLowerCase();

export const hashInvitationToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export const isInvitationRole = (value: unknown): value is Role =>
	typeof value === "string" && (ROLES as readonly string[]).includes(value);

/** Idempotent; called on auth startup so the sign-up hook can always query it. */
export function ensureInvitationTable(db: DatabaseSync): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS wuppy_invitation (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL,
			role TEXT NOT NULL,
			tokenHash TEXT NOT NULL UNIQUE,
			invitedBy TEXT,
			createdAt TEXT NOT NULL,
			expiresAt TEXT NOT NULL,
			acceptedAt TEXT
		)
	`);
	db.exec("CREATE INDEX IF NOT EXISTS wuppy_invitation_email_idx ON wuppy_invitation(email)");
}

/**
 * Creates a single-use invitation and returns the raw token once. The database
 * only stores a hash; replacing a pending invitation for the same email is
 * intentional so "resend" invalidates the old link.
 */
export function createInvitation(
	db: DatabaseSync,
	input: { email: string; role: Role; invitedBy?: string | null; ttlMs?: number },
): { token: string; invitation: Invitation } {
	if (!isInvitationRole(input.role)) throw new Error("Invalid invitation role");
	const email = normalizeInvitationEmail(input.email);
	const token = randomBytes(32).toString("base64url");
	const now = new Date();
	const createdAt = now.toISOString();
	const expiresAt = new Date(now.getTime() + (input.ttlMs ?? INVITATION_TTL_MS)).toISOString();
	const invitation: Invitation = {
		id: randomUUID(),
		email,
		role: input.role,
		tokenHash: hashInvitationToken(token),
		invitedBy: input.invitedBy ?? null,
		createdAt,
		expiresAt,
		acceptedAt: null,
	};

	db.exec("BEGIN IMMEDIATE");
	try {
		// Only one live link per email; an older pending link must stop working.
		db.prepare("DELETE FROM wuppy_invitation WHERE email = ? AND acceptedAt IS NULL").run(email);
		db.prepare(
			`INSERT INTO wuppy_invitation (id, email, role, tokenHash, invitedBy, createdAt, expiresAt, acceptedAt)
			 VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
		).run(
			invitation.id,
			invitation.email,
			invitation.role,
			invitation.tokenHash,
			invitation.invitedBy,
			invitation.createdAt,
			invitation.expiresAt,
		);
		db.exec("COMMIT");
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
	return { token, invitation };
}

export function findInvitationByToken(db: DatabaseSync, token: string): Invitation | null {
	if (!token) return null;
	const row = db.prepare("SELECT * FROM wuppy_invitation WHERE tokenHash = ?").get(hashInvitationToken(token)) as
		InvitationRow | undefined;
	return row ? rowToInvitation(row) : null;
}

/** A valid invitation is unaccepted, unexpired and (when given) tied to this email. */
export function findValidInvitation(
	db: DatabaseSync,
	token: string,
	email?: string,
	now = new Date().toISOString(),
): Invitation | null {
	const invitation = findInvitationByToken(db, token);
	if (!invitation || invitation.acceptedAt || invitation.expiresAt <= now) return null;
	if (email && invitation.email !== normalizeInvitationEmail(email)) return null;
	return invitation;
}

export function markInvitationAccepted(db: DatabaseSync, id: string): boolean {
	const result = db
		.prepare("UPDATE wuppy_invitation SET acceptedAt = ? WHERE id = ? AND acceptedAt IS NULL")
		.run(new Date().toISOString(), id);
	return Number(result.changes) > 0;
}

export function listPendingInvitations(db: DatabaseSync): PendingInvitation[] {
	return db
		.prepare(
			`SELECT id, email, role, invitedBy, createdAt, expiresAt
			 FROM wuppy_invitation
			 WHERE acceptedAt IS NULL AND expiresAt > ?
			 ORDER BY createdAt DESC`,
		)
		.all(new Date().toISOString())
		.map((row) => {
			const value = row as Omit<PendingInvitation, "role"> & { role: string };
			return { ...value, role: value.role as Role };
		});
}

export function revokeInvitation(db: DatabaseSync, id: string): boolean {
	const result = db.prepare("DELETE FROM wuppy_invitation WHERE id = ? AND acceptedAt IS NULL").run(id);
	return Number(result.changes) > 0;
}

/**
 * Finalizes an invited account: verifies the token and email match the signed-in
 * user, applies the invited role and consumes the token atomically.
 */
export function acceptInvitation(
	db: DatabaseSync,
	input: { token: string; userId: string },
): { email: string; role: Role } | null {
	db.exec("BEGIN IMMEDIATE");
	try {
		const invitation = findValidInvitation(db, input.token);
		if (!invitation) {
			db.exec("ROLLBACK");
			return null;
		}
		const user = db.prepare("SELECT email FROM user WHERE id = ?").get(input.userId) as { email: string } | undefined;
		if (!user || normalizeInvitationEmail(user.email) !== invitation.email) {
			db.exec("ROLLBACK");
			return null;
		}
		const changed = db
			.prepare("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?")
			.run(invitation.role, input.userId);
		if (Number(changed.changes) === 0 || !markInvitationAccepted(db, invitation.id)) {
			db.exec("ROLLBACK");
			return null;
		}
		db.exec("COMMIT");
		return { email: invitation.email, role: invitation.role };
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
}
