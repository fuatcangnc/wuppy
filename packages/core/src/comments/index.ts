import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type CommentStatus = "pending" | "approved" | "spam" | "trash";

export interface Comment {
	id: string;
	collection: string;
	slug: string;
	author: string;
	email: string | null;
	body: string;
	status: CommentStatus;
	/** Set on replies; the id of the comment being answered. */
	parentId: string | null;
	/** True for replies written by site staff. */
	staff: boolean;
	createdAt: string;
	updatedAt: string;
}

interface Row {
	id: string;
	collection: string;
	slug: string;
	author: string;
	email: string | null;
	body: string;
	status: CommentStatus;
	parent_id: string | null;
	staff: number;
	created_at: string;
	updated_at: string;
}

const row = (r: Row): Comment => ({
	id: r.id,
	collection: r.collection,
	slug: r.slug,
	author: r.author,
	email: r.email,
	body: r.body,
	status: r.status,
	parentId: r.parent_id,
	staff: r.staff === 1,
	createdAt: r.created_at,
	updatedAt: r.updated_at,
});

const hashIp = (ip: string | undefined) => (ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : null);

export class CommentService {
	constructor(private readonly db: DatabaseSync) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS wuppy_comments (
				id TEXT PRIMARY KEY,
				collection TEXT NOT NULL,
				slug TEXT NOT NULL,
				author TEXT NOT NULL,
				email TEXT,
				body TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'pending',
				ip_hash TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS wuppy_comments_target ON wuppy_comments(collection, slug, status);
			CREATE INDEX IF NOT EXISTS wuppy_comments_status ON wuppy_comments(status, created_at);
		`);
		const columns = (db.prepare("PRAGMA table_info(wuppy_comments)").all() as { name: string }[]).map((c) => c.name);
		if (!columns.includes("parent_id")) db.exec("ALTER TABLE wuppy_comments ADD COLUMN parent_id TEXT");
		if (!columns.includes("staff")) db.exec("ALTER TABLE wuppy_comments ADD COLUMN staff INTEGER NOT NULL DEFAULT 0");
	}

	list(status: CommentStatus | "all" = "all", limit = 100, offset = 0): Comment[] {
		const rows =
			status === "all"
				? this.db
						.prepare("SELECT * FROM wuppy_comments ORDER BY created_at DESC, id LIMIT ? OFFSET ?")
						.all(limit, offset)
				: this.db
						.prepare("SELECT * FROM wuppy_comments WHERE status = ? ORDER BY created_at DESC, id LIMIT ? OFFSET ?")
						.all(status, limit, offset);
		return (rows as unknown as Row[]).map(row);
	}

	get(id: string): Comment | null {
		const r = this.db.prepare("SELECT * FROM wuppy_comments WHERE id = ?").get(id) as Row | undefined;
		return r ? row(r) : null;
	}

	/** Pending/approved counts per entry, for badges in content lists. Spam and trash are not counted. */
	countsByEntry(): Array<{ collection: string; slug: string; pending: number; approved: number }> {
		return this.db
			.prepare(
				`SELECT collection, slug,
					SUM(status = 'pending') AS pending, SUM(status = 'approved') AS approved
				 FROM wuppy_comments WHERE status IN ('pending', 'approved') GROUP BY collection, slug ORDER BY collection, slug`,
			)
			.all() as never;
	}

	/** A staff answer to `parent`, published immediately on the same entry. */
	reply(parent: Comment, author: string, body: string): Comment {
		const now = new Date().toISOString();
		const comment: Comment = {
			id: randomUUID(),
			collection: parent.collection,
			slug: parent.slug,
			author: author.slice(0, 100),
			email: null,
			body: body.slice(0, 5000),
			status: "approved",
			parentId: parent.id,
			staff: true,
			createdAt: now,
			updatedAt: now,
		};
		this.db
			.prepare(
				"INSERT INTO wuppy_comments (id, collection, slug, author, email, body, status, parent_id, staff, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
			)
			.run(
				comment.id,
				comment.collection,
				comment.slug,
				comment.author,
				null,
				comment.body,
				"approved",
				parent.id,
				now,
				now,
			);
		return comment;
	}

	counts(): Record<CommentStatus | "all", number> {
		const result = { all: 0, pending: 0, approved: 0, spam: 0, trash: 0 } as Record<CommentStatus | "all", number>;
		for (const r of this.db.prepare("SELECT status, COUNT(*) AS n FROM wuppy_comments GROUP BY status").all() as {
			status: CommentStatus;
			n: number;
		}[]) {
			result[r.status] = r.n;
			result.all += r.n;
		}
		return result;
	}

	forEntry(collection: string, slug: string): Comment[] {
		return (
			this.db
				.prepare(
					"SELECT * FROM wuppy_comments WHERE collection = ? AND slug = ? AND status = 'approved' ORDER BY created_at ASC",
				)
				.all(collection, slug) as unknown as Row[]
		).map(row);
	}

	create(input: {
		collection: string;
		slug: string;
		author: string;
		email?: string;
		body: string;
		ip?: string;
		status: "approved" | "pending" | "spam";
	}): Comment {
		const now = new Date().toISOString();
		const comment: Comment = {
			id: randomUUID(),
			collection: input.collection,
			slug: input.slug,
			author: input.author.slice(0, 100),
			email: input.email?.slice(0, 200) ?? null,
			body: input.body.slice(0, 5000),
			status: input.status,
			parentId: null,
			staff: false,
			createdAt: now,
			updatedAt: now,
		};
		this.db
			.prepare(
				"INSERT INTO wuppy_comments (id, collection, slug, author, email, body, status, ip_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				comment.id,
				comment.collection,
				comment.slug,
				comment.author,
				comment.email,
				comment.body,
				comment.status,
				hashIp(input.ip),
				comment.createdAt,
				comment.updatedAt,
			);
		return comment;
	}

	setStatus(id: string, status: CommentStatus): boolean {
		const result = this.db
			.prepare("UPDATE wuppy_comments SET status = ?, updated_at = ? WHERE id = ?")
			.run(status, new Date().toISOString(), id);
		return result.changes > 0;
	}

	bulk(ids: string[], status: CommentStatus): number {
		let changed = 0;
		for (const id of ids) if (this.setStatus(id, status)) changed++;
		return changed;
	}

	delete(id: string): boolean {
		return this.db.prepare("DELETE FROM wuppy_comments WHERE id = ?").run(id).changes > 0;
	}
}
