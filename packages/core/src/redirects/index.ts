import { z } from "zod";

/** Same-site path, or an absolute http(s) URL. Rules out `//host` (open redirect) and `javascript:`. */
const target = z
	.string()
	.refine(
		(t) => (t.startsWith("/") && !t.startsWith("//")) || /^https?:\/\//i.test(t),
		"Target must be a /path or http(s) URL",
	);

/** A regex that backtracks catastrophically on crafted paths would stall every request, so nested quantifiers are refused. */
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/;

function validRegex(source: string): boolean {
	if (source.length > 200 || NESTED_QUANTIFIER.test(source)) return false;
	try {
		return new RegExp(source) instanceof RegExp;
	} catch {
		return false;
	}
}

const rule = z
	.object({
		from: z.string().min(1).max(500),
		to: target,
		status: z.union([z.literal(301), z.literal(302)]).default(301),
		/** `exact` path, `wildcard` (`/blog/*` → `$1` in the target) or `regex` (capture groups as `$1`…). */
		match: z.enum(["exact", "wildcard", "regex"]).default("exact"),
		/** Switched-off rules stay listed but never fire. */
		enabled: z.boolean().default(true),
		/** Append the visitor's query string to the target (unless the target has its own). */
		preserveQuery: z.boolean().default(true),
		note: z.string().max(200).optional(),
	})
	.superRefine((r, ctx) => {
		if (r.match === "regex") {
			if (!validRegex(r.from))
				ctx.addIssue({ code: "custom", path: ["from"], message: "Invalid or unsafe regular expression" });
		} else if (!r.from.startsWith("/") || r.from.startsWith("//")) {
			ctx.addIssue({ code: "custom", path: ["from"], message: "Invalid source" });
		} else if (r.match === "wildcard" && !r.from.endsWith("/*")) {
			ctx.addIssue({ code: "custom", path: ["from"], message: "A wildcard source must end in /*" });
		}
	});

const norm = (p: string) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);

export const redirectsSchema = z.array(rule).superRefine((rules, ctx) => {
	const map = new Map<string, string>();
	for (const r of rules) {
		if (r.match !== "exact") continue;
		const from = norm(r.from);
		if (map.has(from)) ctx.addIssue({ code: "custom", message: `Duplicate redirect source: ${r.from}` });
		map.set(from, norm(r.to));
	}
	for (const start of map.keys()) {
		const seen = new Set([start]);
		for (let at = map.get(start); at !== undefined; at = map.get(at)) {
			if (seen.has(at)) {
				ctx.addIssue({ code: "custom", message: `Redirect loop through ${start}` });
				break;
			}
			seen.add(at);
		}
	}
});

export type RedirectRule = z.output<typeof rule>;
/** What callers may pass: optional fields default on parse. */
export type RedirectInput = z.input<typeof rule>;

const fill = (to: string, groups: string[]) => to.replace(/\$(\d)/g, (_, n: string) => groups[Number(n) - 1] ?? "");

/**
 * Priority: exact paths, then wildcards (longest prefix first), then regexes in the order listed.
 * Rules from older files without the new fields behave as before (exact, enabled, query kept).
 */
export function resolveRedirect(
	rules: RedirectRule[],
	pathname: string,
	search = "",
): { to: string; status: 301 | 302 } | null {
	const p = norm(pathname);
	const live = rules.filter((r) => r.enabled !== false);
	const withQuery = (r: RedirectRule, to: string) =>
		search && r.preserveQuery !== false && !to.includes("?")
			? `${to}${search.startsWith("?") ? search : `?${search}`}`
			: to;

	const exact = live.find((r) => (r.match ?? "exact") === "exact" && norm(r.from) === p);
	if (exact) return { to: withQuery(exact, exact.to), status: exact.status };

	const wild = live
		.filter((r) => r.match === "wildcard" && p.startsWith(r.from.slice(0, -1)))
		.toSorted((a, b) => b.from.length - a.from.length)[0];
	if (wild) return { to: withQuery(wild, fill(wild.to, [p.slice(wild.from.length - 1)])), status: wild.status };

	for (const r of live) {
		if (r.match !== "regex") continue;
		const m = new RegExp(r.from).exec(p);
		if (m) return { to: withQuery(r, fill(r.to, m.slice(1))), status: r.status };
	}
	return null;
}

const CSV_HEAD = ["from", "to", "status", "match", "enabled", "note"];
const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

export function redirectsToCsv(rules: RedirectRule[]): string {
	const rows = rules.map((r) =>
		[r.from, r.to, String(r.status), r.match, String(r.enabled), r.note ?? ""].map(cell).join(","),
	);
	return `${[CSV_HEAD.join(","), ...rows].join("\n")}\n`;
}

/** Minimal RFC 4180 reader (quotes, doubled quotes, commas and newlines inside quotes). */
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i]!;
		if (quoted) {
			if (ch === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (ch === '"') quoted = false;
			else field += ch;
		} else if (ch === '"') quoted = true;
		else if (ch === ",") {
			row.push(field);
			field = "";
		} else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			if (row.some((c) => c !== "")) rows.push(row);
			row = [];
			field = "";
		} else field += ch;
	}
	row.push(field);
	if (row.some((c) => c !== "")) rows.push(row);
	return rows;
}

/** Rows become rules; the header row is optional. Throws with the line number of the first bad row. */
export function parseRedirectsCsv(text: string): RedirectRule[] {
	const rows = parseCsv(text);
	if (rows[0]?.[0]?.toLowerCase() === "from") rows.shift();
	return rows.map((cols, i) => {
		const [from = "", to = "", status = "", match = "", enabled = "", note = ""] = cols.map((c) => c.trim());
		const parsed = rule.safeParse({
			from,
			to,
			...(status ? { status: Number(status) } : {}),
			...(match ? { match } : {}),
			...(enabled ? { enabled: enabled !== "false" } : {}),
			...(note ? { note } : {}),
		});
		if (!parsed.success) throw new Error(`Row ${i + 1}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
		return parsed.data;
	});
}
