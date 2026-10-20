import { access } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { collectionSchema } from "../content-types/index.ts";
import { webhooksSchema } from "../webhooks/index.ts";
import { redirectsSchema } from "../redirects/index.ts";

const safeDir = collectionSchema.shape.dir.refine(
	(d) => !d.startsWith("/") && !d.split(/[\\/]/).includes(".."),
	"dir must be relative and stay inside the project",
);

export const configSchema = z
	.object({
		collections: z.array(collectionSchema.extend({ dir: safeDir })).default([]),
		site: z.object({ url: z.url(), name: z.string().min(1) }).optional(),
		/** Locale codes; the first slug segment of a translated entry is its locale. */
		locales: z.array(z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/)).default([]),
		/** Astro components authors may use in content (PascalCase names). */
		components: z.array(z.string().regex(/^[A-Z][A-Za-z0-9]*$/)).default([]),
		/** Sandboxed plugins. `approve` is the capability hash printed when a plugin is first added. */
		plugins: z.array(z.object({ dir: z.string().min(1), approve: z.string().length(64) })).default([]),
		/** Notified (signed POST) when content or media changes, e.g. to trigger a rebuild. */
		webhooks: webhooksSchema,
		redirects: redirectsSchema.default([]),
		/** Commit every content change to Git. */
		git: z.boolean().default(true),
		admin: z.object({ path: z.string().startsWith("/").default("/admin") }).default({ path: "/admin" }),
	})
	.superRefine((cfg, ctx) => {
		const seen = new Set<string>();
		for (const c of cfg.collections) {
			if (seen.has(c.name))
				ctx.addIssue({ code: "custom", message: `Duplicate collection: ${c.name}`, path: ["collections"] });
			seen.add(c.name);
		}
	});

export type WuppyConfig = z.infer<typeof configSchema>;
export type WuppyUserConfig = z.input<typeof configSchema>;

export function defineConfig(input: WuppyUserConfig): WuppyConfig {
	const r = configSchema.safeParse(input);
	if (!r.success) {
		const lines = r.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
		throw new Error(`Invalid wuppy.config:\n${lines.join("\n")}`);
	}
	return r.data;
}

const FILES = ["wuppy.config.ts", "wuppy.config.mjs", "wuppy.config.js"];

export async function loadConfig(root: string): Promise<WuppyConfig> {
	for (const f of FILES) {
		const path = join(root, f);
		try {
			await access(path);
		} catch {
			continue;
		}
		const mod = (await import(/* @vite-ignore */ pathToFileURL(path).href)) as { default?: WuppyUserConfig };
		return defineConfig(mod.default ?? {});
	}
	throw new Error(`No wuppy.config found in ${root} (looked for ${FILES.join(", ")})`);
}
