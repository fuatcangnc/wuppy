import { z } from "zod";
import { collectionSchema } from "../content-types/index.ts";
import { defaultVisualData, visualDataSchema } from "@wuppycms/visual-editor";
import { webhooksSchema } from "../webhooks/index.ts";

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const href = z
	.string()
	.min(1)
	.refine(
		(v) => (v.startsWith("/") && !v.startsWith("//")) || /^https?:\/\//i.test(v),
		"Expected a path or http(s) URL",
	);

export const menuSchema = z.object({
	name: id,
	label: z.string().min(1),
	location: z.string().default("header"),
	/** Language variant of the menu `name`; a menu without a locale is the fallback. */
	locale: z.string().optional(),
	items: z
		.array(
			z.object({
				label: z.string().min(1),
				href,
				/** Optional source hint for the admin badge (page, post, category, custom…). */
				kind: z.string().max(40).optional(),
				children: z
					.array(z.object({ label: z.string().min(1), href, kind: z.string().max(40).optional() }))
					.default([]),
			}),
		)
		.default([]),
});
export type Menu = z.infer<typeof menuSchema>;

export const widgetSchema = z.object({
	id: z.string(),
	type: z.enum(["text", "html", "menu", "recent", "taxonomy", "custom"]),
	title: z.string().default(""),
	body: z.string().default(""),
	menu: z.string().optional(),
	taxonomy: z.string().optional(),
	/** Show only for these locales / collections (any when empty). */
	locales: z.array(z.string()).default([]),
	collections: z.array(z.string()).default([]),
	/** Show only on these pages (any when empty): `/about` exactly, or `/blog/*` for everything under it. */
	paths: z.array(z.string()).default([]),
});
export const widgetAreaSchema = z.object({
	name: id,
	label: z.string().min(1),
	description: z.string().default(""),
	widgets: z.array(widgetSchema).default([]),
});
export type WidgetArea = z.infer<typeof widgetAreaSchema>;

export const sectionSchema = z.object({
	slug: id,
	title: z.string().min(1),
	body: z.string().default(""),
	draft: z.boolean().default(false),
	/** A locale variant of the section with the same slug; empty means every language. */
	locale: z.string().optional(),
});
export type Section = z.infer<typeof sectionSchema>;

export const taxonomyTermSchema = z.object({
	slug: id,
	name: z.string().min(1),
	description: z.string().default(""),
	parent: z.string().optional(),
	/** Position among siblings; ties fall back to the name. */
	order: z.number().int().default(0),
	/** Per-locale name and description. */
	translations: z
		.record(z.string(), z.object({ name: z.string().min(1), description: z.string().default("") }))
		.default({}),
});
export const taxonomySchema = z
	.object({
		name: id,
		label: z.string().min(1),
		hierarchical: z.boolean().default(false),
		collections: z.array(z.string()).default([]),
		terms: z.array(taxonomyTermSchema).default([]),
	})
	.superRefine((t, ctx) => {
		const slugs = new Set<string>();
		for (const term of t.terms) {
			if (slugs.has(term.slug)) ctx.addIssue({ code: "custom", message: `Duplicate term: ${term.slug}` });
			slugs.add(term.slug);
		}
		for (const term of t.terms) {
			if (!term.parent) continue;
			if (!t.hierarchical) ctx.addIssue({ code: "custom", message: `${term.slug}: this taxonomy is not hierarchical` });
			else if (!slugs.has(term.parent))
				ctx.addIssue({ code: "custom", message: `${term.slug}: unknown parent ${term.parent}` });
		}
		// A term must not be its own ancestor.
		const parentOf = new Map(t.terms.map((x) => [x.slug, x.parent]));
		for (const term of t.terms) {
			const seen = new Set([term.slug]);
			for (let at = term.parent; at; at = parentOf.get(at)) {
				if (seen.has(at)) {
					ctx.addIssue({ code: "custom", message: `Parent loop through ${term.slug}` });
					break;
				}
				seen.add(at);
			}
		}
	});
export type Taxonomy = z.infer<typeof taxonomySchema>;

export const bylineSchema = z.object({
	slug: id,
	name: z.string().min(1),
	bio: z.string().default(""),
	avatar: z.string().default(""),
	email: z.string().email().optional().or(z.literal("")),
	website: z.string().url().optional().or(z.literal("")),
	/** Roles this person can be credited with (author, editor, photographer…). */
	credits: z.array(z.string()).default([]),
	/** Values of the custom fields from `byline-schema`. */
	extra: z.record(z.string(), z.string()).default({}),
	/** Per-locale name and bio. */
	translations: z.record(z.string(), z.object({ name: z.string().optional(), bio: z.string().optional() })).default({}),
});
export type Byline = z.infer<typeof bylineSchema>;

