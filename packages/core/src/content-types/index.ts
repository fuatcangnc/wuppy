import { z } from "zod";

export const FIELD_TYPES = [
	"string",
	"text",
	"date",
	"image",
	"boolean",
	"number",
	"list",
	"byline",
	"taxonomy",
	"reference",
] as const;

export const fieldTypeSchema = z.union([
	z.enum(FIELD_TYPES),
	z.object({
		type: z.enum(FIELD_TYPES),
		/** Target collection for `reference` fields. */
		collection: z.string().optional(),
		/** Taxonomy key for `taxonomy` fields. */
		taxonomy: z.string().optional(),
		/** Allow an array of values (taxonomy, reference). */
		multiple: z.boolean().default(false),
	}),
]);

export const collectionSchema = z.object({
	name: z.string().regex(/^[a-z][a-z0-9-]*$/),
	dir: z.string().min(1),
	format: z.enum(["md", "mdx"]).default("md"),
	/** Public URL of an entry; `{slug}` is replaced. Defaults to `/<name>/{slug}`. */
	route: z.string().startsWith("/").includes("{slug}").optional(),
	fields: z.record(z.string(), fieldTypeSchema).default({}),
});

export type FieldType = z.infer<typeof fieldTypeSchema>;
export type FieldKind = (typeof FIELD_TYPES)[number];
export type Collection = z.infer<typeof collectionSchema>;

const FIELD: Record<FieldKind, z.ZodType> = {
	string: z.string().max(500),
	text: z.string(),
	image: z.string(),
	boolean: z.boolean(),
	list: z.array(z.string().max(100)).max(50),
	number: z.number(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/, "Expected an ISO date"),
	byline: z.string().max(200),
	taxonomy: z.union([z.string().max(200), z.array(z.string().max(200)).max(50)]),
	reference: z.union([z.string().max(200), z.array(z.string().max(200)).max(50)]),
};

/** Declared fields are type-checked and optional; undeclared frontmatter passes through untouched. */
export const dataSchema = (c: Collection) =>
	z.looseObject(
		Object.fromEntries(
			Object.entries(c.fields).map(([k, f]) => [k, FIELD[typeof f === "string" ? f : f.type].optional()]),
		),
	);

export const fieldKind = (field: FieldType): FieldKind => (typeof field === "string" ? field : field.type);
