import { createHash, randomBytes, randomUUID } from "node:crypto";
import { permissionsFor } from "@wuppycms/auth";
import type { DatabaseSync } from "node:sqlite";

/** `hub` tokens are used by another Wuppy that manages this site; they act with the hub user's role. */
export type TokenKind = "user" | "hub";

export interface ApiToken {
	id: string;
	kind: TokenKind;
	name: string;
	userId: string;
	permissions: string[];
	createdAt: string;
	expiresAt: string | null;
	lastUsedAt: string | null;
}

interface Row {
	id: string;
	kind: string | null;
	name: string;
	user_id: string;
	permissions: string;
	created_at: string;
	expires_at: string | null;
	last_used_at: string | null;
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const row = (r: Row): ApiToken => ({
	id: r.id,
	kind: r.kind === "hub" ? "hub" : "user",
	name: r.name,
	userId: r.user_id,
	permissions: JSON.parse(r.permissions) as string[],
	createdAt: r.created_at,
	expiresAt: r.expires_at,
	lastUsedAt: r.last_used_at,
});

export class ApiTokenService {
	constructor(private readonly db: DatabaseSync) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS wuppy_api_tokens (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				user_id TEXT NOT NULL,
				token_hash TEXT NOT NULL UNIQUE,
				permissions TEXT NOT NULL,
				created_at TEXT NOT NULL,
				expires_at TEXT,
				last_used_at TEXT
			);
			CREATE INDEX IF NOT EXISTS wuppy_api_tokens_user ON wuppy_api_tokens(user_id);
		`);
		const columns = db.prepare("PRAGMA table_info(wuppy_api_tokens)").all() as { name: string }[];
		if (!columns.some((c) => c.name === "kind"))
			db.exec("ALTER TABLE wuppy_api_tokens ADD COLUMN kind TEXT NOT NULL DEFAULT 'user'");
	}

	create(input: { name: string; userId: string; permissions: string[]; expiresAt?: string | null; kind?: TokenKind }): {
		token: string;
		record: ApiToken;
	} {
		const token = `wuppy_${randomBytes(32).toString("base64url")}`;
		const record: ApiToken = {
			id: randomUUID(),
			kind: input.kind ?? "user",
			name: input.name,
			userId: input.userId,
			permissions: input.permissions,
			createdAt: new Date().toISOString(),
			expiresAt: input.expiresAt ?? null,
			lastUsedAt: null,
		};
		this.db
			.prepare(
				"INSERT INTO wuppy_api_tokens (id, kind, name, user_id, token_hash, permissions, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				record.id,
				record.kind,
				record.name,
				record.userId,
				hash(token),
				JSON.stringify(record.permissions),
				record.createdAt,
				record.expiresAt,
			);
		return { token, record };
	}

	list(userId?: string): ApiToken[] {
		const rows = userId
			? this.db.prepare("SELECT * FROM wuppy_api_tokens WHERE user_id = ? ORDER BY created_at DESC").all(userId)
			: this.db.prepare("SELECT * FROM wuppy_api_tokens ORDER BY created_at DESC").all();
		return (rows as unknown as Row[]).map(row);
	}

	revoke(id: string): boolean {
		return this.db.prepare("DELETE FROM wuppy_api_tokens WHERE id = ?").run(id).changes > 0;
	}

	verify(token: string): { userId: string; permissions: string[]; kind: TokenKind; expiresAt: string | null } | null {
		if (!token.startsWith("wuppy_")) return null;
		const found = this.db.prepare("SELECT * FROM wuppy_api_tokens WHERE token_hash = ?").get(hash(token)) as
			Row | undefined;
		if (!found) return null;
		if (found.expires_at && new Date(found.expires_at).getTime() <= Date.now()) return null;
		this.db
			.prepare("UPDATE wuppy_api_tokens SET last_used_at = ? WHERE id = ?")
			.run(new Date().toISOString(), found.id);
		const r = row(found);
		return { userId: r.userId, permissions: r.permissions, kind: r.kind, expiresAt: r.expiresAt };
	}
}

/** Header a hub sends to say which role (on this site) its signed-in user acts with. */
export const ACTING_ROLE_HEADER = "x-wuppy-acting-role";
/** Header a hub sends with its signed-in user's email, for this site's audit trail only. */
export const ACTING_USER_HEADER = "x-wuppy-acting-user";

export interface BearerUser {
	id: string;
	name?: string;
	permissions: string[];
	hub?: { actingEmail: string | null; tokenExpiresAt: string | null };
}

/**
 * Resolves `Authorization: Bearer` to a user. A token never grants more than its owner's
 * current role (demoted or banned owner: less or nothing); a hub token is further cut to
 * the acting role the hub claims, and no claim means no access.
 */
export function bearerUser(tokens: ApiTokenService, db: DatabaseSync, req: Request): BearerUser | null {
	const header = req.headers.get("authorization");
	if (!header?.startsWith("Bearer ")) return null;
	const token = tokens.verify(header.slice(7));
	if (!token) return null;
	const owner = db.prepare("SELECT role, banned FROM user WHERE id = ?").get(token.userId) as
		{ role: string | null; banned: number | null } | undefined;
	if (!owner || owner.banned) return null;
	const ownerPermissions = permissionsFor(owner.role);
	let permissions = token.permissions.filter((p) => ownerPermissions.includes(p as never));
	if (token.kind !== "hub") return { id: token.userId, permissions };
	const acting = permissionsFor(req.headers.get(ACTING_ROLE_HEADER));
	permissions = permissions.filter((p) => acting.includes(p as never));
	const email = req.headers.get(ACTING_USER_HEADER)?.trim() ?? "";
	const actingEmail = /^[^\s@]{1,100}@[^\s@]{1,100}$/.test(email) ? email : null;
	return {
		id: token.userId,
		name: actingEmail ? `${actingEmail} (via hub)` : "Hub",
		permissions,
		hub: { actingEmail, tokenExpiresAt: token.expiresAt },
	};
}
