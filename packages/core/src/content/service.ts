import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Commit, GitAdapter } from "@wuppy/git";
import { dataSchema, type Collection } from "../content-types/index.ts";
import type { WebhookEvent } from "../webhooks/index.ts";
import { findDisallowed } from "../mdx/index.ts";
import { FilesystemContent, type ContentEntry } from "./adapters/filesystem.ts";
import { parseDocument, type ParsedDocument } from "./parsers/frontmatter.ts";

export class UnknownCollectionError extends Error {}
export class ContentExistsError extends Error {
	constructor(
		readonly collection: string,
		readonly slug: string,
	) {
		super(`An entry already exists at ${collection}/${slug}`);
	}
}
export class DisallowedContentError extends Error {
	constructor(readonly found: string[]) {
		super(`Disallowed content: ${found.join(", ")}`);
	}
}

/** File-backed content where every mutation becomes a Git commit. */
export class ContentService {
	private readonly stores = new Map<string, FilesystemContent>();
	private readonly schemas = new Map<string, ReturnType<typeof dataSchema>>();
	private tail: Promise<unknown> = Promise.resolve();
	/** Bumped on every successful mutation; indexes compare it to know when to rebuild. */
	version = 0;
	/** Parsed entries per collection, reused until a mutation (version) or the TTL; see `listEntries`. */
	private readonly listed = new Map<
		string,
		{ at: number; version: number; rows: Array<ContentEntry & { modified: string }> }
	>();

	/** Git allows one writer per repo (index.lock), so mutations run one at a time. */
	private serial<T>(fn: () => Promise<T>): Promise<T> {
		const run = this.tail.then(fn, fn);
		this.tail = run.catch(() => undefined);
		return run;
	}

	constructor(
		private readonly root: string,
		readonly collections: Collection[],
		private readonly git: GitAdapter,
		private readonly options: {
			components?: string[];
			emit?: (event: WebhookEvent) => void;
			/** How long a listing may be reused when files change outside Wuppy (git pull, editor). Default 2 s; 0 turns the cache off. */
			listCacheMs?: number;
		} = {},
	) {
		for (const c of collections) {
			this.stores.set(c.name, new FilesystemContent(root, c));
			this.schemas.set(c.name, dataSchema(c));
		}
	}

	/** MDX components an entry body may use (empty means none). */
	get allowedComponents(): readonly string[] {
		return this.options.components ?? [];
	}

	private emit(type: WebhookEvent["type"], extra: Omit<WebhookEvent, "type" | "at">): void {
		this.version++;
		this.options.emit?.({ type, ...extra, at: new Date().toISOString() });
	}

	private store(name: string): FilesystemContent {
		const s = this.stores.get(name);
		if (!s) throw new UnknownCollectionError(`Unknown collection: ${name}`);
		return s;
	}

	async list(collection: string): Promise<string[]> {
		return this.store(collection).list();
	}

	/**
	 * Metadata for dashboard/search/list views; reads each entry once. A big collection is expensive to read (10k files
	 * take about half a second), so the result is reused until Wuppy itself writes or `listCacheMs` passes.
	 */
	async listEntries(collection: string): Promise<Array<ContentEntry & { modified: string }>> {
		const ttl = this.options.listCacheMs ?? 2000;
		const hit = this.listed.get(collection);
		if (hit && hit.version === this.version && Date.now() - hit.at < ttl) return hit.rows.slice();
		const version = this.version;
		const rows = await this.readEntries(collection);
		this.listed.set(collection, { at: Date.now(), version, rows });
		return rows.slice();
	}

	private async readEntries(collection: string): Promise<Array<ContentEntry & { modified: string }>> {
		const store = this.store(collection);
		const slugs = await store.list();
		const { stat } = await import("node:fs/promises");
		const entries = await Promise.all(
			slugs.map(async (slug) => {
				const entry = await store.get(slug);
				if (!entry) return null;
				let modified = new Date(0).toISOString();
				try {
					modified = (await stat(store.absolutePath(slug))).mtime.toISOString();
				} catch {
					// entry can disappear between list and read
				}
				return { ...entry, modified };
			}),
		);
		return entries.filter((e): e is ContentEntry & { modified: string } => e !== null);
	}

	async get(collection: string, slug: string): Promise<ContentEntry | null> {
		return this.store(collection).get(slug);
	}

