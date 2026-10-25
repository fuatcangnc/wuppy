import { relative, sep } from "node:path";

// Astro does not mark these either: the document shell, head-only tags and raw-text tags.
const UNMARKED = new Set(["html", "head", "title", "meta", "link", "base", "style", "script", "slot", "noscript"]);
const JSX = /\.[jt]sx$/;
const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * Puts `data-wuppy-file` / `data-wuppy-loc` on every HTML element of an `.astro` file, with the location Astro's dev
 * server would give it, so the visual editor can edit a theme's elements on a production build too (Astro marks
 * them only in `astro dev`). The file is relative to the theme; the visual middleware strips the marks for visitors.
 */
export async function markSource(
	code: string,
	file: string,
	/** What to put on each element; the default is the editor's marks. */
	attrs = (loc: string) => ` data-wuppy-file="${escapeAttr(file)}" data-wuppy-loc="${loc}"`,
): Promise<string> {
	const { elements, locOf } = await import("../themes/astro-edit.ts");
	const marks: Array<[number, string]> = [];
	for (const { el } of elements(code, JSX.test(file))) {
		const name = code.slice(el.openingElement.name.start, el.openingElement.name.end);
		// Components (`Card`, `ui.Button`, `Fragment`) render their own markup, which carries its own marks.
		if (!/^[a-z][a-z0-9-]*$/.test(name) || UNMARKED.has(name)) continue;
		marks.push([el.openingElement.name.end, attrs(locOf(code, el))]);
	}
	let out = code;
	for (const [at, text] of marks.toSorted((a, b) => b[0] - a[0])) out = out.slice(0, at) + text + out.slice(at);
	return out;
}

/**
 * `.astro` files only in builds: `astro dev` marks those itself (visual.ts copies the marks). React components
 * (`.tsx`/`.jsx`, rendered on the server) are never marked by Astro, so they are marked in dev too.
 */
export function sourceMarksPlugin(root: string) {
	let build = false;
	return {
		name: "wuppy:source-marks",
		enforce: "pre" as const,
		configResolved(config: { command: string }) {
			build = config.command === "build";
		},
		transform: {
			// After the theme-pages transform, like Astro's own marks, so a theme page's line shift stays the same.
			order: "pre" as const,
			async handler(code: string, id: string) {
				if (id.includes("?") || !(JSX.test(id) || (build && id.endsWith(".astro")))) return null;
				const file = relative(root, id).split(sep).join("/");
				if (file.startsWith("..") || file.startsWith("node_modules/")) return null;
				return { code: await markSource(code, file), map: null };
			},
		},
	};
}
