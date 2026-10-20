import type { ParsedDocument } from "./parsers/frontmatter.ts";

export interface FieldChange {
	field: string;
	/** `undefined` means the field did not exist on that side. */
	before?: unknown;
	after?: unknown;
	kind: "added" | "removed" | "changed";
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Field-by-field summary of two versions of an entry; the Markdown body is reported as the pseudo-field `body`. */
export function diffFields(before: ParsedDocument, after: ParsedDocument): FieldChange[] {
	const changes: FieldChange[] = [];
	for (const field of [...new Set([...Object.keys(before.data), ...Object.keys(after.data)])].toSorted()) {
		const a = before.data[field];
		const b = after.data[field];
		if (same(a, b)) continue;
		if (a === undefined) changes.push({ field, after: b, kind: "added" });
		else if (b === undefined) changes.push({ field, before: a, kind: "removed" });
		else changes.push({ field, before: a, after: b, kind: "changed" });
	}
	if (before.body !== after.body)
		changes.push({ field: "body", before: before.body, after: after.body, kind: "changed" });
	return changes;
}