	async create(collection: string, slug: string, doc: ParsedDocument, message?: string): Promise<void> {
		const s = this.store(collection);
		const found = findDisallowed(doc.body, this.options.components ?? []);
		if (found.length > 0) throw new DisallowedContentError(found);
		doc = { ...doc, data: this.schemas.get(collection)!.parse(doc.data) };
		await this.serial(async () => {
			if (await s.get(slug)) throw new ContentExistsError(collection, slug);
			await s.put(slug, doc);
			await this.git.commit([s.relPath(slug)], message ?? `content: create ${collection}/${slug}`).catch((e: Error) => {
				if (!/nothing to commit/i.test(e.message)) throw e;
			});
		});
		this.emit("content.updated", { collection, slug });
	}

	async put(collection: string, slug: string, doc: ParsedDocument, message?: string): Promise<void> {
		const s = this.store(collection);
		const found = findDisallowed(doc.body, this.options.components ?? []);
		if (found.length > 0) throw new DisallowedContentError(found);
		doc = { ...doc, data: this.schemas.get(collection)!.parse(doc.data) };
		await this.serial(async () => {
			await s.put(slug, doc);
			await this.git.commit([s.relPath(slug)], message ?? `content: update ${collection}/${slug}`).catch((e: Error) => {
				if (!/nothing to commit/i.test(e.message)) throw e;
			});
		});
		this.emit("content.updated", { collection, slug });
	}

	async delete(collection: string, slug: string): Promise<void> {
		await this.trash(collection, slug);
	}

	/** Move an entry to `.wuppy/trash`; Git keeps the old file too. */
	async trash(collection: string, slug: string): Promise<void> {
		const s = this.store(collection);
		const entry = await s.get(slug);
		if (!entry) return;
		const rel = this.trashRel(collection, slug);
		const path = join(this.root, rel);
		await this.serial(async () => {
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, JSON.stringify({ ...entry, collection, deletedAt: new Date().toISOString() }, null, 2));
			await s.delete(slug);
			await this.git.commit([s.relPath(slug), rel], `content: trash ${collection}/${slug}`);
		});
		this.emit("content.deleted", { collection, slug });
	}

	async listTrash(): Promise<Array<{ collection: string; slug: string; title: string; deletedAt: string }>> {
		const base = join(this.root, ".wuppy", "trash");
		const names = await readdir(base, { recursive: true }).catch(() => [] as string[]);
		const rows = await Promise.all(
			names
				.filter((name) => name.endsWith(".json"))
				.map(async (name) => {
					try {
						const parsed = JSON.parse(await readFile(join(base, name), "utf8")) as {
							collection: string;
							slug: string;
							deletedAt: string;
							data?: Record<string, unknown>;
						};
						return {
							collection: parsed.collection,
							slug: parsed.slug,
							title: typeof parsed.data?.title === "string" ? parsed.data.title : parsed.slug,
							deletedAt: parsed.deletedAt,
						};
					} catch {
						return null;
					}
				}),
		);
		return rows
			.filter((row): row is NonNullable<typeof row> => row !== null)
			.toSorted((a, b) => b.deletedAt.localeCompare(a.deletedAt));
	}

	async restore(collection: string, slug: string): Promise<boolean> {
		const s = this.store(collection);
		const rel = this.trashRel(collection, slug);
		const path = join(this.root, rel);
		try {
			const parsed = JSON.parse(await readFile(path, "utf8")) as ParsedDocument & { deletedAt: string };
			await this.serial(async () => {
				await s.put(slug, { data: parsed.data, body: parsed.body });
				await rm(path, { force: true });
				await this.git.commit([s.relPath(slug), rel], `content: restore ${collection}/${slug}`);
			});
			this.emit("content.updated", { collection, slug });
			return true;
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
			throw e;
		}
	}

	async deleteTrash(collection: string, slug: string): Promise<boolean> {
		void this.store(collection);
		const rel = this.trashRel(collection, slug);
		try {
			await rm(join(this.root, rel));
			await this.git.commit([rel], `content: delete trash ${collection}/${slug}`).catch(() => undefined);
			return true;
		} catch {
			return false;
		}
	}

	private trashRel(collection: string, slug: string): string {
		return `.wuppy/trash/${collection}/${encodeURIComponent(slug)}.json`;
	}

	async history(collection: string, slug: string): Promise<Commit[]> {
		return this.git.history(this.store(collection).relPath(slug));
	}

	/** The entry as it was in commit `sha`, or null if it did not exist then. */
	async revision(collection: string, slug: string, sha: string): Promise<ParsedDocument | null> {
		const text = await this.git.show(sha, this.store(collection).relPath(slug));
		return text === null ? null : parseDocument(text);
	}

	diff(sha: string): Promise<string> {
		return this.git.diff(sha);
	}

	async revert(sha: string): Promise<string> {
		const created = await this.serial(() => this.git.revert(sha));
		this.emit("content.reverted", { sha: created });
		return created;
	}
}
