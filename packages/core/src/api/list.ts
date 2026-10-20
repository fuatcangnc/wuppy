import { createHash } from "node:crypto";
import { entryStatus } from "../publishing/index.ts";

export interface Listed {
	slug: string;
	data: Record<string, unknown>;
	body: string;
	modified: string;
}

export interface ListQuery {
	q?: string;
	status?: string;
	sort?: string;
	limit?: string;
	cursor?: string;
	/** Byline slug in the `author` field. */
	author?: string;
	/** Language: the slug starts with `<lang>/`. */
	lang?: string;
	/** Modified on or after / before this ISO date. */
	from?: string;
	to?: string;
}

const title = (e: Listed) => (typeof e.data.title === "string" ? e.data.title : e.slug);
const statusOf = (e: Listed) => entryStatus(e.data);

/** Filter, sort and cursor-paginate. Without `limit` everything is returned (no cursor), so existing callers keep working. */
export function queryEntries(
	entries: Listed[],
	{ q, status, sort = "-modified", limit, cursor, author, lang, from, to }: ListQuery,
) {
	let rows = entries;
	const needle = q?.trim().toLowerCase();
	if (needle) rows = rows.filter((e) => `${title(e)}\n${e.slug}\n${e.body}`.toLowerCase().includes(needle));
	if (status) rows = rows.filter((e) => statusOf(e) === status);
	if (author) rows = rows.filter((e) => e.data.author === author);
	if (lang) rows = rows.filter((e) => e.slug.startsWith(`${lang}/`));
	if (from) rows = rows.filter((e) => e.modified >= from);
	if (to) rows = rows.filter((e) => e.modified < to);
	const desc = sort.startsWith("-");
	const key = desc ? sort.slice(1) : sort;
	const value = (e: Listed) => (key === "title" ? title(e).toLowerCase() : key === "slug" ? e.slug : e.modified);
	rows = rows.toSorted((a, b) => (desc ? -1 : 1) * value(a).localeCompare(value(b)) || a.slug.localeCompare(b.slug));
	const total = rows.length;
	const size = Math.min(Math.max(Number(limit) || 0, 0), 200);
	if (!size) return { rows, total };
	const start = cursor ? Math.max(rows.findIndex((e) => e.slug === cursor) + 1, 0) : 0;
	const page = rows.slice(start, start + size);
	const last = page.at(-1);
	return { rows: page, total, nextCursor: start + size < total && last ? last.slug : null };
}

/** Weak validator over what an editor can change. */
export const etagOf = (entry: { data: unknown; body: string }) =>
	`W/"${createHash("sha1")
		.update(JSON.stringify([entry.data, entry.body]))
		.digest("hex")
		.slice(0, 16)}"`;
