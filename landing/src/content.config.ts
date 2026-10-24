import { glob } from "astro/loaders";
import { defineCollection, z } from "astro:content";

const item = { title: z.string(), text: z.string() };

const landing = defineCollection({
	loader: glob({ pattern: "*.md", base: "./content/landing" }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		eyebrow: z.string(),
		headline: z.string(),
		lead: z.string(),
		featuresTitle: z.string(),
		features: z.array(z.object(item)),
		howTitle: z.string(),
		steps: z.array(z.object({ ...item, code: z.string() })),
		ctaTitle: z.string(),
		ctaText: z.string(),
		footer: z.string(),
	}),
});

export const collections = { landing };
