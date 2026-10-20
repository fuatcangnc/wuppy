import { z } from "zod";

/** Same-site path, or an absolute http(s) URL. Rules out `//host` (open redirect) and `javascript:`. */
const target = z
	.string()
	.refine(
		(t) => (t.startsWith("/") && !t.startsWith("//")) || /^https?:\/\//i.test(t),
		"Target must be a /path or http(s) URL",
	);

const rule = z.object({
	from: z
		.string()
		.startsWith("/")
		.refine((f) => !f.startsWith("//"), "Invalid source"),
	to: target,
	status: z.union([z.literal(301), z.literal(302)]).default(301),
});

const norm = (p: string) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);

export const redirectsSchema = z.array(rule).superRefine((rules, ctx) => {
	const map = new Map<string, string>();
	for (const r of rules) {
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

export function resolveRedirect(rules: RedirectRule[], pathname: string): { to: string; status: 301 | 302 } | null {
	const p = norm(pathname);
	const hit = rules.find((r) => norm(r.from) === p);
	return hit ? { to: hit.to, status: hit.status } : null;
}
