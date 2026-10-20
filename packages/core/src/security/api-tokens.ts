import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface ApiToken {
	id: string;
	name: string;
	userId: string;
	permissions: string[];
	createdAt: string;
	expiresAt: string | null;
	lastUsedAt: string | null;
}

interface Row {
	id: string;
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
	}

	create(input: { name: string; userId: string; permissions: string[]; expiresAt?: string | null }): {
		token: string;
		record: ApiToken;
	} {
		const token = `wuppy_${randomBytes(32).toString("base64url")}`;
		const record: ApiToken = {
			id: randomUUID(),
			name: input.name,
			userId: input.userId,
			permissions: input.permissions,
			createdAt: new Date().toISOString(),
			expiresAt: input.expiresAt ?? null,
			lastUsedAt: null,
		};
		this.db
			.prepare(
				"INSERT INTO wuppy_api_tokens (id, name, user_id, token_hash, permissions, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				record.id,
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

	verify(token: string): { userId: string; permissions: string[] } | null {
		if (!token.startsWith("wuppy_")) return null;
		const found = this.db.prepare("SELECT * FROM wuppy_api_tokens WHERE token_hash = ?").get(hash(token)) as
			Row | undefined;
		if (!found) return null;
		if (found.expires_at && new Date(found.expires_at).getTime() <= Date.now()) return null;
		this.db
			.prepare("UPDATE wuppy_api_tokens SET last_used_at = ? WHERE id = ?")
			.run(new Date().toISOString(), found.id);
		return { userId: found.user_id, permissions: JSON.parse(found.permissions) as string[] };
	}
}
