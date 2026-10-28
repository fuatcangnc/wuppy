import { DatabaseSync } from "node:sqlite";
import type { ContentService } from "../content/service.ts";

export interface SearchHit {
	collection: string;
	slug: string;
	title: string;
	status: "draft" | "published";
	/** HTML-safe: every character is escaped except the `<mark>` wrappers around matches. */
	excerpt: string;
	/** Page-level search description, when one is set. */
	description?: string;
	/** Page-level search image, when one is set. */
	image?: string;
}

export interface SearchOptions {
	q: string;
	collection?: string;
	status?: string;
	limit?: number;
}

const OPEN = "\u0001";
const CLOSE = "\u0002";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const marked = (s: string) => esc(s).replaceAll(OPEN, "<mark>").replaceAll(CLOSE, "</mark>");

/**
 * Full-text search over title, body and frontmatter using an in-memory SQLite FTS5 table built from the files.
 * It rebuilds when the service reports a change, or after `maxAgeMs` to pick up edits made outside Wuppy (git pull).
 */
export class SearchIndex {
	private db: DatabaseSync | null = null;
	private builtAt = -1;
	private builtVersion = -1;
	private building: Promise<void> | null = null;

	constructor(
		private readonly service: ContentService,
		private readonly maxAgeMs = 60_000,
	) {}

	private async rebuild(): Promise<void> {
		const version = this.service.version;
		const db = new DatabaseSync(":memory:");
		db.exec(
			"CREATE VIRTUAL TABLE docs USING fts5(collection UNINDEXED, slug UNINDEXED, status UNINDEXED, title, body, meta, description UNINDEXED, image UNINDEXED, tokenize='unicode61 remove_diacritics 2')",
		);
		const insert = db.prepare("INSERT INTO docs VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
		db.exec("BEGIN");
		for (const c of this.service.collections) {
			for (const e of await this.service.listEntries(c.name)) {
				if (e.data.searchExclude === true) continue;
				const title =
					typeof e.data.searchTitle === "string" && e.data.searchTitle
						? e.data.searchTitle
						: typeof e.data.seoTitle === "string" && e.data.seoTitle
							? e.data.seoTitle
							: typeof e.data.title === "string"
								? e.data.title
								: e.slug;
				const description =
					typeof e.data.searchDescription === "string"
						? e.data.searchDescription
						: typeof e.data.seoDescription === "string"
							? e.data.seoDescription
							: undefined;
				const image =
					typeof e.data.searchImage === "string"
						? e.data.searchImage
						: typeof e.data.ogImage === "string"
							? e.data.ogImage
							: typeof e.data.cover === "string"
								? e.data.cover
								: undefined;
				const meta = Object.values(e.data)
					.filter((v) => typeof v === "string" || Array.isArray(v))
					.join(" ");
				insert.run(
					c.name,
					e.slug,
					e.data.draft === true ? "draft" : "published",
					title,
					e.body,
					meta,
					description ?? null,
					image ?? null,
				);
			}
		}
		db.exec("COMMIT");
		this.db?.close();
		this.db = db;
		this.builtVersion = version;
		this.builtAt = Date.now();
	}

	private async ready(): Promise<DatabaseSync> {
		const stale = !this.db || this.builtVersion !== this.service.version || Date.now() - this.builtAt > this.maxAgeMs;
		if (stale) await (this.building ??= this.rebuild().finally(() => (this.building = null)));
		return this.db!;
	}

	async search({ q, collection, status, limit = 50 }: SearchOptions): Promise<SearchHit[]> {
		// Each word becomes a quoted prefix term, so user input can never be parsed as FTS5 syntax.
		const terms = q.match(/[\p{L}\p{N}]+/gu)?.slice(0, 8);
		if (!terms?.length) return [];
		const match = terms.map((t) => `"${t}"*`).join(" ");
		const db = await this.ready();
		const where = [collection ? "collection = ?" : "", status ? "status = ?" : ""].filter(Boolean);
		const rows = db
			.prepare(
				`SELECT collection, slug, status, title, snippet(docs, 4, '${OPEN}', '${CLOSE}', '…', 20) AS excerpt, description, image
				 FROM docs WHERE docs MATCH ? ${where.map((w) => `AND ${w}`).join(" ")} ORDER BY bm25(docs, 0, 0, 0, 5, 1, 2) LIMIT ?`,
			)
			.all(match, ...[collection, status].filter((v): v is string => !!v), Math.min(limit, 100)) as Array<{
			collection: string;
			slug: string;
			status: "draft" | "published";
			title: string;
			excerpt: string;
			description: string | null;
			image: string | null;
		}>;
		return rows.map((r) => ({
			...r,
			description: r.description ?? undefined,
			image: r.image ?? undefined,
			excerpt: marked(r.excerpt.replace(/\s+/g, " ")),
		}));
	}
}
