import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Fragment, jsx } from "astro/jsx-runtime";
import { Renderer as AstroRenderer } from "astro/runtime/server/index.js";
import { loadConfig } from "../config/index.ts";
import { themeComponentNames } from "../themes/components.ts";
import { findDisallowed, loadSatteri, stripComponentImports } from "./index.ts";

export interface MarkdownHeading {
	depth: number;
	slug: string;
	text: string;
}

/** The JSON-safe parts of Astro's `markdown` config (see the live content shim). */
export interface MarkdownSettings {
	features?: Record<string, unknown>;
	shared?: Record<string, unknown>;
}

/** The JSON-safe parts of Astro's `markdown` config used by MDX. */
export interface MdxMarkdownSettings {
	features?: Record<string, unknown>;
	shared?: { syntaxHighlight?: unknown; shikiConfig?: unknown; gfm?: boolean; smartypants?: boolean };
}

interface MarkdownRenderer {
	render(
		source: string,
		options: { frontmatter: Record<string, unknown>; fileURL?: URL },
	): Promise<{ code: string; metadata: { headings?: MarkdownHeading[] } & Record<string, unknown> }>;
}

// Astro's defaults when the site's config is not at hand (a section rendered from a theme page).
const DEFAULTS: MarkdownSettings = { shared: { syntaxHighlight: { type: "shiki", excludeLangs: ["math"] } } };
const MDX_DEFAULTS: MdxMarkdownSettings = { shared: { syntaxHighlight: { type: "shiki", excludeLangs: ["math"] } } };
const renderers = new Map<string, Promise<MarkdownRenderer>>();

/**
 * Astro's own Markdown renderer (heading ids, code highlighting, GFM), loaded from Astro's dependency at runtime: it
 * has a native binding, which cannot be bundled.
 */
export function markdownRenderer(
	root = process.cwd(),
	settings: MarkdownSettings = DEFAULTS,
): Promise<MarkdownRenderer> {
	const key = JSON.stringify([root, settings]);
	let renderer = renderers.get(key);
	if (!renderer) {
		renderer = (async () => {
			const astro = createRequire(join(root, "package.json")).resolve("astro/package.json");
			const href = pathToFileURL(createRequire(astro).resolve("@astrojs/markdown-satteri")).href;
			const { satteri } = (await import(/* @vite-ignore */ href)) as {
				satteri(o: { features?: unknown }): {
					createRenderer(shared: unknown): MarkdownRenderer | Promise<MarkdownRenderer>;
				};
			};
			return satteri({ features: settings.features }).createRenderer(settings.shared ?? {});
		})();
		renderers.set(key, renderer);
	}
	return renderer;
}

/**
 * Markdown stored outside content collections (a section body, a custom widget) as HTML, the way Astro renders an
 * `.md` entry: `const { html } = await markdownContent(section.body)` then `<Fragment set:html={html} />`. The text is
 * checked first with the same rules as the admin, so a body changed outside the admin cannot inject scripts either.
 */
export async function markdownContent(
	source: string,
	options: { root?: string; markdown?: MarkdownSettings } = {},
): Promise<{ html: string; headings: MarkdownHeading[] }> {
	const found = await findDisallowed(source, [], "md");
	if (found.length > 0) throw new Error(`[wuppy] Markdown not allowed: ${found.join(", ")}`);
	const result = await (await markdownRenderer(options.root, options.markdown)).render(source, { frontmatter: {} });
	return { html: result.code, headings: result.metadata.headings ?? [] };
}

interface AstroSatteri {
	satteriHeadingIdsPlugin(): unknown;
	satteriHighlightPlugin(highlight: unknown, excludeLangs?: string[]): unknown;
	satteriCreateHighlightFn(syntaxHighlight: unknown, shikiConfig: unknown): Promise<unknown>;
}

let plugins: Promise<AstroSatteri> | undefined;
const highlighters = new Map<string, Promise<unknown>>();

