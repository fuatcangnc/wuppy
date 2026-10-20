import { z } from "zod";
import type { ContentService } from "../content/service.ts";

const bundleSchema = z.object({
	version: z.literal(1),
	collections: z.record(
		z.string(),
		z.record(z.string(), z.object({ data: z.record(z.string(), z.unknown()), body: z.string() })),
	),
});

export type Bundle = z.infer<typeof bundleSchema>;

/** Plain JSON snapshot of all content. Media files stay on disk/Git; they are not inlined. */
export async function exportContent(service: ContentService): Promise<Bundle> {
	const collections: Bundle["collections"] = {};
	for (const c of service.collections) {
		const entries: Bundle["collections"][string] = {};
		for (const slug of await service.list(c.name)) {
			const e = await service.get(c.name, slug);
			if (e) entries[slug] = { data: e.data, body: e.body };
		}
		collections[c.name] = entries;
	}
	return { version: 1, collections };
}

export interface ImportResult {
	imported: number;
	errors: { entry: string; message: string }[];
}

/** Every entry goes through `service.put`, so schema, slug and content-safety rules apply exactly as in the editor. */
export async function importContent(service: ContentService, input: unknown): Promise<ImportResult> {
	const parsed = bundleSchema.safeParse(input);
	if (!parsed.success) throw new Error("Invalid bundle: expected { version: 1, collections: { … } }");
	const result: ImportResult = { imported: 0, errors: [] };
	for (const [collection, entries] of Object.entries(parsed.data.collections)) {
		for (const [slug, doc] of Object.entries(entries)) {
			try {
				await service.put(collection, slug, doc, `import: ${collection}/${slug}`);
				result.imported++;
			} catch (e) {
				result.errors.push({ entry: `${collection}/${slug}`, message: (e as Error).message });
			}
		}
	}
	return result;
}
