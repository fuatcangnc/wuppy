import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Fragment, jsx } from "astro/jsx-runtime";
import { Renderer } from "astro/runtime/server/index.js";
import { loadConfig } from "../config/index.ts";
import { findDisallowed, loadSatteri } from "./index.ts";

type Props = { components?: Record<string, unknown> } & Record<string, unknown>;
type Content = (props?: Props) => unknown;
export interface MarkdownHeading {
	depth: number;
	slug: string;
	text: string;
}

/** The JSON-safe parts of Astro's `markdown` config (see the live content shim). */
export interface MdxMarkdownSettings {
	features?: Record<string, unknown>;
	shared?: { syntaxHighlight?: unknown; shikiConfig?: unknown; gfm?: boolean; smartypants?: boolean };
}

interface AstroSatteri {
	satteriHeadingIdsPlugin(): unknown;
	satteriHighlightPlugin(highlight: unknown, excludeLangs?: string[]): unknown;
	satteriCreateHighlightFn(syntaxHighlight: unknown, shikiConfig: unknown): Promise<unknown>;
}

// Astro's defaults when the site's config is not at hand (a section rendered from a theme page).
const DEFAULTS: MdxMarkdownSettings = { shared: { syntaxHighlight: { type: "shiki", excludeLangs: ["math"] } } };

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
): Promise<{ Content: Content; headings: MarkdownHeading[] }> {
	const root = options.root ?? process.cwd();
	const allowed = options.allowed ?? (await loadConfig(root)).components;
	const found = await findDisallowed(source, allowed, "mdx");
	if (found.length > 0) throw new Error(`[wuppy] MDX not allowed: ${found.join(", ")}`);
	const [satteri, astro] = await Promise.all([loadSatteri(root), astroPlugins(root)]);
	const { features = {}, shared = {} } = options.markdown ?? DEFAULTS;
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
	const MDXContent = mod.default as (props: Props) => unknown;
	// Same wrapper @astrojs/mdx puts around a compiled .mdx file.
	const Content: Content = (props = {}) => MDXContent({ ...props, components: { Fragment, ...props.components } });
	Object.defineProperty(Content, Symbol.for("mdx-component"), { value: true });
	// What `__astro_tag_component__` does: render it with the MDX (`astro:jsx`) renderer.
	Object.defineProperty(Content, Renderer, { value: "astro:jsx" });
	return { Content, headings: data.astro.headings };
}
