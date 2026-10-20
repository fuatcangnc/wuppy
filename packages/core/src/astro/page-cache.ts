import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Id of the current Git commit. Every content, media and settings write is a commit, so it changes exactly when pages can.
 * Null without a repository: nothing signals a change then, so nothing is cached.
 */
export async function contentVersion(root: string): Promise<string | null> {
	try {
		const head = (await readFile(join(root, ".git", "HEAD"), "utf8")).trim();
		if (!head.startsWith("ref: ")) return head;
		const ref = head.slice(5);
		const loose = await readFile(join(root, ".git", ref), "utf8").catch(() => "");
		if (loose) return loose.trim();
		const packed = await readFile(join(root, ".git", "packed-refs"), "utf8");
		return (
			packed
				.split("\n")
				.find((line) => line.endsWith(` ${ref}`))
				?.split(" ")[0] ?? "unknown"
		);
	} catch {
		return null;
	}
}

interface Entry {
	version: string;
	at: number;
	body: string;
	etag: string;
	headers: Array<[string, string]>;
}

/**
 * Rendered public pages, reused until the next commit. A page can also change without one (a scheduled post
 * going live), so an entry is dropped after `maxAgeMs` too.
 */
export class PageCache {
	private readonly entries = new Map<string, Entry>();

	constructor(
		private readonly maxEntries = 500,
		private readonly maxBytes = 512 * 1024,
		private readonly maxAgeMs = 60_000,
	) {}

	get(key: string, version: string, now = Date.now()): Entry | undefined {
		const hit = this.entries.get(key);
		if (!hit) return undefined;
		if (hit.version !== version || now - hit.at > this.maxAgeMs) {
			this.entries.delete(key);
			return undefined;
		}
		return hit;
	}

	set(key: string, version: string, body: string, headers: Array<[string, string]>, now = Date.now()): Entry | null {
		if (body.length > this.maxBytes) return null;
		if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
		const entry = {
			version,
			at: now,
			body,
			headers,
			etag: `W/"${createHash("sha1").update(body).digest("hex").slice(0, 20)}"`,
		};
		this.entries.set(key, entry);
		return entry;
	}
}

const SKIP_PATH = /^\/(admin|api|uploads|_astro)(\/|$)/;

/**
 * Wraps page rendering: serves cached HTML, adds an ETag, and answers `If-None-Match` with 304.
 * Previews, edit mode, non-GET requests and anything that sets cookies or forbids storing are passed through.
 */
export function createPageCacheMiddleware(root: string, cache = new PageCache(), enabled = true) {
	return async (ctx: { request: Request; url: URL }, next: () => Promise<Response>): Promise<Response> => {
		const { request, url } = ctx;
		const params = url.searchParams;
		if (
			!enabled ||
			request.method !== "GET" ||
			SKIP_PATH.test(url.pathname) ||
			params.has("wuppy-preview") ||
			params.has("wuppy-edit")
		) {
			return next();
		}
		const key = url.pathname + url.search;
		const version = await contentVersion(root);
		if (!version) return next();
		const reply = (e: { etag: string; body: string; headers: Array<[string, string]> }) => {
			const headers = new Headers(e.headers);
			headers.set("ETag", e.etag);
			headers.set("Cache-Control", "public, max-age=0, must-revalidate");
			if (request.headers.get("if-none-match") === e.etag) return new Response(null, { status: 304, headers });
			return new Response(e.body, { status: 200, headers });
		};
		const hit = cache.get(key, version);
		if (hit) return reply(hit);

		const res = await next();
		const type = res.headers.get("content-type") ?? "";
		if (
			res.status !== 200 ||
			!type.includes("text/html") ||
			res.headers.has("set-cookie") ||
			/no-store|private/.test(res.headers.get("cache-control") ?? "")
		)
			return res;
		const body = await res.clone().text();
		const stored = cache.set(key, version, body, [["content-type", type]]);
		return stored ? reply(stored) : res;
	};
}
