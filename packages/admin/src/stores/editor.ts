import { atom, computed } from "nanostores";
import { apiData, slugPath } from "../lib/api.ts";

export interface EditorDoc {
	collection: string;
	slug: string;
	data: Record<string, unknown>;
	body: string;
	saved: { data: Record<string, unknown>; body: string };
}

export const $doc = atom<EditorDoc | null>(null);
export const $saving = atom(false);
export const $editorError = atom<string | null>(null);

export const $dirty = computed($doc, (d) =>
	d ? d.body !== d.saved.body || JSON.stringify(d.data) !== JSON.stringify(d.saved.data) : false,
);

interface Entry {
	slug: string;
	data: Record<string, unknown>;
	body: string;
}

export async function openEntry(collection: string, slug: string): Promise<void> {
	$editorError.set(null);
	try {
		const e = await apiData<Entry>("GET", `/api/content/${collection}/${slugPath(slug)}`);
		$doc.set({ collection, slug, data: e.data, body: e.body, saved: { data: e.data, body: e.body } });
	} catch (err) {
		$doc.set(null);
		$editorError.set((err as Error).message);
	}
}

export function newEntry(collection: string, slug: string, data: Record<string, unknown> = {}): void {
	$editorError.set(null);
	$doc.set({ collection, slug, data, body: "", saved: { data: { __new: true }, body: "" } });
}

export function setBody(body: string): void {
	const d = $doc.get();
	if (d && d.body !== body) $doc.set({ ...d, body });
}

export function setField(name: string, value: unknown): void {
	const d = $doc.get();
	if (!d) return;
	const data = { ...d.data, [name]: value };
	if (value === undefined) delete data[name];
	$doc.set({ ...d, data });
}

export async function save(message?: string): Promise<boolean> {
	const d = $doc.get();
	if (!d) return false;
	$saving.set(true);
	$editorError.set(null);
	try {
		if (d.saved.data["__new"] === true) {
			await apiData("POST", `/api/content/${d.collection}`, {
				slug: d.slug,
				data: d.data,
				body: d.body,
				message,
			});
		} else {
			await apiData("PUT", `/api/content/${d.collection}/${slugPath(d.slug)}`, {
				data: d.data,
				body: d.body,
				message,
			});
		}
		$doc.set({ ...d, saved: { data: d.data, body: d.body } });
		return true;
	} catch (err) {
		$editorError.set((err as Error).message);
		return false;
	} finally {
		$saving.set(false);
	}
}
