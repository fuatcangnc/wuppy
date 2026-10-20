import { atom, computed } from "nanostores";
import { ApiError, api, apiData, slugPath } from "../lib/api.ts";

interface Fields {
	data: Record<string, unknown>;
	body: string;
}

export interface EditorDoc extends Fields {
	collection: string;
	slug: string;
	saved: Fields;
	/** Version the editor started from; sent as `If-Match` so a concurrent edit is noticed. */
	etag?: string;
}

export interface Conflict {
	/** What is on the server now. */
	theirs: Fields;
}

export interface Recovery extends Fields {
	savedAt: string;
}

export const $doc = atom<EditorDoc | null>(null);
export const $saving = atom(false);
export const $editorError = atom<string | null>(null);
/** Set when the server copy changed since this editor loaded it. */
export const $conflict = atom<Conflict | null>(null);
/** Unsaved work found from an earlier session. */
export const $recovery = atom<Recovery | null>(null);
export const $autosaved = atom<string | null>(null);

export interface LockHolder {
	name: string;
	since: string;
}
/** Another person is editing this entry right now; saving is blocked until the user takes over. */
export const $lockedBy = atom<LockHolder | null>(null);

export const $dirty = computed($doc, (d) =>
	d ? d.body !== d.saved.body || JSON.stringify(d.data) !== JSON.stringify(d.saved.data) : false,
);

interface Entry extends Fields {
	slug: string;
}

const AUTOSAVE_MS = 2000;
let timer: ReturnType<typeof setTimeout> | undefined;
const stopAutosave = () => clearTimeout(timer);

/** Writes a recovery copy (never a Git revision) a moment after the last keystroke. */
function scheduleAutosave(): void {
	stopAutosave();
	timer = setTimeout(() => {
		const d = $doc.get();
		if (!d || !$dirty.get() || d.saved.data["__new"] === true) return;
		void apiData<{ savedAt: string }>("PUT", `/api/autosave/${d.collection}/${slugPath(d.slug)}`, {
			data: d.data,
			body: d.body,
		})
			.then((a) => $autosaved.set(a.savedAt))
			.catch(() => undefined); // recovery is best effort; the real save reports errors
	}, AUTOSAVE_MS);
}

export async function openEntry(collection: string, slug: string): Promise<void> {
	stopAutosave();
	$editorError.set(null);
	$conflict.set(null);
	$recovery.set(null);
	$autosaved.set(null);
	try {
		const { data: e, etag } = await api<{ data: Entry; etag?: string }>(
			"GET",
			`/api/content/${collection}/${slugPath(slug)}`,
		);
		$doc.set({ collection, slug, data: e.data, body: e.body, saved: { data: e.data, body: e.body }, etag });
	} catch (err) {
		$doc.set(null);
		$editorError.set((err as Error).message);
		return;
	}
	try {
		const found = await apiData<(Fields & { savedAt: string }) | null>(
			"GET",
			`/api/autosave/${collection}/${slugPath(slug)}`,
		);
		const d = $doc.get();
		if (found && d && (found.body !== d.body || JSON.stringify(found.data) !== JSON.stringify(d.data))) {
			$recovery.set(found);
		}
	} catch {
		// no recovery available (older server, no permission): carry on
	}
}

export function newEntry(collection: string, slug: string, data: Record<string, unknown> = {}): void {
	stopAutosave();
	$editorError.set(null);
	$conflict.set(null);
	$recovery.set(null);
	$doc.set({ collection, slug, data, body: "", saved: { data: { __new: true }, body: "" } });
}

export function restoreRecovery(): void {
	const r = $recovery.get();
	const d = $doc.get();
	if (r && d) $doc.set({ ...d, data: r.data, body: r.body });
	$recovery.set(null);
}

export async function discardRecovery(): Promise<void> {
	const d = $doc.get();
	$recovery.set(null);
	if (d) await api("DELETE", `/api/autosave/${d.collection}/${slugPath(d.slug)}`).catch(() => undefined);
}

export function setBody(body: string): void {
	const d = $doc.get();
	if (d && d.body !== body) {
		$doc.set({ ...d, body });
		scheduleAutosave();
	}
}

export function setField(name: string, value: unknown): void {
	const d = $doc.get();
	if (!d) return;
	const data = { ...d.data, [name]: value };
	if (value === undefined) delete data[name];
	$doc.set({ ...d, data });
	scheduleAutosave();
}

/** `force` overwrites whatever is on the server (used after a conflict, when the user chose "keep mine"). */
export async function save(message?: string, force = false): Promise<boolean> {
	const d = $doc.get();
	if (!d || $lockedBy.get()) return false;
	stopAutosave();
	$saving.set(true);
	$editorError.set(null);
	try {
		let etag: string | undefined;
		if (d.saved.data["__new"] === true) {
			etag = (
				await apiData<{ etag?: string }>("POST", `/api/content/${d.collection}`, {
					slug: d.slug,
					data: d.data,
					body: d.body,
					message,
				})
			).etag;
		} else {
			etag = (
				await api<{ data: { etag?: string } }>(
					"PUT",
					`/api/content/${d.collection}/${slugPath(d.slug)}`,
					{ data: d.data, body: d.body, message },
					d.etag && !force ? { "If-Match": d.etag } : {},
				)
			).data.etag;
		}
		$conflict.set(null);
		$recovery.set(null);
		$autosaved.set(null);
		$doc.set({ ...d, saved: { data: d.data, body: d.body }, etag });
		return true;
	} catch (err) {
		if (err instanceof ApiError && err.code === "CONFLICT") {
			const current = (err.details as { current?: Fields } | undefined)?.current;
			if (current) $conflict.set({ theirs: { data: current.data, body: current.body } });
		}
		$editorError.set((err as Error).message);
		return false;
	} finally {
		$saving.set(false);
	}
}

/** Take the server's version and drop local edits. */
export async function useTheirs(): Promise<void> {
	const d = $doc.get();
	if (d) await openEntry(d.collection, d.slug);
}

/** Flip the draft flag and save in one step. The server decides whether this user may publish. */
export async function setPublished(published: boolean): Promise<boolean> {
	setField("draft", published ? undefined : true);
	return save(published ? "content: publish" : "content: unpublish");
}

const lockUrl = (d: { collection: string; slug: string }) => `/api/locks/${d.collection}/${slugPath(d.slug)}`;

/** Claim (or refresh) the edit lock. Call on open and then as a heartbeat. */
export async function claimLock(force = false): Promise<void> {
	const d = $doc.get();
	if (!d || d.saved.data["__new"] === true) return;
	try {
		$lockedBy.set(await apiData<LockHolder | null>("PUT", `${lockUrl(d)}${force ? "?force=1" : ""}`));
	} catch {
		$lockedBy.set(null); // locks are advisory; never block editing because the lock service failed
	}
}

export async function releaseLock(collection: string, slug: string): Promise<void> {
	$lockedBy.set(null);
	await api("DELETE", lockUrl({ collection, slug })).catch(() => undefined);
}
