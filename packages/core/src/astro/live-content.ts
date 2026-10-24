import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Build-time half of live content (see live-runtime.ts). A Vite plugin swaps `astro:content` for a module that reads
 * Wuppy collections from disk on each request, and pages that read collections are rendered on request instead of
 * prerendered, so edits made in the admin show at once on the public site.
 */

const SHIM = "\0wuppy:live-content";
const CONTENT_CONFIGS = [
	"src/content.config.ts",
	"src/content.config.mts",
	"src/content.config.js",
	"src/content.config.mjs",
	"src/content/config.ts",
	"src/content/config.js",
	"src/content/config.mjs",
];

const posix = (p: string) => p.split(sep).join("/");
const isConfig = (importer: string) =>
	/[\\/](content\.config|content[\\/]config|live\.config)\.[mc]?[jt]s$/.test(importer);

/** Whether a page route should render on request: it reads content collections and did not opt into prerendering. */
export function isLiveRoute(root: string, component: string): boolean {
	if (!component.startsWith("src/pages/") || !/\.(astro|ts|js|mjs)$/.test(component)) return false;
	let source: string;
	try {
		source = readFileSync(join(root, component), "utf8");
	} catch {
		return false;
	}
	if (!source.includes("astro:content") || /export\s+const\s+prerender\s*=\s*true/.test(source)) return false;
	// shortcut: endpoints with getStaticPaths stay prerendered; only .astro pages get their static paths at request time.
	return component.endsWith(".astro") || !source.includes("getStaticPaths");
}

/** `src/pages/posts/[slug].astro` -> `/posts/[slug]`. */
export const routePattern = (component: string) =>
	`/${component
		.replace(/^src\/pages\//, "")
		.replace(/\.[^.]+$/, "")
		.replace(/(^|\/)index$/, "")}`;

/** Wraps the compiled page's default export so it gets its props from getStaticPaths() at request time. */
export function wrapPage(code: string, runtime: string, pattern: string): string | null {
	if (!/\bgetStaticPaths\b/.test(code)) return null;
	let name: string | undefined;
	const out = code
		.replace(/export\s+default\s+(\$\$\w+)\s*;?/, (_, n: string) => ((name = n), ""))
		.replace(/(\$\$\w+)\s+as\s+default\b/, (_, n: string) => ((name = n), `${n} as __wuppyPage`));
	if (!name) return null;
	return `import { livePage as __wuppyLivePage } from ${JSON.stringify(runtime)};\n${out}\nexport default __wuppyLivePage(${name}, getStaticPaths, ${JSON.stringify(pattern)});\n`;
}

export interface LiveContentOptions {
	root: string;
	runtime: string;
	liveRoutes: Set<string>;
	/** JSON-safe parts of `config.markdown` and `config.image`, read once the Astro config is final. */
	markdown: () => Record<string, unknown>;
}

interface PluginContext {
	environment?: { name?: string; config?: { consumer?: string } };
	resolve(id: string, importer?: string, options?: { skipSelf?: boolean }): Promise<{ id: string } | null>;
}

