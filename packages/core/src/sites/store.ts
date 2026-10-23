import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { open, seal } from "../security/secret-box.ts";

export const SITE_ROLES = ["admin", "editor", "author", "viewer"] as const;
export type SiteRole = (typeof SITE_ROLES)[number];
export type SiteStatus = "connected" | "connection_error" | "unchecked";

/** A remote Wuppy managed from this one. The token never leaves this module in plaintext except via `token()`. */
export interface ManagedSite {
	id: string;
	name: string;
	url: string;
	tokenLast4: string;
	status: SiteStatus;
	/** What the hub token allows on the remote, as last reported by it. */
	permissions: string[];
	tokenExpiresAt: string | null;
	lastCheckedAt: string | null;
	lastError: string | null;
	createdBy: string;
	createdAt: string;
}

export interface SiteCheck {
	permissions: string[];
	tokenExpiresAt: string | null;
}

interface Row {
	id: string;
	name: string;
	url: string;
	token_enc: string;
	token_last4: string;
	status: string;
	permissions: string;
	token_expires_at: string | null;
	last_checked_at: string | null;
	last_error: string | null;
	created_by: string;
	created_at: string;
}

const toSite = (r: Row): ManagedSite => ({
	id: r.id,
	name: r.name,
	url: r.url,
	tokenLast4: r.token_last4,
	status: r.status as SiteStatus,
	permissions: JSON.parse(r.permissions) as string[],
	tokenExpiresAt: r.token_expires_at,
	lastCheckedAt: r.last_checked_at,
	lastError: r.last_error,
	createdBy: r.created_by,
	createdAt: r.created_at,
});

