import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

/** One saved turn, as the Assistant page shows it (steps are the tools run for that answer). */
export interface ChatTurn {
	role: "user" | "assistant";
	content: string;
	steps?: { tool: string; args?: unknown; ok: boolean; result: string }[];
}

export interface ChatSummary {
	id: string;
	title: string;
	agent: string;
	site: string | null;
	updatedAt: string;
}

const MAX_CHATS_PER_USER = 200;

/** Saved assistant conversations. Each one belongs to the user who had it; nobody else can list or open it. */
export class ChatHistory {
	constructor(private readonly db: DatabaseSync) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS wuppy_ai_chats (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				title TEXT NOT NULL,
				agent TEXT NOT NULL,
				site TEXT,
				turns TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS wuppy_ai_chats_user ON wuppy_ai_chats(user_id, updated_at);
		`);
		if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user'").get())
			db.exec(`CREATE TRIGGER IF NOT EXISTS wuppy_ai_chats_user_deleted AFTER DELETE ON user
				BEGIN DELETE FROM wuppy_ai_chats WHERE user_id = OLD.id; END`);
	}

	list(userId: string): ChatSummary[] {
		return this.db
			.prepare(
				"SELECT id, title, agent, site, updated_at AS updatedAt FROM wuppy_ai_chats WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100",
			)
			.all(userId) as unknown as ChatSummary[];
	}

	get(userId: string, id: string): (ChatSummary & { turns: ChatTurn[] }) | null {
		const r = this.db
			.prepare(
				"SELECT id, title, agent, site, turns, updated_at AS updatedAt FROM wuppy_ai_chats WHERE id = ? AND user_id = ?",
			)
			.get(id, userId) as (ChatSummary & { turns: string }) | undefined;
		return r ? { ...r, turns: JSON.parse(r.turns) as ChatTurn[] } : null;
	}

	/** Saves the whole conversation; an id that is not this user's starts a new chat instead. */
	save(userId: string, input: { id?: string; agent: string; site: string | null; turns: ChatTurn[] }): string {
		const now = new Date().toISOString();
		const turns = JSON.stringify(input.turns);
		if (input.id && this.get(userId, input.id)) {
			this.db
				.prepare("UPDATE wuppy_ai_chats SET agent = ?, site = ?, turns = ?, updated_at = ? WHERE id = ?")
				.run(input.agent, input.site, turns, now, input.id);
			return input.id;
		}
		const id = randomUUID();
		const title = (input.turns.find((t) => t.role === "user")?.content ?? "Chat").replace(/\s+/g, " ").slice(0, 80);
		this.db
			.prepare(
				"INSERT INTO wuppy_ai_chats (id, user_id, title, agent, site, turns, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			)
			.run(id, userId, title, input.agent, input.site, turns, now);
		// Oldest chats go first once a user has many.
		this.db
			.prepare(
				"DELETE FROM wuppy_ai_chats WHERE user_id = ? AND id NOT IN (SELECT id FROM wuppy_ai_chats WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?)",
			)
			.run(userId, userId, MAX_CHATS_PER_USER);
		return id;
	}

	remove(userId: string, id: string): boolean {
		return this.db.prepare("DELETE FROM wuppy_ai_chats WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
	}
}
