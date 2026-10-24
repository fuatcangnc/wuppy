import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import type { GitAdapter } from "@wuppycms/git";
import type { WebhookEvent } from "../webhooks/index.ts";
import type { JsonStore } from "../data/store.ts";
import { imageInfo, parseVariant, renderVariant } from "./optimize.ts";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export class MediaTooLargeError extends Error {}
export class UnsupportedMediaError extends Error {}

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

export function detectImage(b: Uint8Array): { mime: string; ext: string } | null {
	if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === "PNG") return { mime: "image/png", ext: "png" };
	if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
	if (b.length >= 6 && /^GIF8[79]a$/.test(ascii(b, 0, 6))) return { mime: "image/gif", ext: "gif" };
	if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP")
		return { mime: "image/webp", ext: "webp" };
	return null;
}

const MIME_BY_EXT: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
};

export interface MediaMeta {
	alt?: string;
	title?: string;
	caption?: string;
	folder?: string;
	/** Focal point percentages (0–100), used by themes for object-position. */
	focalX?: number;
	focalY?: number;
	credit?: string;
	/** Set on upload when `sharp` is available. */
	width?: number;
	height?: number;
	lqip?: string;
}

export interface MediaItem extends MediaMeta {
	url: string;
	name: string;
	size: number;
	modified: string;
}

interface MediaData {
	meta: Record<string, MediaMeta>;
	folders: string[];
}

const EMPTY: MediaData = { meta: {}, folders: [] };

export class MediaService {
	constructor(
		private readonly root: string,
		private readonly git: GitAdapter,
		private readonly emit?: (event: WebhookEvent) => void,
		private readonly store?: JsonStore,
		/** Plugins' before-hook: may refuse a file (throw) after Wuppy's own checks passed, before it is written. */
		private readonly beforeUpload?: (file: { mime: string; size: number; replaces?: string }) => Promise<void>,
	) {}

	private async data(): Promise<MediaData> {
		if (!this.store) return EMPTY;
		return this.store.read<MediaData>("media", EMPTY);
	}

	async list(): Promise<MediaItem[]> {
		const base = join(this.root, "public", "uploads");
		const names = await readdir(base, { recursive: true }).catch(() => [] as string[]);
		const meta = (await this.data()).meta;
		const items = await Promise.all(
			names
				.filter((n) => MIME_BY_EXT[extname(n).toLowerCase()])
				.map(async (n) => {
					const s = await stat(join(base, n));
					const url = `/uploads/${n.split("\\").join("/")}`;
					return {
						url,
						name: n.split("\\").join("/"),
						size: s.size,
						modified: s.mtime.toISOString(),
						...meta[url],
					};
				}),
		);
		return items.toSorted((a, b) => b.modified.localeCompare(a.modified) || b.url.localeCompare(a.url));
	}

	async folders(): Promise<string[]> {
		return (await this.data()).folders;
	}

	async saveFolders(folders: string[]): Promise<void> {
		const data = await this.data();
		await this.store?.write("media", { ...data, folders }, "media: folders");
	}

	async update(url: string, patch: MediaMeta): Promise<MediaMeta> {
		const data = await this.data();
		const next = { ...data.meta[url], ...patch };
		if (this.store)
			await this.store.write("media", { ...data, meta: { ...data.meta, [url]: next } }, `media: update ${url}`);
		return next;
	}

	/** Site settings may only tighten the built-in limits: the hard cap and the magic-byte check always apply. */
	private async limits(): Promise<{ maxBytes: number; allowed: string[] | null }> {
		const media = (
			(await this.store?.read<{ media?: { maxBytes?: number; allowed?: string[] } }>("settings", {})) ?? {}
		).media;
		return {
			maxBytes: Math.min(media?.maxBytes ?? MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES),
			allowed: media?.allowed ?? null,
		};
	}

	/** Ignored upload directories are valid; a missing Git stage must not fail the upload after the bytes are written. */
	private async commit(rel: string, message: string): Promise<void> {
		await this.git.commit([`public/uploads/${rel}`], message).catch((e: Error) => {
			if (!/nothing to commit|ignored by one of your \.gitignore|paths are ignored/i.test(e.message)) throw e;
		});
	}