/** Astro's own Markdown plugins (heading ids, code highlighting), loaded like satteri: from Astro's dependency. */
function astroPlugins(root: string): Promise<AstroSatteri> {
	plugins ??= (async () => {
		const astro = createRequire(join(root, "package.json")).resolve("astro/package.json");
		const href = pathToFileURL(createRequire(astro).resolve("@astrojs/markdown-satteri")).href;
		return (await import(/* @vite-ignore */ href)) as AstroSatteri;
	})();
	return plugins;
}

/**
 * MDX text stored at runtime (a section body, an entry edited since the last build) compiled to what Astro's `render()`
 * gives: `const { Content, headings } = await mdxContent(section.body)` then `<Content components={{ Callout }} />`.
 * The text is checked first with the same rules as the admin (no imports, exports or expressions; only the `components`
 * listed in wuppy.config), so a body changed outside the admin cannot run code either. Headings get Astro's ids and
 * code blocks its highlighting. Needs `@astrojs/mdx` in the site, which renders the result.
 */
export async function mdxContent(
	source: string,
	options: { allowed?: readonly string[]; root?: string; markdown?: MdxMarkdownSettings } = {},
): Promise<{
	Content: (props?: { components?: Record<string, unknown> } & Record<string, unknown>) => unknown;
	headings: MarkdownHeading[];
}> {
	const root = options.root ?? process.cwd();
	const site = process.env.WUPPY_BASE_ROOT || root;
	const themeMode = process.env.WUPPY_BASE_ROOT && resolve(site) !== resolve(root);
	source = stripComponentImports(source);
	const allowed = options.allowed ?? [
		...new Set([...(await loadConfig(site)).components, ...(themeMode ? await themeComponentNames(root) : [])]),
	];
	const found = await findDisallowed(source, allowed, "mdx");
	if (found.length > 0) throw new Error(`[wuppy] MDX not allowed: ${found.join(", ")}`);
	const [satteri, astro] = await Promise.all([loadSatteri(root), astroPlugins(root)]);
	const { features = {}, shared = {} } = options.markdown ?? MDX_DEFAULTS;
	const hastPlugins: unknown[] = [];
	if (shared.syntaxHighlight) {
		const key = JSON.stringify([shared.syntaxHighlight, shared.shikiConfig]);
		if (!highlighters.has(key))
			highlighters.set(key, astro.satteriCreateHighlightFn(shared.syntaxHighlight, shared.shikiConfig ?? {}));
		const exclude = (shared.syntaxHighlight as { excludeLangs?: string[] }).excludeLangs;
		hastPlugins.push(astro.satteriHighlightPlugin(await highlighters.get(key), exclude));
	}
	hastPlugins.push(astro.satteriHeadingIdsPlugin());
	const data = { astro: { frontmatter: {}, headings: [] as MarkdownHeading[] } };
	const mod = await satteri.evaluate(source, {
		Fragment,
		jsx,
		jsxs: jsx,
		elementAttributeNameCase: "html",
		hastPlugins,
		data,
		// Same as Astro: GFM and smart punctuation unless the site turned them off.
		features: { ...features, gfm: shared.gfm !== false, smartPunctuation: shared.smartypants !== false },
	});
	const MDXContent = mod.default as (
		props: { components?: Record<string, unknown> } & Record<string, unknown>,
	) => unknown;
	// Same wrapper @astrojs/mdx puts around a compiled .mdx file.
	const Content = (props: { components?: Record<string, unknown> } & Record<string, unknown> = {}) =>
		MDXContent({ ...props, components: { Fragment, ...props.components } });
	Object.defineProperty(Content, Symbol.for("mdx-component"), { value: true });
	// What `__astro_tag_component__` does: render it with the MDX (`astro:jsx`) renderer.
	Object.defineProperty(Content, AstroRenderer, { value: "astro:jsx" });
	return { Content, headings: data.astro.headings };
}
