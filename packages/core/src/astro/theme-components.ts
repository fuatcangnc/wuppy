import { join, resolve } from "node:path";
import { listThemeComponents, type ThemeComponent } from "../themes/components.ts";

/**
 * Makes the active theme's Astro components available to MDX content without asking the theme author to pass a
 * components map in every page template. A tiny Vite transform adds `components={__wuppyComponents}` to `<Content />`
 * (build and live rendering use the same page) and imports the components directly, so there is no virtual module for
 * Vite's dev module runner to resolve.
 *
 * The map is generated from source files, so adding a component needs a dev-server restart/rebuild; that matches the
 * theme source workflow (Code view already asks for a rebuild after source changes).
 */
export function mapSource(list: ThemeComponent[]): string {
	return [
		'import { markHTMLString as __wuppyHtml } from "astro/runtime/server/index.js";',
		// A component an editor inserted without the props it needs must not take the whole page down: its failure is
		// logged and it renders as an HTML comment instead.
		// shortcut: only errors thrown while the component itself runs are caught, not ones from components it renders.
		"const __wuppySafe = (name, C) => Object.assign((result, props, slots) => {",
		"	const failed = (e) => {",
		"		console.error(`[wuppy] <${name}> could not render: ${e?.message ?? e}`);",
		"		return __wuppyHtml(`<!-- wuppy: <${name}> could not render -->`);",
		"	};",
		"	try {",
		"		const out = C(result, props, slots);",
		'		return out && typeof out.then === "function" ? out.catch(failed) : out;',
		"	} catch (e) {",
		"		return failed(e);",
		"	}",
		"}, C);",
		...list.map((component, i) => `import __wuppyC${i} from ${JSON.stringify(component.path)};`),
		`const __wuppyComponents = { ${list
			.map(
				(component, i) =>
					`${JSON.stringify(component.name)}: __wuppySafe(${JSON.stringify(component.name)}, __wuppyC${i})`,
			)
			.join(", ")} };`,
	].join("\n");
}

/**
 * Wraps the page's `<Content />` in `<!--wuppy:body-->` comments, so the visual editor can load the live page and edit
 * the entry in place inside any theme's layout. Comments do not change layout or CSS.
 */
const BODY_SOURCE = [
	'import { createComponent as __wuppyCreate, renderComponent as __wuppyRenderComponent, render as __wuppyRender } from "astro/runtime/server/index.js";',
	'const __wuppyBody = (C) => __wuppyCreate((result, props, slots) => __wuppyRender`<!--wuppy:body-->${__wuppyRenderComponent(result, "Content", C, props, slots)}<!--/wuppy:body-->`);',
].join("\n");

export function themeComponentsPlugin(root: string) {
	// A theme owns the design. Site components stay in the site's own build; a theme card cannot import them
	// through its aliases (`@/…`), so only the running project's components are mapped here.
	const roots = [resolve(root)];
	let pending: Promise<ThemeComponent[]> | undefined;
	const components = () =>
		(pending ??= (async () => {
			const out: ThemeComponent[] = [];
			const seen = new Set<string>();
			for (const base of roots) {
				for (const component of await listThemeComponents(base)) {
					if (seen.has(component.name)) continue;
					seen.add(component.name);
					out.push({ name: component.name, path: join(base, component.path) });
				}
			}
			return out;
		})());

	return {
		name: "wuppy:theme-components",
		transform: {
			// Astro compiles `.astro` to JS before Vite's normal transform runs; patch the compiled `Content` render.
			// The raw-source branch keeps this working if another integration hands us the source first.
			order: "post" as const,
			async handler(code: string, id: string) {
				if (!id.endsWith(".astro") || id.includes("/node_modules/")) return null;
				if (code.includes("const __wuppyBody")) return null;
				const list = await components();
				if (code.includes(`renderComponent($$result, "Content", Content`)) {
					const map = list.length > 0 && !/\bcomponents\s*[:,]/.test(code);
					const patched = code.replace(
						/renderComponent\(\$\$result, "Content", Content, \{/g,
						`renderComponent($$$$result, "Content", __wuppyBody(Content), {${map ? " components: __wuppyComponents," : ""}`,
					);
					return { code: `${BODY_SOURCE}\n${map ? `${mapSource(list)}\n` : ""}${patched}`, map: null };
				}
				// shortcut: the raw-source branch only adds the components map, not the body markers.
				if (!list.length || code.includes("const __wuppyComponents")) return null;
				if (!code.includes("<Content")) return null;
				let changed = false;
				const body = code.replace(/<Content\b([^>]*)>/g, (full, attrs: string) => {
					if (/\bcomponents\s*=/.test(attrs)) return full;
					changed = true;
					return `<Content components={__wuppyComponents}${attrs}>`;
				});
				if (!changed) return null;
				const frontmatter = /^---\r?\n/.exec(body);
				const at = frontmatter?.[0].length ?? 0;
				const out = `${body.slice(0, at)}${mapSource(list)}\n${body.slice(at)}`;
				return { code: at ? out : `---\n${mapSource(list)}\n---\n${body}`, map: null };
			},
		},
	};
}
