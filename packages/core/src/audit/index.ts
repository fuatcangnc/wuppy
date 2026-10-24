import type { DatabaseSync } from "node:sqlite";
import type { AuditEvent } from "@wuppycms/auth";

const MAX_PAGE = 500;

/** Security events (who signed in, who created/changed users). Content changes are audited by Git history. */
export class AuditLog {
	constructor(private readonly db: DatabaseSync) {
		db.exec(
			"CREATE TABLE IF NOT EXISTS wuppy_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, type TEXT NOT NULL, ok INTEGER NOT NULL, actor TEXT, email TEXT)",
		);
		const columns = db.prepare("PRAGMA table_info(wuppy_audit)").all() as { name: string }[];
		if (!columns.some((c) => c.name === "detail")) db.exec("ALTER TABLE wuppy_audit ADD COLUMN detail TEXT");
	}

	record(e: AuditEvent): void {
		this.db
			.prepare("INSERT INTO wuppy_audit (at, type, ok, actor, email, detail) VALUES (?, ?, ?, ?, ?, ?)")
			.run(e.at, e.type, e.ok ? 1 : 0, e.actor ?? null, e.email ?? null, e.detail ?? null);
	}

	list(limit = 100): AuditEvent[] {
		const rows = this.db
			.prepare("SELECT at, type, ok, actor, email, detail FROM wuppy_audit ORDER BY at DESC, id DESC LIMIT ?")
			.all(Math.min(Math.max(1, limit), MAX_PAGE)) as {
			at: string;
			type: string;
			ok: number;
			actor: string | null;
			email: string | null;
			detail: string | null;
		}[];
		return rows.map((r) => ({
			at: r.at,
			type: r.type,
			ok: r.ok === 1,
			...(r.actor ? { actor: r.actor } : {}),
			...(r.email ? { email: r.email } : {}),
			...(r.detail ? { detail: r.detail } : {}),
		}));
	}
}