export const bylineFieldSchema = z.object({
	name: id,
	label: z.string().min(1),
	type: z.enum(["string", "text", "image", "url"]).default("string"),
	required: z.boolean().default(false),
	/** Position in the profile form; ties keep the stored order. */
	order: z.number().int().default(0),
});
export type BylineField = z.infer<typeof bylineFieldSchema>;

export const settingsSchema = z.object({
	siteName: z.string().default("Wuppy"),
	siteUrl: z.string().default(""),
	description: z.string().default(""),
	logo: z.string().default(""),
	locale: z.string().default("en"),
	timezone: z.string().default("UTC"),
	seo: z
		.object({
			title: z.string().default(""),
			description: z.string().default(""),
			image: z.string().default(""),
			noindex: z.boolean().default(false),
			/** How page titles and the site name combine; `{title}` and `{site}` are replaced. */
			titleTemplate: z.string().default("{title} | {site}"),
			sitemap: z
				.object({
					exclude: z.array(z.string()).default([]),
					priority: z.record(z.string(), z.number().min(0).max(1)).default({}),
				})
				.default({ exclude: [], priority: {} }),
		})
		.default({
			title: "",
			description: "",
			image: "",
			noindex: false,
			titleTemplate: "{title} | {site}",
			sitemap: { exclude: [], priority: {} },
		}),
	social: z.record(z.string(), z.string()).default({}),
	email: z
		.object({
			from: z.string().default(""),
			provider: z.enum(["console", "smtp", "resend"]).default("console"),
			host: z.string().default(""),
			port: z.number().default(587),
			user: z.string().default(""),
			/** Overrides for the built-in messages; see `EMAIL_VARIABLES` for the `{{placeholders}}` each accepts. */
			templates: z
				.partialRecord(
					z.enum(["invite", "reset", "magic"]),
					z.object({ subject: z.string().min(1).max(200), text: z.string().min(1).max(5000) }).partial(),
				)
				.default({}),
		})
		.default({ from: "", provider: "console", host: "", port: 587, user: "", templates: {} }),
	media: z
		.object({
			maxBytes: z.number().default(5 * 1024 * 1024),
			allowed: z.array(z.string()).default(["image/png", "image/jpeg", "image/gif", "image/webp"]),
		})
		.default({ maxBytes: 5 * 1024 * 1024, allowed: ["image/png", "image/jpeg", "image/gif", "image/webp"] }),
	comments: z
		.object({
			enabled: z.boolean().default(true),
			moderated: z.boolean().default(true),
			/** Gets an email for each new comment (empty = nobody). */
			notifyEmail: z.union([z.email(), z.literal("")]).default(""),
		})
		.default({ enabled: true, moderated: true, notifyEmail: "" }),
	/** Only these email domains may be invited (any when empty). Applies to new invitations, not to existing users. */
	security: z
		.object({ allowedDomains: z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i)).default([]) })
		.default({ allowedDomains: [] }),
	/** Takes effect after a restart. */
	backup: z
		.object({
			enabled: z.boolean().default(false),
			intervalHours: z
				.number()
				.int()
				.min(1)
				.max(24 * 30)
				.default(24),
			keep: z.number().int().min(1).max(365).default(14),
		})
		.default({ enabled: false, intervalHours: 24, keep: 14 }),
});
export type WuppySettings = z.infer<typeof settingsSchema>;

export const themeSchema = z.object({
	id: id,
	name: z.string().min(1),
	version: z.string().default("0.0.0"),
	active: z.boolean().default(false),
});
export type Theme = z.infer<typeof themeSchema>;

export const dataSchemas = {
	settings: settingsSchema,
	menus: z.array(menuSchema),
	widgets: z.array(widgetAreaSchema),
	sections: z.array(sectionSchema),
	taxonomies: z.array(taxonomySchema),
	bylines: z.array(bylineSchema),
	"byline-schema": z.array(bylineFieldSchema),
	themes: z.array(themeSchema),
	"content-types": z.array(collectionSchema),
	webhooks: webhooksSchema,
	visual: visualDataSchema,
} as const;

export type DataName = keyof typeof dataSchemas;
export const dataNames = Object.keys(dataSchemas) as DataName[];

export const dataDefaults: Record<DataName, unknown> = {
	settings: settingsSchema.parse({}),
	menus: [],
	widgets: [],
	sections: [],
	taxonomies: [
		{ name: "categories", label: "Categories", hierarchical: true, collections: [], terms: [] },
		{ name: "tags", label: "Tags", hierarchical: false, collections: [], terms: [] },
	],
	bylines: [],
	"byline-schema": [],
	themes: [],
	"content-types": [],
	webhooks: [],
	visual: defaultVisualData(),
};
