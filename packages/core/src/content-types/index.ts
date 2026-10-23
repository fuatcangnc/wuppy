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
	"section",
	"select",
	"json",
	"richText",
	"repeater",
	"blocks",
] as const;

export type FieldKind = (typeof FIELD_TYPES)[number];

/** Shows a field only while another field has the given value (e.g. `publishAt` while `draft` is true). */
export interface ShowIf {
	field: string;
	equals: unknown;
}

export interface FieldOptions {
	type: FieldKind;
	/** Target collection for `reference` fields. */
	collection?: string;
	/** Taxonomy key for `taxonomy` fields. */
	taxonomy?: string;
	/** Allow an array of values (taxonomy, reference, select). */
	multiple: boolean;
	required: boolean;
	help?: string;
	default?: unknown;
	/** Allowed values of a `select`. */
	options?: string[];
	/** Bounds: number value, string length, or item count of lists/repeaters. */
	min?: number;
	max?: number;
	/** Row shape of a `repeater`. */
	fields?: Record<string, FieldType>;
	/** Block types of a `blocks` field: each type has its own fields. */
	blocks?: Record<string, Record<string, FieldType>>;
	showIf?: ShowIf;
}

export type FieldType = FieldKind | FieldOptions;

const fieldOptionsSchema: z.ZodType<FieldOptions, unknown> = z.lazy(() =>
	z.object({
		type: z.enum(FIELD_TYPES),
		collection: z.string().optional(),
		taxonomy: z.string().optional(),
		multiple: z.boolean().default(false),
		required: z.boolean().default(false),
		help: z.string().optional(),
		default: z.unknown().optional(),
		options: z.array(z.string()).optional(),
		min: z.number().optional(),
		max: z.number().optional(),
		fields: z.record(z.string(), fieldTypeSchema).optional(),
		blocks: z.record(z.string(), z.record(z.string(), fieldTypeSchema)).optional(),
		showIf: z.object({ field: z.string(), equals: z.unknown() }).optional(),
	}),
);

export const fieldTypeSchema: z.ZodType<FieldType, unknown> = z.union([z.enum(FIELD_TYPES), fieldOptionsSchema]);

export const collectionSchema = z.object({
	name: z.string().regex(/^[a-z][a-z0-9-]*$/),
	dir: z.string().min(1),
	/** New entries are saved as `.mdx` (components allowed) or `.md`; an existing `.md` is promoted when it gains a component. */
	format: z.enum(["md", "mdx"]).default("md"),
	/** The admin section it fills: Posts or Pages. Collections named `posts`/`pages` need not set it (a theme's `blog`). */
	kind: z.enum(["posts", "pages"]).optional(),
	/** In a theme's config: its field name -> the site's (`{ pubDate: "date" }`), so the theme reads the site's entries. */
	map: z.record(z.string(), z.string()).optional(),
	/** Public URL of an entry; `{slug}` is replaced. Defaults to `/<name>/{slug}`. */
	route: z.string().startsWith("/").includes("{slug}").optional(),
	fields: z.record(z.string(), fieldTypeSchema).default({}),
});

export type Collection = z.infer<typeof collectionSchema>;

const BASE: Record<FieldKind, z.ZodType> = {
	string: z.string().max(500),
	text: z.string(),
	richText: z.string(),
	image: z.string(),
	boolean: z.boolean(),
	list: z.array(z.string().max(100)).max(50),
	number: z.number(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/, "Expected an ISO date"),
	// One slug, or several; each may carry a credit role ("photographer").
	byline: z.union([
		z.string().max(200),
		z
			.array(
				z.union([z.string().max(200), z.object({ byline: z.string().max(200), role: z.string().max(100).optional() })]),
			)
			.max(50),
	]),
	taxonomy: z.union([z.string().max(200), z.array(z.string().max(200)).max(50)]),
	reference: z.union([z.string().max(200), z.array(z.string().max(200)).max(50)]),
	/** Ordered list of section slugs. */
	section: z.array(z.string().max(200)).max(50),
	select: z.string(),
	json: z.json(),
	repeater: z.array(z.unknown()),
	blocks: z.array(z.unknown()),
};

const normalize = (f: FieldType): FieldOptions =>
	typeof f === "string" ? { type: f, multiple: false, required: false } : f;

/** Zod schema of one field, including its bounds, options and nested fields. */
export function fieldSchema(field: FieldType): z.ZodType {
	const f = normalize(field);
	const { min, max } = f;
	let schema: z.ZodType = BASE[f.type];
	if (f.type === "select" && f.options) {
		const one = z.enum(f.options as [string, ...string[]]);
		schema = f.multiple ? z.array(one) : one;
	} else if (f.type === "number") {
		let n = z.number();
		if (min !== undefined) n = n.min(min);
		if (max !== undefined) n = n.max(max);
		schema = n;
	} else if (f.type === "repeater") {
		let a = z.array(objectSchema(f.fields ?? {}));
		if (min !== undefined) a = a.min(min);
		if (max !== undefined) a = a.max(max);
		schema = a;
	} else if (f.type === "blocks") {
		const variants = Object.entries(f.blocks ?? {}).map(([name, fields]) =>
			objectSchema(fields).extend({ type: z.literal(name) }),
		);
		const item = variants.length
			? z.discriminatedUnion("type", variants as [(typeof variants)[0], ...typeof variants])
			: z.unknown();
		let a = z.array(item);
		if (min !== undefined) a = a.min(min);
		if (max !== undefined) a = a.max(max);
		schema = a;
	} else if ((f.type === "string" || f.type === "text") && (min !== undefined || max !== undefined)) {
		let t = z.string();
		if (min !== undefined) t = t.min(min);
		if (max !== undefined) t = t.max(max);
		schema = t;
	}
	// A conditional field is only required while visible; that check needs sibling data, see `dataSchema`.
	return f.required && !f.showIf ? schema : schema.optional();
}

function objectSchema(fields: Record<string, FieldType>) {
	return z.looseObject(Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, fieldSchema(f)])));
}

/** Declared fields are type-checked; undeclared frontmatter passes through untouched. A field hidden by `showIf` is not required. */
export const dataSchema = (c: Collection) =>
	objectSchema(c.fields).superRefine((data, ctx) => {
		for (const [name, field] of Object.entries(c.fields)) {
			const f = normalize(field);
			if (!f.required || !f.showIf || data[name] !== undefined) continue;
			if (data[f.showIf.field] !== f.showIf.equals) continue;
			ctx.addIssue({ code: "custom", path: [name], message: `${name} is required` });
		}
	});

export const fieldKind = (field: FieldType): FieldKind => normalize(field).type;
