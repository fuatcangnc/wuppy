import { atom, map } from "nanostores";
import { apiData } from "../lib/api.ts";

export type FieldDef =
	| string
	| {
			type: string;
			collection?: string;
			taxonomy?: string;
			multiple?: boolean;
			required?: boolean;
			help?: string;
			options?: string[];
			showIf?: { field: string; equals: unknown };
	  };

export type CollectionKind = "posts" | "pages";

export interface CollectionInfo {
	name: string;
	dir: string;
	format: "md" | "mdx";
	kind?: CollectionKind;
	fields: Record<string, FieldDef>;
	route?: string;
}

export interface EntrySummary {
	slug: string;
	data: Record<string, unknown>;
	body: string;
	modified: string;
}

export const $collections = atom<CollectionInfo[]>([]);

/** The admin section a collection fills: `kind` from wuppy.config, else its name (`posts`, `pages`). */
export const kindOf = (c: CollectionInfo): CollectionKind | undefined =>
	c.kind ?? (c.name === "posts" || c.name === "pages" ? c.name : undefined);
/** The collection behind Posts or Pages (a theme may call it `blog` or `about`). */
export const collectionOfKind = (list: CollectionInfo[], kind: CollectionKind): string | undefined =>
	list.find((c) => kindOf(c) === kind)?.name;
export const $entries = map<Record<string, EntrySummary[]>>({});
export const $contentError = atom<string | null>(null);

export async function loadCollections(): Promise<void> {
	try {
		$collections.set(await apiData<CollectionInfo[]>("GET", "/api/collections"));
	} catch (e) {
		$contentError.set((e as Error).message);
	}
}

export async function loadEntries(collection: string): Promise<void> {
	try {
		$entries.setKey(collection, await apiData<EntrySummary[]>("GET", `/api/content/${collection}`));
	} catch (e) {
		$contentError.set((e as Error).message);
	}
}

export async function deleteEntry(collection: string, slug: string): Promise<void> {
	await apiData("DELETE", `/api/content/${collection}/${slug.split("/").map(encodeURIComponent).join("/")}`);
	await loadEntries(collection);
}

export async function duplicateEntry(collection: string, slug: string): Promise<string> {
	const result = await apiData<{ slug: string }>(
		"POST",
		`/api/content/${collection}/${slug.split("/").map(encodeURIComponent).join("/")}/duplicate`,
	);
	await loadEntries(collection);
	return result.slug;
}

export interface TrashItem {
	collection: string;
	slug: string;
	title: string;
	deletedAt: string;
}

export const $trash = atom<TrashItem[]>([]);

export async function loadTrash(): Promise<void> {
	$trash.set(await apiData<TrashItem[]>("GET", "/api/trash"));
}

export async function restoreTrash(item: TrashItem): Promise<void> {
	await apiData("POST", "/api/trash/restore", { collection: item.collection, slug: item.slug });
	await loadTrash();
	await loadEntries(item.collection);
}

export async function deleteTrash(item: TrashItem): Promise<void> {
	await apiData(
		"DELETE",
		`/api/trash?collection=${encodeURIComponent(item.collection)}&slug=${encodeURIComponent(item.slug)}`,
	);
	await loadTrash();
}

export async function setEntryDraft(collection: string, slug: string, draft: boolean): Promise<void> {
	const entry = await apiData<{ data: Record<string, unknown>; body: string }>(
		"GET",
		`/api/content/${collection}/${slug.split("/").map(encodeURIComponent).join("/")}`,
	);
	await apiData("PUT", `/api/content/${collection}/${slug.split("/").map(encodeURIComponent).join("/")}`, {
		data: { ...entry.data, draft: draft || undefined },
		body: entry.body,
		message: draft ? `content: unpublish ${collection}/${slug}` : `content: publish ${collection}/${slug}`,
	});
	await loadEntries(collection);
}

export async function uploadImage(file: File, meta: { alt?: string; folder?: string } = {}): Promise<string> {
	const form = new FormData();
	form.set("file", file);
	if (meta.alt) form.set("alt", meta.alt);
	if (meta.folder) form.set("folder", meta.folder);
	return (await apiData<{ url: string }>("POST", "/api/media", form)).url;
}

export interface MediaItem {
	url: string;
	name: string;
	size: number;
	modified: string;
	alt?: string;
	title?: string;
	caption?: string;
	folder?: string;
	focalX?: number;
	focalY?: number;
	credit?: string;
	width?: number;
	height?: number;
}

export const $media = atom<MediaItem[]>([]);
export const $mediaFolders = atom<string[]>([]);

export async function loadMedia(): Promise<void> {
	try {
		$media.set(await apiData<MediaItem[]>("GET", "/api/media"));
		$mediaFolders.set(await apiData<string[]>("GET", "/api/media/folders"));
	} catch (e) {
		$contentError.set((e as Error).message);
	}
}

export async function updateMedia(url: string, patch: Partial<MediaItem>): Promise<void> {
	await apiData("PATCH", `/api/media/meta?url=${encodeURIComponent(url)}`, patch);
	await loadMedia();
}

/** Throws ApiError `IN_USE` while an entry still references the file, unless `force`. */
export async function deleteMedia(url: string, force = false): Promise<void> {
	await apiData("DELETE", `/api/media?url=${encodeURIComponent(url)}${force ? "&force=1" : ""}`);
	await loadMedia();
}

export async function replaceMedia(url: string, file: File): Promise<void> {
	const form = new FormData();
	form.set("file", file);
	await apiData("PUT", `/api/media/replace?url=${encodeURIComponent(url)}`, form);
	await loadMedia();
}

export async function deleteUnusedMedia(): Promise<number> {
	const { deleted } = await apiData<{ deleted: number }>("DELETE", "/api/media/orphans");
	await loadMedia();
	return deleted;
}

export async function renameMediaFolder(from: string, to: string): Promise<void> {
	await apiData("POST", "/api/media/folders/rename", { from, to });
	await loadMedia();
}

export async function deleteMediaFolder(name: string): Promise<void> {
	await apiData("DELETE", `/api/media/folders?name=${encodeURIComponent(name)}`);
	await loadMedia();
}

export async function saveMediaFolders(folders: string[]): Promise<void> {
	await apiData("PUT", "/api/media/folders", { folders });
	await loadMedia();
}
