/** Small helpers for public templates. Pure functions: no I/O, safe to import in any Astro page. */

/** Whole minutes to read `text` at `wpm` words per minute, at least 1. */
export function readingTime(text: string, wpm = 200): number {
	const words = text.match(/[\p{L}\p{N}']+/gu)?.length ?? 0;
	return Math.max(1, Math.ceil(words / wpm));
}

export interface Page<T> {
	items: T[];
	page: number;
	pages: number;
	prev: number | null;
	next: number | null;
}

/** 1-based pagination; out-of-range or non-numeric pages clamp to the nearest valid one. */
export function paginate<T>(all: readonly T[], page: number | string | null | undefined, size = 10): Page<T> {
	const pages = Math.max(1, Math.ceil(all.length / size));
	const requested = Math.floor(Number(page));
	const current = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), pages) : 1;
	return {
		items: all.slice((current - 1) * size, current * size),
		page: current,
		pages,
		prev: current > 1 ? current - 1 : null,
		next: current < pages ? current + 1 : null,
	};
}

/** Entries sharing the most values of `key` (tags, categories) with `current`, best first; `current` itself is excluded. */
export function related<T extends { id: string; data: Record<string, unknown> }>(
	current: T,
	all: readonly T[],
	key: string,
	limit = 3,
): T[] {
	const values = (e: T) => (Array.isArray(e.data[key]) ? (e.data[key] as unknown[]).map(String) : []);
	const mine = new Set(values(current));
	return all
		.filter((e) => e.id !== current.id)
		.map((e) => ({ e, score: values(e).filter((v) => mine.has(v)).length }))
		.filter((x) => x.score > 0)
		.toSorted((a, b) => b.score - a.score || a.e.id.localeCompare(b.e.id))
		.slice(0, limit)
		.map((x) => x.e);
}

/** `srcset` for an uploaded image: one allowlisted width per entry, in `format` (default WebP). */
export function imageSrcset(
	url: string,
	widths: readonly number[] = [480, 768, 1024, 1600],
	format: "webp" | "avif" | "jpeg" | "png" = "webp",
	crop?: { ratio: string; focalX?: number; focalY?: number },
): string {
	const extra = crop
		? `&ar=${crop.ratio}${crop.focalX === undefined ? "" : `&fx=${crop.focalX}`}${crop.focalY === undefined ? "" : `&fy=${crop.focalY}`}`
		: "";
	return widths.map((w) => `${url}?w=${w}&format=${format}${extra} ${w}w`).join(", ");
}

export { hreflangAlternates, localeSwitcher, resolveLocale, splitLocale, type LocaleLink } from "../i18n/index.ts";
