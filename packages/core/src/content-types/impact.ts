import type { ContentService } from "../content/service.ts";
import { dataSchema, type Collection } from "./index.ts";
import { generateTypes } from "./generate.ts";

export interface SchemaImpact {
	/** Existing entries that would no longer validate. */
	invalid: Array<{ slug: string; errors: string[] }>;
	/** Fields being dropped that entries still have values for. */
	removedFields: Array<{ field: string; entries: number }>;
	/** Generated `.d.ts` of the candidate. */
	types: string;
}

/** What saving `candidate` would do to the entries that exist today. */
export async function schemaImpact(service: ContentService, candidate: Collection): Promise<SchemaImpact> {
	const current = service.collections.find((c) => c.name === candidate.name);
	const entries = current ? await service.listEntries(candidate.name) : [];
	const schema = dataSchema(candidate);
	const removed = current ? Object.keys(current.fields).filter((f) => !(f in candidate.fields)) : [];
	return {
		invalid: entries.flatMap((e) => {
			const r = schema.safeParse(e.data);
			return r.success
				? []
				: [{ slug: e.slug, errors: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }];
		}),
		removedFields: removed
			.map((field) => ({ field, entries: entries.filter((e) => e.data[field] !== undefined).length }))
			.filter((r) => r.entries > 0),
		types: generateTypes([candidate]),
	};
}
