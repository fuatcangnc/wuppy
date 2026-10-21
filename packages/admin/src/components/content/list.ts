import type { EntrySummary } from "../../stores/content.ts";

export const DEFAULT_PAGE_SIZE = 20;
export const TONES = { published: "success", draft: "warning", scheduled: "accent" } as const;

export type ContentStatus = keyof typeof TONES;
export type Row = EntrySummary & { status: ContentStatus };

export interface ContentListPage {
	data: Row[];
	total: number;
	nextCursor: string | null;
}

export interface Filters {
	q: string;
	status: string;
	sort: string;
	author: string;
	lang: string;
	from: string;
	to: string;
}

export const NO_FILTERS: Filters = { q: "", status: "", sort: "-modified", author: "", lang: "", from: "", to: "" };

/** Query string for the list API: only filters that are set, dates widened to whole days. */
export function listQuery(f: Filters, page = 1, pageSize = DEFAULT_PAGE_SIZE): string {
	const params = new URLSearchParams({
		limit: String(pageSize),
		offset: String((Math.max(page, 1) - 1) * pageSize),
		sort: f.sort,
	});
	for (const key of ["q", "status", "author", "lang"] as const) if (f[key].trim()) params.set(key, f[key].trim());
	if (f.from) params.set("from", `${f.from}T00:00:00.000Z`);
	if (f.to) params.set("to", `${new Date(new Date(`${f.to}T00:00:00.000Z`).getTime() + 86_400_000).toISOString()}`);
	return params.toString();
}