export function liveContentPlugin(o: LiveContentOptions) {
	const contentConfig = CONTENT_CONFIGS.map((f) => join(o.root, f)).find((f) => existsSync(f));

	return {
		name: "wuppy:live-content",
		enforce: "pre" as const,
		resolveId: {
			// Runs before Astro's own resolver for the virtual module.
			order: "pre" as const,
			handler(this: PluginContext, id: string, importer?: string) {
				if (id !== "astro:content" || !importer || importer === SHIM || isConfig(importer)) return null;
				if (this.environment?.config?.consumer === "client") return null;
				return SHIM;
			},
		},
		async load(this: PluginContext, id: string) {
			if (id !== SHIM) return null;
			// Astro's helpers are its own dependencies: resolve them from Astro's package, not the site.
			const astro = realpathSync(join(o.root, "node_modules/astro/package.json"));
			const from = async (spec: string, importer = astro) => {
				const r = await this.resolve(spec, importer, { skipSelf: true });
				if (!r) throw new Error(`[wuppy] live content: cannot resolve ${spec}`);
				return JSON.stringify(r.id);
			};
			const siteConfig = contentConfig
				? `import * as site from ${JSON.stringify(contentConfig)};`
				: "const site = { collections: {} };";
			return {
				code: `import * as real from "astro:content";
${siteConfig}
import { z } from ${await from("astro/zod", join(o.root, "package.json"))};
import { parseFrontmatter } from ${await from("@astrojs/internal-helpers/frontmatter")};
import xxhash from ${await from("xxhash-wasm")};
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createLive, markdownRenderer, mdxContent } from ${JSON.stringify(o.runtime)};
export * from "astro:content";

const settings = ${JSON.stringify(o.markdown())};
const hasher = xxhash();
const schemas = new Map();
const live = createLive({
	root: process.cwd(),
	built: (name) => real.getCollection(name),
	schema(name) {
		if (!schemas.has(name)) {
			let schema = site.collections?.[name]?.schema;
			// shortcut: image() fields stay plain strings for edited entries; unchanged ones keep Astro's optimised image.
			if (typeof schema === "function") schema = schema({ image: () => z.string() });
			schemas.set(name, schema);
		}
		return schemas.get(name);
	},
	parseFrontmatter: (source) => parseFrontmatter(source),
	digest: async (source) => (await hasher).h64ToString(source),
	async renderMarkdown(body, data, filePath) {
		const renderer = await markdownRenderer(process.cwd(), settings);
		const result = await renderer.render(body, { frontmatter: data, fileURL: pathToFileURL(join(process.cwd(), filePath)) });
		return { html: result.code, metadata: { ...result.metadata, imagePaths: [] } };
	},
});

export async function getCollection(name, filter) {
	return (await live.isLive(name)) ? live.getCollection(name, filter) : real.getCollection(name, filter);
}
export async function getEntry(collectionOrRef, id) {
	const name = typeof collectionOrRef === "string" ? collectionOrRef : collectionOrRef?.collection;
	if (!(await live.isLive(name))) return real.getEntry(collectionOrRef, id);
	return live.getEntry(name, typeof collectionOrRef === "string" ? id : (collectionOrRef.id ?? collectionOrRef.slug));
}
// An MDX entry changed since the build has no compiled module: compile it now, with the site's Markdown settings.
export async function render(entry, ...rest) {
	if (!live.rendersAtRuntime(entry)) return real.render(entry, ...rest);
	try {
		const { Content, headings } = await mdxContent(entry.body ?? "", { markdown: settings });
		return { Content, headings, remarkPluginFrontmatter: {} };
	} catch (e) {
		// An entry this theme cannot render (a component it lacks, an import) must not take every page listing it down.
		if (!String(e?.message).startsWith("[wuppy] MDX not allowed")) throw e;
		console.warn(\`\${e.message} in \${entry.filePath}; its body is left out\`);
		const { Content } = await mdxContent("", { markdown: settings });
		return { Content, headings: [], remarkPluginFrontmatter: {} };
	}
}
export async function getEntries(refs) {
	return Promise.all(refs.map((ref) => getEntry(ref)));
}
`,
				// Same metadata Astro gives its own module: rendered content may bring styles into the page head.
				meta: {
					astro: {
						hydratedComponents: [],
						clientOnlyComponents: [],
						serverComponents: [],
						scripts: [],
						propagation: "in-tree",
						containsHead: false,
						pageOptions: {},
					},
				},
			};
		},
		transform: {
			order: "post" as const,
			handler(code: string, id: string) {
				if (!id.endsWith(".astro")) return null;
				const component = posix(relative(o.root, id));
				if (!o.liveRoutes.has(component)) return null;
				const out = wrapPage(code, o.runtime, routePattern(component));
				return out === null ? null : { code: out, map: null };
			},
		},
	};
}