export class SiteStore {
	constructor(
		private readonly db: DatabaseSync,
		private readonly secret: string,
	) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS wuppy_sites (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				url TEXT NOT NULL,
				token_enc TEXT NOT NULL,
				token_last4 TEXT NOT NULL,
				status TEXT NOT NULL,
				permissions TEXT NOT NULL,
				token_expires_at TEXT,
				last_checked_at TEXT,
				last_error TEXT,
				created_by TEXT NOT NULL,
				created_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS wuppy_site_members (
				site_id TEXT NOT NULL,
				user_id TEXT NOT NULL,
				role TEXT NOT NULL,
				PRIMARY KEY (site_id, user_id)
			);
			CREATE INDEX IF NOT EXISTS wuppy_site_members_user ON wuppy_site_members(user_id);
			CREATE TABLE IF NOT EXISTS wuppy_site_invites (
				site_id TEXT NOT NULL,
				email TEXT NOT NULL,
				role TEXT NOT NULL,
				PRIMARY KEY (site_id, email)
			);
			CREATE TABLE IF NOT EXISTS wuppy_site_reports (
				site_id TEXT PRIMARY KEY,
				email TEXT,
				last_sent TEXT
			);
			CREATE TABLE IF NOT EXISTS wuppy_context (
				scope TEXT PRIMARY KEY,
				text TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
		`);
		// Better Auth deletes users without knowing about sites, so memberships follow the user row.
		if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user'").get())
			db.exec(`CREATE TRIGGER IF NOT EXISTS wuppy_site_members_user_deleted AFTER DELETE ON user
				BEGIN DELETE FROM wuppy_site_members WHERE user_id = OLD.id; END`);
	}

	list(): ManagedSite[] {
		return (this.db.prepare("SELECT * FROM wuppy_sites ORDER BY name COLLATE NOCASE").all() as unknown as Row[]).map(
			toSite,
		);
	}

	get(id: string): ManagedSite | null {
		const r = this.db.prepare("SELECT * FROM wuppy_sites WHERE id = ?").get(id) as Row | undefined;
		return r ? toSite(r) : null;
	}

	create(input: { name: string; url: string; token: string; createdBy: string; check: SiteCheck }): ManagedSite {
		const id = randomUUID();
		const now = new Date().toISOString();
		this.db
			.prepare(
				"INSERT INTO wuppy_sites (id, name, url, token_enc, token_last4, status, permissions, token_expires_at, last_checked_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'connected', ?, ?, ?, ?, ?)",
			)
			.run(
				id,
				input.name,
				input.url,
				seal(this.secret, input.token, id),
				input.token.slice(-4),
				JSON.stringify(input.check.permissions),
				input.check.tokenExpiresAt,
				now,
				input.createdBy,
				now,
			);
		return this.get(id)!;
	}

	rename(id: string, name: string): ManagedSite | null {
		this.db.prepare("UPDATE wuppy_sites SET name = ? WHERE id = ?").run(name, id);
		return this.get(id);
	}

	setToken(id: string, token: string, check: SiteCheck): ManagedSite | null {
		this.db
			.prepare("UPDATE wuppy_sites SET token_enc = ?, token_last4 = ? WHERE id = ?")
			.run(seal(this.secret, token, id), token.slice(-4), id);
		return this.markChecked(id, check);
	}

	markChecked(id: string, check: SiteCheck): ManagedSite | null {
		this.db
			.prepare(
				"UPDATE wuppy_sites SET status = 'connected', permissions = ?, token_expires_at = ?, last_checked_at = ?, last_error = NULL WHERE id = ?",
			)
			.run(JSON.stringify(check.permissions), check.tokenExpiresAt, new Date().toISOString(), id);
		return this.get(id);
	}

	markFailed(id: string, error: string): void {
		this.db
			.prepare("UPDATE wuppy_sites SET status = 'connection_error', last_checked_at = ?, last_error = ? WHERE id = ?")
			.run(new Date().toISOString(), error.slice(0, 300), id);
	}

	/** Forgets the site here. The remote site and its files are untouched. */
	remove(id: string): boolean {
		this.db.prepare("DELETE FROM wuppy_site_members WHERE site_id = ?").run(id);
		this.db.prepare("DELETE FROM wuppy_site_invites WHERE site_id = ?").run(id);
		this.db.prepare("DELETE FROM wuppy_context WHERE scope = ?").run(id);
		this.db.prepare("DELETE FROM wuppy_site_reports WHERE site_id = ?").run(id);
		return this.db.prepare("DELETE FROM wuppy_sites WHERE id = ?").run(id).changes > 0;
	}

	/** Plaintext token, or null when it cannot be decrypted (e.g. WUPPY_SECRET changed): the site must be reconnected. */
	token(id: string): string | null {
		const r = this.db.prepare("SELECT token_enc FROM wuppy_sites WHERE id = ?").get(id) as
			{ token_enc: string } | undefined;
		return r ? open(this.secret, r.token_enc, id) : null;
	}

	/** Members that still exist as users here (a removed user's rows are simply not listed). */
	members(siteId: string): { userId: string; email: string; name: string; role: SiteRole }[] {
		return this.db
			.prepare(
				"SELECT m.user_id AS userId, u.email AS email, u.name AS name, m.role AS role FROM wuppy_site_members m JOIN user u ON u.id = m.user_id WHERE m.site_id = ? ORDER BY u.email",
			)
			.all(siteId) as { userId: string; email: string; name: string; role: SiteRole }[];
	}

	setMember(siteId: string, userId: string, role: SiteRole): void {
		this.db
			.prepare(
				"INSERT INTO wuppy_site_members (site_id, user_id, role) VALUES (?, ?, ?) ON CONFLICT(site_id, user_id) DO UPDATE SET role = excluded.role",
			)
			.run(siteId, userId, role);
	}

	removeMember(siteId: string, userId: string): boolean {
		return (
			this.db.prepare("DELETE FROM wuppy_site_members WHERE site_id = ? AND user_id = ?").run(siteId, userId).changes >
			0
		);
	}

	roleOf(siteId: string, userId: string): SiteRole | null {
		const r = this.db
			.prepare("SELECT role FROM wuppy_site_members WHERE site_id = ? AND user_id = ?")
			.get(siteId, userId) as { role: SiteRole } | undefined;
		return r?.role ?? null;
	}

	/** Membership per site for one user; used to filter lists and to show a user's sites. */
	membershipsOf(userId: string): { siteId: string; role: SiteRole }[] {
		return this.db.prepare("SELECT site_id AS siteId, role FROM wuppy_site_members WHERE user_id = ?").all(userId) as {
			siteId: string;
			role: SiteRole;
		}[];
	}

	/** This site's global role for a user, or null when there is no such user. */
	userRole(userId: string): string | null {
		const r = this.db.prepare("SELECT role FROM user WHERE id = ?").get(userId) as { role: string | null } | undefined;
		return r ? (r.role ?? "viewer") : null;
	}

	/** Membership granted when the invited email accepts its invitation. */
	addInvite(siteId: string, email: string, role: SiteRole): void {
		this.db
			.prepare(
				"INSERT INTO wuppy_site_invites (site_id, email, role) VALUES (?, ?, ?) ON CONFLICT(site_id, email) DO UPDATE SET role = excluded.role",
			)
			.run(siteId, email.toLowerCase(), role);
	}

	claimInvites(email: string, userId: string): void {
		const rows = this.db
			.prepare("SELECT site_id AS siteId, role FROM wuppy_site_invites WHERE email = ?")
			.all(email.toLowerCase()) as { siteId: string; role: SiteRole }[];
		for (const r of rows) if (this.get(r.siteId)) this.setMember(r.siteId, userId, r.role);
		this.db.prepare("DELETE FROM wuppy_site_invites WHERE email = ?").run(email.toLowerCase());
	}

	/** Who gets the monthly report (a site member) and the last month sent (YYYY-MM). */
	reportSettings(siteId: string): { email: string | null; lastSent: string | null } {
		const r = this.db.prepare("SELECT email, last_sent FROM wuppy_site_reports WHERE site_id = ?").get(siteId) as
			{ email: string | null; last_sent: string | null } | undefined;
		return { email: r?.email ?? null, lastSent: r?.last_sent ?? null };
	}

	/** `skipMonth` marks that month as already sent, so a new recipient starts with the next report. */
	setReportEmail(siteId: string, email: string | null, skipMonth: string): void {
		this.db
			.prepare(
				"INSERT INTO wuppy_site_reports (site_id, email, last_sent) VALUES (?, ?, ?) ON CONFLICT(site_id) DO UPDATE SET email = excluded.email, last_sent = excluded.last_sent",
			)
			.run(siteId, email, skipMonth);
	}

	markReported(siteId: string, month: string): void {
		this.db.prepare("UPDATE wuppy_site_reports SET last_sent = ? WHERE site_id = ?").run(month, siteId);
	}

	/** Agency notes for AI: `AGENCY_SCOPE` holds the agency playbook, a site id holds that client's brief. */
	context(scope: string): { text: string; updatedAt: string | null } {
		const r = this.db.prepare("SELECT text, updated_at FROM wuppy_context WHERE scope = ?").get(scope) as
			{ text: string; updated_at: string } | undefined;
		return { text: r?.text ?? "", updatedAt: r?.updated_at ?? null };
	}

	setContext(scope: string, text: string): { text: string; updatedAt: string | null } {
		this.db
			.prepare(
				"INSERT INTO wuppy_context (scope, text, updated_at) VALUES (?, ?, ?) ON CONFLICT(scope) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at",
			)
			.run(scope, text, new Date().toISOString());
		return this.context(scope);
	}
}

export const AGENCY_SCOPE = "agency";