	async upload(bytes: Uint8Array, meta: MediaMeta = {}): Promise<{ url: string; path: string }> {
		const limits = await this.limits();
		if (bytes.byteLength > limits.maxBytes) throw new MediaTooLargeError("File too large");
		const type = detectImage(bytes);
		if (!type) throw new UnsupportedMediaError("Only PNG, JPEG, GIF and WebP images are allowed");
		if (limits.allowed && !limits.allowed.includes(type.mime)) {
			throw new UnsupportedMediaError(`${type.mime} uploads are turned off in Settings`);
		}
		await this.beforeUpload?.({ mime: type.mime, size: bytes.byteLength });
		const now = new Date();
		const rel = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${type.ext}`;
		const path = join(this.root, "public", "uploads", rel);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, bytes);
		const url = `/uploads/${rel}`;
		const info = await imageInfo(bytes);
		if (Object.keys(meta).length || info) await this.update(url, { ...meta, ...info });
		await this.commit(rel, `media: upload ${rel}`);
		this.emit?.({ type: "media.uploaded", url, at: now.toISOString() });
		return { url, path: `public/uploads/${rel}` };
	}

	private relOf(url: string): string {
		const rel = url.replace(/^\/uploads\//, "");
		if (!rel || rel.includes("..") || rel.startsWith("/")) throw new UnsupportedMediaError("Invalid media url");
		return rel;
	}

	/** Overwrites a file with a new image of the same type. The old bytes stay reachable through Git history. */
	async replace(url: string, bytes: Uint8Array): Promise<void> {
		const rel = this.relOf(url);
		const limits = await this.limits();
		if (bytes.byteLength > limits.maxBytes) throw new MediaTooLargeError("File too large");
		const type = detectImage(bytes);
		if (!type) throw new UnsupportedMediaError("Only PNG, JPEG, GIF and WebP images are allowed");
		const current = MIME_BY_EXT[extname(rel).toLowerCase()];
		if (!current) throw new UnsupportedMediaError("Invalid media url");
		if (current !== type.mime) throw new UnsupportedMediaError(`Replacement must be ${current}`);
		const path = join(this.root, "public", "uploads", rel);
		await stat(path).catch(() => {
			throw new UnsupportedMediaError("Unknown media file");
		});
		await this.beforeUpload?.({ mime: type.mime, size: bytes.byteLength, replaces: url });
		await writeFile(path, bytes);
		const info = await imageInfo(bytes);
		if (info) await this.update(url, info);
		await this.commit(rel, `media: replace ${rel}`);
	}

	/** Renames a folder (and everything below it) in the folder list and on every item. */
	async renameFolder(from: string, to: string): Promise<void> {
		const data = await this.data();
		const swap = (f: string) => (f === from ? to : f.startsWith(`${from}/`) ? `${to}${f.slice(from.length)}` : f);
		const folders = [...new Set(data.folders.map(swap))];
		const meta = Object.fromEntries(
			Object.entries(data.meta).map(([url, m]) => [url, m.folder ? { ...m, folder: swap(m.folder) } : m]),
		);
		await this.store?.write("media", { folders, meta }, `media: rename folder ${from}`);
	}

	/** Removes a folder tree; its files stay in the library, unfiled. */
	async deleteFolder(name: string): Promise<void> {
		const data = await this.data();
		const inside = (f: string) => f === name || f.startsWith(`${name}/`);
		const meta = Object.fromEntries(
			Object.entries(data.meta).map(([url, m]) => {
				const { folder, ...rest } = m;
				return [url, folder && inside(folder) ? rest : m];
			}),
		);
		await this.store?.write(
			"media",
			{ folders: data.folders.filter((f) => !inside(f)), meta },
			`media: delete folder ${name}`,
		);
	}

	async delete(url: string): Promise<void> {
		const rel = this.relOf(url);
		const path = join(this.root, "public", "uploads", rel);
		await rm(path, { force: true });
		await this.commit(rel, `media: delete ${rel}`);
	}
}

/** Serves files from `<root>/public/uploads`; only known image extensions, never outside that directory. */
export async function serveUpload(root: string, rel: string, params = new URLSearchParams()): Promise<Response> {
	const base = resolve(root, "public", "uploads");
	const target = resolve(base, rel);
	const mime = MIME_BY_EXT[extname(target).toLowerCase()];
	if (!mime || !target.startsWith(base + sep)) return new Response("Not found", { status: 404 });
	const variant = parseVariant(params);
	if (variant === "invalid") return new Response("Unsupported size or format", { status: 400 });
	try {
		// Animated GIFs would lose their frames; they are always served as uploaded.
		if (variant && mime !== "image/gif") {
			const rendered = await renderVariant(root, target, (await stat(target)).mtimeMs, variant);
			if (rendered) {
				return new Response(Buffer.from(rendered.bytes), {
					headers: {
						"content-type": rendered.mime,
						"x-content-type-options": "nosniff",
						"cache-control": "public, max-age=31536000, immutable",
						vary: "Accept",
					},
				});
			}
		}
		return new Response(await readFile(target), {
			headers: {
				"content-type": mime,
				"x-content-type-options": "nosniff",
				"cache-control": "public, max-age=31536000, immutable",
			},
		});
	} catch {
		return new Response("Not found", { status: 404 });
	}
}
