import { fieldKind, type Collection } from "../content-types/index.ts";
import type { ContentService } from "../content/service.ts";
import { isPublished } from "../publishing/index.ts";
import type { Taxonomy } from "../data/schemas.ts";

/** Frontmatter fields that hold terms of `taxonomy`: `taxonomy` fields naming it, or named like it. */
export function termFields(collection: Collection, taxonomy: string): string[] {
	return Object.entries(collection.fields)
		.filter(([name, f]) => {
			if (fieldKind(f) !== "taxonomy") return false;
			return (typeof f === "object" && f.taxonomy ? f.taxonomy : name) === taxonomy;
		})
		.map(([name]) => name);
}

const valuesOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : []);

export interface TermCount {
	total: number;
	published: number;
}

/** `{ taxonomy: { term: { total, published } } }`, counting each entry once per term. */
export async function termCounts(
	service: ContentService,
	taxonomies: readonly Taxonomy[],
): Promise<Record<string, Record<string, TermCount>>> {
	const out: Record<string, Record<string, TermCount>> = {};
	for (const t of taxonomies) {
		const counts: Record<string, TermCount> = Object.fromEntries(
			t.terms.map((x) => [x.slug, { total: 0, published: 0 }]),
		);
		for (const c of service.collections) {
			const fields = termFields(c, t.name);
			if (fields.length === 0) continue;
			for (const entry of await service.listEntries(c.name)) {
				const slugs = new Set(fields.flatMap((f) => valuesOf(entry.data[f])));
				for (const slug of slugs) {
					const row = (counts[slug] ??= { total: 0, published: 0 });
					row.total++;
					if (isPublished(entry.data)) row.published++;
				}
			}
		}
		out[t.name] = counts;
	}
	return out;
}

/**
 * Replaces term `from` by `into` in every entry (each save is a Git commit), then returns how many entries changed.
 * An entry that already has `into` simply loses `from`.
 */
export async function retagEntries(
	service: ContentService,
	taxonomy: string,
	from: string,
	into: string | null,
	message: string,
): Promise<number> {
	let changed = 0;
	for (const c of service.collections) {
		const fields = termFields(c, taxonomy);
		for (const entry of await service.listEntries(c.name)) {
			const data = { ...entry.data };
			let touched = false;
			for (const f of fields) {
				const current = data[f];
				const list = valuesOf(current);
				if (!list.includes(from)) continue;
				const next = [...new Set(list.flatMap((x) => (x === from ? (into ? [into] : []) : [x])))];
				if (Array.isArray(current)) data[f] = next;
				else if (next[0] !== undefined) data[f] = next[0];
				else delete data[f];
				touched = true;
			}
			if (touched) {
				await service.put(c.name, entry.slug, { data, body: entry.body }, message);
				changed++;
			}
		}
	}
	return changed;
}

export interface TermNode {
	slug: string;
	name: string;
	description: string;
	order: number;
	children: TermNode[];
}

/** Terms as a tree (flat taxonomies give a flat list), siblings sorted by order then name. */
export function termTree(taxonomy: Taxonomy): TermNode[] {
	const nodes = new Map<string, TermNode>(
		taxonomy.terms.map((t) => [
			t.slug,
			{ slug: t.slug, name: t.name, description: t.description, order: t.order, children: [] },
		]),
	);
	const roots: TermNode[] = [];
	for (const t of taxonomy.terms) {
		const node = nodes.get(t.slug)!;
		const parent = t.parent ? nodes.get(t.parent) : undefined;
		(parent ? parent.children : roots).push(node);
	}
	const sort = (list: TermNode[]) => {
		list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
		list.forEach((n) => sort(n.children));
		return list;
	};
	return sort(roots);
}
