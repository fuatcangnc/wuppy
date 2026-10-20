import type { Byline, BylineField } from "../data/schemas.ts";

export interface BylineIssue {
	slug: string;
	field: string;
	message: string;
}

/** Fields of the byline schema in display order. */
export const orderedFields = (fields: readonly BylineField[]) => fields.toSorted((a, b) => a.order - b.order);

/** Checks every byline against the custom field schema (required values, URL shape). */
export function validateBylines(bylines: readonly Byline[], fields: readonly BylineField[]): BylineIssue[] {
	const issues: BylineIssue[] = [];
	for (const b of bylines) {
		for (const f of fields) {
			const value = (b.extra[f.name] ?? "").trim();
			if (!value) {
				if (f.required) issues.push({ slug: b.slug, field: f.name, message: `${f.label} is required` });
			} else if (f.type === "url" && !URL.canParse(value)) {
				issues.push({ slug: b.slug, field: f.name, message: `${f.label} must be a URL` });
			}
		}
	}
	return issues;
}

export interface Credit {
	byline: string;
	role?: string | undefined;
}

/** A byline field value (slug, list of slugs, or `{ byline, role }` items) as a list of credits. */
export function creditsOf(value: unknown): Credit[] {
	return [value].flat().flatMap((v): Credit[] => {
		if (typeof v === "string" && v) return [{ byline: v }];
		if (v && typeof v === "object" && typeof (v as Credit).byline === "string") return [v as Credit];
		return [];
	});
}
