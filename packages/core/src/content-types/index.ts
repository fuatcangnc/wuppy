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
	/** No two entries of the collection may hold the same value (for a list: share one). */
	unique?: boolean;
	/** Set on the reference field a relation adds (see `relationSchema`); the relation decides its target and limits. */
	relation?: string;
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
		unique: z.boolean().optional(),
		relation: z.string().optional(),
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
	} else if (f.type === "reference" && f.relation) {
		// A relation's limit: one slug, or a list of them.
		schema = f.multiple ? z.array(z.string().max(200)).max(f.max ?? 50) : z.string().max(200);
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

/** The admin section a collection fills: `kind`, else its name (`posts`, `pages`). */
export const kindOf = (c: Collection): "posts" | "pages" | undefined =>
	c.kind ?? (c.name === "posts" || c.name === "pages" ? c.name : undefined);

/**
 * How entries of two collections link (like EmDash's relations). Entries of `from` hold the slugs of `to` entries in a
 * reference field named `name`; the `to` side reads them back (see `linkedFrom`). `toMany`: a `from` entry may link to
 * several; `fromMany`: a `to` entry may be linked from several `from` entries.
 */
export const relationSchema = z.object({
	name: z
		.string()
		.max(60)
		.regex(/^[a-z][a-z0-9_]*$/, "Lowercase letters, numbers and underscores"),
	from: z.string().min(1),
	to: z.string().min(1),
	fromLabel: z.string().trim().min(1).max(60),
	toLabel: z.string().trim().min(1).max(60),
	toMany: z.boolean().default(true),
	fromMany: z.boolean().default(true),
});
export type Relation = z.infer<typeof relationSchema>;

/** Pages and Posts every site has, as in EmDash or WordPress: added when the config has no collection of that kind. */
const DEFAULTS: Collection[] = [
	{
		name: "posts",
		dir: "content/posts",
		format: "mdx",
		route: "/posts/{slug}",
		fields: {
			title: "string",
			date: "date",
			draft: "boolean",
			publishAt: "date",
			cover: "image",
			seoTitle: "string",
			seoDescription: "text",
		},
	},
	{
		name: "pages",
		dir: "content/pages",
		format: "mdx",
		route: "/{slug}",
		fields: { title: "string", draft: "boolean", seoTitle: "string", seoDescription: "text" },
	},
];

/**
 * The site's collections: wuppy.config's, the content types made in the admin (same name replaces), Pages/Posts when
 * missing, and a reference field on the `from` side of each relation.
 */
export function siteCollections(config: Collection[], types: Collection[], relations: Relation[] = []): Collection[] {
	const out = config.map((c) => ({ ...c, fields: { ...c.fields } }));
	for (const t of types) {
		const i = out.findIndex((c) => c.name === t.name);
		const copy = { ...t, fields: { ...t.fields } };
		if (i === -1) out.push(copy);
		else out[i] = copy;
	}
	for (const d of DEFAULTS)
		if (!out.some((c) => c.name === d.name || kindOf(c) === d.name)) out.push(structuredClone(d));
	for (const r of relations) {
		const from = out.find((c) => c.name === r.from);
		if (!from || !out.some((c) => c.name === r.to)) continue;
		from.fields[r.name] = {
			type: "reference",
			collection: r.to,
			multiple: r.toMany,
			required: false,
			relation: r.name,
			...(r.fromMany ? {} : { unique: true }),
		};
	}
	return out;
}

const folder = (dir: string) => `${dir.replace(/\\/g, "/").replace(/^\.?\/+|\/+$/g, "")}/`;

/** Two collections whose folders are the same or nested (one would list the other's entries), as a message. */
export function dirClash(collections: Pick<Collection, "name" | "dir">[]): string | undefined {
	for (const [i, a] of collections.entries())
		for (const b of collections.slice(i + 1))
			if (folder(a.dir).startsWith(folder(b.dir)) || folder(b.dir).startsWith(folder(a.dir)))
				return `"${a.name}" (${a.dir}) and "${b.name}" (${b.dir}) share a folder; give each its own, like content/${a.name}`;
	return undefined;
}
