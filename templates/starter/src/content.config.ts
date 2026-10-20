import { glob } from "astro/loaders";
import { defineCollection, z } from "astro:content";

const posts = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./content/posts" }),
	schema: z.object({
		title: z.string(),
		date: z.coerce.date().optional(),
		draft: z.boolean().default(false),
		publishAt: z.coerce.date().optional(),
		tags: z.array(z.string()).default([]),
		author: z.string().optional(),
		categories: z.array(z.string()).default([]),
		cover: z.string().optional(),
		seoTitle: z.string().optional(),
		seoDescription: z.string().optional(),
		canonical: z.string().optional(),
		noindex: z.boolean().default(false),
	}),
});

const pages = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./content/pages" }),
	schema: z.object({
		title: z.string(),
		draft: z.boolean().default(false),
		seoTitle: z.string().optional(),
		seoDescription: z.string().optional(),
	}),
});

export const collections = { posts, pages };
