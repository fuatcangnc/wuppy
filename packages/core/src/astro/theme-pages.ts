import { readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseDocument } from "../content/parsers/frontmatter.ts";
import { listThemeComponents } from "../themes/components.ts";
import { mapSource } from "./theme-components.ts";

/**
 * A theme's Markdown pages (`src/pages/about.md`) are site content: their text lives in the site's Pages entry
 * (imported on activation, see importPages). This plugin swaps the page module for one that renders that entry on each
 * request (see themePage in live-runtime.ts) inside the theme file's own `layout`, so admin edits show at once and the
 * theme's look is kept. The body is wrapped in `<!--wuppy:body-->` comments for the visual editor. Without a site entry
 * the theme's own text is shown.
 */

export interface ThemePagesOptions {
	/** The theme's folder (Astro's root). */
	root: string;
	runtime: string;
	markdown: () => Record<string, unknown>;
}

/** `<theme>/src/pages/docs/intro.md` -> `docs/intro`, or undefined when it is not a static Markdown or Astro page. */
export function themePageRel(root: string, id: string): string | undefined {
	const rel = relative(join(root, "src/pages"), id).split(sep).join("/");
	if (
		rel.startsWith("..") ||
		!/\.(mdx?|astro)$/.test(rel) ||
		rel.includes("[") ||
		rel.split("/").some((p) => p.startsWith("_"))
	)
		return undefined;
	return rel.replace(/\.(mdx?|astro)$/, "");
}

const BODY_ID = "virtual:wuppy-theme-body/";

/**
 * A theme `.astro` page keeps its own markup; the blocks added to it in the admin (its Pages entry's body) render at the
 * end of its `<main>`, or inside its last element when it has none, through a generated `<WuppyThemeBody />`.
 */
export function withThemeBody(source: string, rel: string): string {
	const front = /^\s*---\r?\n/.exec(source);
	const importLine = `import WuppyThemeBody from ${JSON.stringify(BODY_ID + rel)};`;
	// Kept on the frontmatter's first line, so the template's line numbers (Astro's element locations, which the visual
	// editor edits by) stay those of the file. See themeBodyShift for when that is not possible.
	const head = front
		? source.slice(0, front[0].length) + importLine + (themeBodyShift(source) ? "\n" : " ")
		: `---\n${importLine}\n---\n`;
	const rest = front ? source.slice(front[0].length) : source;
	const end = front ? rest.search(/^---\s*$/m) : 0;
	const template = rest.slice(end);
	let at = template.lastIndexOf("</main>");
	if (at === -1)
		for (const m of template.matchAll(/<\/([A-Za-z][\w.:-]*)\s*>/g)) if (!/^(style|script)$/i.test(m[1]!)) at = m.index;
	if (at === -1) return source;
	return head + rest.slice(0, end) + template.slice(0, at) + "<WuppyThemeBody />" + template.slice(at);
}

/** Lines withThemeBody adds before the template: none, unless the page has no frontmatter or an empty one. */
export function themeBodyShift(source: string): number {
	const front = /^\s*---\r?\n/.exec(source);
	if (!front) return 3;
	return /^---\s*$/m.test(source.slice(front[0].length).split("\n")[0] ?? "") ? 1 : 0;
}

/** The `<WuppyThemeBody />` module for one page: the entry's body between the visual editor's markers. */
const bodyModule = (rel: string, runtime: string, components: string, settings: Record<string, unknown>) =>
	`import { createComponent, render, renderComponent, unescapeHTML } from "astro/runtime/server/index.js";
import { themeBody } from ${JSON.stringify(runtime)};
${components || "const __wuppyComponents = {};"}
export default createComponent(async (result) => {
	const page = await themeBody(${JSON.stringify(rel)}, ${JSON.stringify(settings)});
	if (!page) return render\`\`;
	return page.Content
		? render\`<!--wuppy:body-->\${renderComponent(result, "Content", page.Content, { components: __wuppyComponents })}<!--/wuppy:body-->\`
		: render\`<!--wuppy:body-->\${unescapeHTML(page.html)}<!--/wuppy:body-->\`;
});
`;

