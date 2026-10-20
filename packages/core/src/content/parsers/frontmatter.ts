import { parse, stringify } from "yaml";

export interface ParsedDocument {
	data: Record<string, unknown>;
	body: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseDocument(source: string): ParsedDocument {
	const m = FENCE.exec(source);
	if (!m) return { data: {}, body: source };
	const data: unknown = parse(m[1] ?? "");
	if (data !== null && (typeof data !== "object" || Array.isArray(data))) {
		throw new Error("Frontmatter must be a YAML mapping");
	}
	return { data: (data as Record<string, unknown> | null) ?? {}, body: source.slice(m[0].length) };
}

/** Unknown keys in `data` are written back untouched. */
export function serializeDocument({ data, body }: ParsedDocument): string {
	const head = Object.keys(data).length ? `---\n${stringify(data)}---\n` : "";
	return head + body;
}
