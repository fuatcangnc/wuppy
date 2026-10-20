import { z } from "zod";
import { collectionSchema } from "../content-types/index.ts";
import { webhooksSchema } from "../webhooks/index.ts";

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const href = z
	.string()
	.min(1)
	.refine((v) => (v.startsWith("/") && !v.startsWith("//")) || /^https?:\/\//i.test(v), "Expected a path or http(s) URL");

export const menuSchema = z.object({
	name: id,
	label: z.string().min(1),
	location: z.string().default("header"),
	items: z
		.array(
			z.object({
				label: z.string().min(1),
				href,
				children: z
					.array(z.object({ label: z.string().min(1), href }))
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
});
export const widgetAreaSchema = z.object({
	name: id,
	label: z.string().min(1),
	widgets: z.array(widgetSchema).default([]),
});
export type WidgetArea = z.infer<typeof widgetAreaSchema>;

export const sectionSchema = z.object({
	slug: id,
	title: z.string().min(1),
	body: z.string().default(""),
	draft: z.boolean().default(false),
});
export type Section = z.infer<typeof sectionSchema>;

export const taxonomyTermSchema = z.object({
	slug: id,
	name: z.string().min(1),
	description: z.string().default(""),
	parent: z.string().optional(),
});
export const taxonomySchema = z.object({
	name: id,
	label: z.string().min(1),
	hierarchical: z.boolean().default(false),
	collections: z.array(z.string()).default([]),
	terms: z.array(taxonomyTermSchema).default([]),
});
export type Taxonomy = z.infer<typeof taxonomySchema>;

export const bylineSchema = z.object({
	slug: id,
	name: z.string().min(1),
	bio: z.string().default(""),
	avatar: z.string().default(""),
	email: z.string().email().optional().or(z.literal("")),
	website: z.string().url().optional().or(z.literal("")),
	credits: z.array(z.string()).default([]),
});
export type Byline = z.infer<typeof bylineSchema>;

export const bylineFieldSchema = z.object({
	name: id,
	label: z.string().min(1),
	type: z.enum(["string", "text", "image", "url"]).default("string"),
	required: z.boolean().default(false),
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
		})
		.default({ title: "", description: "", image: "", noindex: false }),
	social: z.record(z.string(), z.string()).default({}),
	email: z
		.object({
			from: z.string().default(""),
			provider: z.enum(["console", "smtp", "resend"]).default("console"),
			host: z.string().default(""),
			port: z.number().default(587),
			user: z.string().default(""),
		})
		.default({ from: "", provider: "console", host: "", port: 587, user: "" }),
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
		})
		.default({ enabled: true, moderated: true }),
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
};
