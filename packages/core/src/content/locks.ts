export interface EditLock {
	userId: string;
	/** Display name of the holder. */
	name: string;
	since: string;
	/** Last heartbeat. */
	seenAt: string;
}

/**
 * "Who is editing this right now" — advisory, in memory, and self-expiring. Real protection against lost updates is the
 * etag check on save; the lock only tells people to coordinate before they type.
 * shortcut: per process; with several server instances a lock is only visible on the instance that took it.
 */
export class EditLocks {
	private readonly held = new Map<string, EditLock>();

	constructor(
		private readonly ttlMs = 60_000,
		private readonly now: () => number = Date.now,
	) {}

	private key = (collection: string, slug: string) => `${collection}\n${slug}`;

	/** Holder of a live lock, or null. */
	get(collection: string, slug: string): EditLock | null {
		const lock = this.held.get(this.key(collection, slug));
		if (!lock) return null;
		if (this.now() - Date.parse(lock.seenAt) > this.ttlMs) {
			this.held.delete(this.key(collection, slug));
			return null;
		}
		return lock;
	}

	/** Takes or refreshes the lock. Returns the other holder instead when someone else has it (unless `force`). */
	acquire(
		collection: string,
		slug: string,
		userId: string,
		force = false,
		name = userId,
	): { ok: true } | { ok: false; heldBy: EditLock } {
		const current = this.get(collection, slug);
		if (current && current.userId !== userId && !force) return { ok: false, heldBy: current };
		const at = new Date(this.now()).toISOString();
		this.held.set(this.key(collection, slug), {
			userId,
			name,
			since: current && current.userId === userId ? current.since : at,
			seenAt: at,
		});
		return { ok: true };
	}

	release(collection: string, slug: string, userId: string): void {
		if (this.get(collection, slug)?.userId === userId) this.held.delete(this.key(collection, slug));
	}
}
