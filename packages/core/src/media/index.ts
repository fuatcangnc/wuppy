import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import type { GitAdapter } from "@wuppy/git";
import type { WebhookEvent } from "../webhooks/index.ts";
import type { JsonStore } from "../data/store.ts";

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
		if (this.store) await this.store.write("media", { ...data, meta: { ...data.meta, [url]: next } }, `media: update ${url}`);
		return next;
	}

	async upload(bytes: Uint8Array, meta: MediaMeta = {}): Promise<{ url: string; path: string }> {
		if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new MediaTooLargeError("File too large");
		const type = detectImage(bytes);
		if (!type) throw new UnsupportedMediaError("Only PNG, JPEG, GIF and WebP images are allowed");
		const now = new Date();
		const rel = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${type.ext}`;
		const path = join(this.root, "public", "uploads", rel);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, bytes);
		const url = `/uploads/${rel}`;
		if (Object.keys(meta).length) await this.update(url, meta);
		await this.git.commit([`public/uploads/${rel}`], `media: upload ${rel}`);
		this.emit?.({ type: "media.uploaded", url, at: now.toISOString() });
		return { url, path: `public/uploads/${rel}` };
	}

	async delete(url: string): Promise<void> {
		const rel = url.replace(/^\/uploads\//, "");
		if (!rel || rel.includes("..") || rel.startsWith("/")) throw new UnsupportedMediaError("Invalid media url");
		const path = join(this.root, "public", "uploads", rel);
		await rm(path, { force: true });
		await this.git.commit([`public/uploads/${rel}`], `media: delete ${rel}`).catch((e: Error) => {
			if (!/nothing to commit/i.test(e.message)) throw e;
		});
	}
}

/** Serves files from `<root>/public/uploads`; only known image extensions, never outside that directory. */
export async function serveUpload(root: string, rel: string): Promise<Response> {
	const base = resolve(root, "public", "uploads");
	const target = resolve(base, rel);
	const mime = MIME_BY_EXT[extname(target).toLowerCase()];
	if (!mime || !target.startsWith(base + sep)) return new Response("Not found", { status: 404 });
	try {
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