export function pageModule(o: {
	rel: string;
	file: string;
	runtime: string;
	layout?: string;
	url: string;
	components: string;
	settings: Record<string, unknown>;
}): string {
	return `import { createComponent, render, renderComponent, unescapeHTML } from "astro/runtime/server/index.js";
import { themePage } from ${JSON.stringify(o.runtime)};
${o.layout ? `import Layout from ${JSON.stringify(o.layout)};` : ""}
${o.components || "const __wuppyComponents = {};"}
const file = ${JSON.stringify(o.file)};
const url = ${JSON.stringify(o.url)};
export default createComponent(async (result) => {
	const page = await themePage(${JSON.stringify(o.rel)}, file, ${JSON.stringify(o.settings)});
	const content = { ...page.data, file, url };
	const body = () => page.Content
		? render\`<!--wuppy:body-->\${renderComponent(result, "Content", page.Content, { components: __wuppyComponents })}<!--/wuppy:body-->\`
		: render\`<!--wuppy:body-->\${unescapeHTML(page.html)}<!--/wuppy:body-->\`;
	return ${
		o.layout
			? `render\`\${renderComponent(result, "Layout", Layout, { file, url, content, frontmatter: content, headings: page.headings, "server:root": true }, { default: body })}\``
			: "body()"
	};
});
`;
}

/**
 * The route for the site's Pages entries the theme has no page for (a page added in the admin): the theme's home page
 * (`index`, in `dir`) with its `<main>` holding the entry's body between the visual editor's markers, so a new page
 * keeps the theme's header, footer and layout. Undefined when the home page has no `<main>`.
 */
export function sitePageSource(
	index: string,
	dir: string,
	o: { runtime: string; components: string; settings: Record<string, unknown> },
): string | undefined {
	const front = /^\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n/.exec(index);
	const template = front ? index.slice(front[0].length) : index;
	const open = /<main\b[^>]*>/.exec(template);
	const close = template.lastIndexOf("</main>");
	if (!open || close < open.index) return undefined;
	// The file is generated elsewhere, so the home page's relative imports are made absolute.
	// shortcut: relative paths in the markup itself (`<img src="./a.png">`) are left as they are; rare in a home page.
	const script = (front?.[1] ?? "")
		.replace(
			/(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.\.?\/[^"'\n]*)\2/g,
			(_m, lead: string, _q: string, spec: string) => `${lead}${JSON.stringify(join(dir, spec))}`,
		)
		.replace(/^\s*export\s+const\s+prerender\s*=.*$/gm, "");
	const at = open.index + open[0].length;
	return [
		"---",
		`import { sitePage as __wuppySitePage } from ${JSON.stringify(o.runtime)};`,
		o.components || "const __wuppyComponents = {};",
		script,
		"export const prerender = false;",
		`const __wuppyPage = await __wuppySitePage(Astro.params.wuppyPage ?? "", ${JSON.stringify(o.settings)});`,
		"if (!__wuppyPage) return new Response(null, { status: 404 });",
		'Astro.response.headers.set("x-wuppy-site-page", "1");',
		"const WuppySitePageContent = __wuppyPage.Content;",
		"---",
		template.slice(0, at) +
			'<Fragment set:html={"<!--wuppy:body-->"} />{WuppySitePageContent ? <WuppySitePageContent components={__wuppyComponents} /> : <Fragment set:html={__wuppyPage.html} />}<Fragment set:html={"<!--/wuppy:body-->"} />' +
			template.slice(close),
	].join("\n");
}

export function themePagesPlugin(o: ThemePagesOptions) {
	return {
		name: "wuppy:theme-pages",
		enforce: "pre" as const,
		resolveId: (id: string) => (id.startsWith(BODY_ID) ? `\0${id}` : null),
		transform: {
			// Before Astro compiles the page.
			order: "pre" as const,
			handler(code: string, id: string) {
				if (id.includes("?") || !id.endsWith(".astro")) return null;
				const rel = themePageRel(o.root, id);
				return rel ? { code: withThemeBody(code, rel), map: null } : null;
			},
		},
		load: {
			// Before Astro's Markdown/MDX plugins read the theme file. wuppy.config cannot be read here (Astro's config
			// loader is closed), so the module finds the site entry when it renders.
			order: "pre" as const,
			async handler(id: string) {
				const map = async () => {
					const all = await listThemeComponents(o.root);
					return all.length ? mapSource(all.map((c) => ({ ...c, path: join(o.root, c.path) }))) : "";
				};
				if (id.startsWith(`\0${BODY_ID}`))
					return { code: bodyModule(id.slice(BODY_ID.length + 1), o.runtime, await map(), o.markdown()), map: null };
				const file = id.split("?")[0]!;
				const rel = themePageRel(o.root, file);
				if (!rel || id.includes("?") || file.endsWith(".astro")) return null;
				const { layout } = parseDocument(await readFile(file, "utf8")).data;
				return {
					code: pageModule({
						rel,
						file,
						runtime: o.runtime,
						// Imported from the theme file's own id, so relative paths and aliases resolve as in Astro.
						layout: typeof layout === "string" ? layout : undefined,
						url: `/${rel.replace(/(^|\/)index$/, "")}`,
						components: await map(),
						settings: o.markdown(),
					}),
					map: null,
				};
			},
		},
	};
}
