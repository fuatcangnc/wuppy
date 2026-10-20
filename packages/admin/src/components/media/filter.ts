import type { MediaItem } from "../../stores/content.ts";

/** Filters the library list; `from`/`to` are `YYYY-MM-DD`, inclusive. */
export function filterMedia(
	items: MediaItem[],
	f: { folder: string; query: string; type: string; from: string; to: string },
): MediaItem[] {
	const needle = f.query.trim().toLowerCase();
	return items.filter((item) => {
		if (f.folder !== "all" && (item.folder ?? "") !== f.folder) return false;
		if (needle && !`${item.name} ${item.alt ?? ""} ${item.title ?? ""}`.toLowerCase().includes(needle)) return false;
		if (
			f.type &&
			item.name.split(".").pop()?.toLowerCase() !== f.type &&
			!(f.type === "jpg" && item.name.endsWith(".jpeg"))
		)
			return false;
		const day = item.modified.slice(0, 10);
		if (f.from && day < f.from) return false;
		if (f.to && day > f.to) return false;
		return true;
	});
}
