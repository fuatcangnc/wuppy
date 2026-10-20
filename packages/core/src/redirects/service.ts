import type { DatabaseSync } from "node:sqlite";
import type { JsonStore } from "../data/store.ts";
import { type RedirectRule, redirectsSchema } from "./index.ts";

export interface NotFoundRow {
	path: string;
	count: number;
	lastSeen: string;
}

export class RedirectService {
	constructor(
		private readonly store: JsonStore,
		private readonly db: DatabaseSync,
		private readonly configured: RedirectRule[] = [],
	) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS wuppy_redirect_404 (
				path TEXT PRIMARY KEY,
				count INTEGER NOT NULL DEFAULT 1,
				last_seen TEXT NOT NULL
			);
		`);
	}

	async list(): Promise<RedirectRule[]> {
		const stored = await this.store.read<RedirectRule[]>("redirects", []);
		const merged = [...this.configured, ...stored];
		return redirectsSchema.parse(merged);
	}

	async save(rules: RedirectRule[]): Promise<void> {
		const parsed = redirectsSchema.parse(rules);
		await this.store.write("redirects", parsed, "redirects: update");
	}

	record404(pathname: string): void {
		const now = new Date().toISOString();
		this.db
			.prepare(
				"INSERT INTO wuppy_redirect_404 (path, count, last_seen) VALUES (?, 1, ?) ON CONFLICT(path) DO UPDATE SET count = count + 1, last_seen = excluded.last_seen",
			)
			.run(pathname.slice(0, 500), now);
	}

	list404(limit = 100): NotFoundRow[] {
		return (
			this.db
				.prepare("SELECT path, count, last_seen AS lastSeen FROM wuppy_redirect_404 ORDER BY last_seen DESC LIMIT ?")
				.all(limit) as unknown as NotFoundRow[]
		);
	}

	clear404(path?: string): void {
		if (path) this.db.prepare("DELETE FROM wuppy_redirect_404 WHERE path = ?").run(path);
		else this.db.exec("DELETE FROM wuppy_redirect_404");
	}
}
