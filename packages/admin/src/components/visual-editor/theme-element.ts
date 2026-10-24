import { atom } from "nanostores";
import { apiData } from "../../lib/api.ts";
import { toast } from "../../ui/index.tsx";
import { $selected } from "./store.ts";

/**
 * An element of the theme's own markup (outside the entry's body) picked on the live canvas. Astro's dev server marks
 * every element with the `.astro` file and spot it comes from; edits go to that file (see core's astro-edit.ts) and the
 * dev server reloads the page.
 */
export interface ThemeElement {
	/** Changes when the user picks another element; kept while edits rewrite this one, so the panel keeps its tab and context. */
	selection: number;
	file: string;
	loc: string;
	tag: string;
	/** Its text, when it holds nothing else; null otherwise. */
	text: string | null;
	cls: string;
	style: string;
	/** Its other attributes (not Astro's own marks). */
	attrs: Record<string, string>;
	/** What the browser computed for it, shown where no class or style sets a property. */
	computed: Record<string, string>;
	/** The theme builds its CSS with Tailwind 4, so styles are written as classes (else as inline style). */
	tailwind: boolean;
}

export type ThemeEdit =
	| { action: "text"; value: string }
	| { action: "attrs"; attrs: Record<string, string | null> }
	| { action: "tag"; name: string }
	| { action: "delete" | "duplicate" }
	| { action: "move"; by: -1 | 1 };

export const $themeElement = atom<ThemeElement | null>(null);
// One selection at a time: picking a block of the body drops the theme element (Canvas does the reverse).
$selected.listen((id) => {
	if (id) $themeElement.set(null);
});

// Copies of Astro's data-astro-source-* marks (its dev toolbar removes those), see core's visual.ts.
export const SOURCE = "[data-wuppy-loc]";

const computedOf = (el: Element): Record<string, string> => {
	const css = el.ownerDocument.defaultView?.getComputedStyle(el);
	return css ? Object.fromEntries([...css].map((p) => [p, css.getPropertyValue(p)])) : {};
};

const OWN = /^(class|style|data-astro-|data-wuppy-)/;
let selection = 0;

export const describeElement = (el: Element): ThemeElement => ({
	selection: ++selection,
	file: el.getAttribute("data-wuppy-file") ?? "",
	loc: el.getAttribute("data-wuppy-loc") ?? "",
	tag: el.tagName.toLowerCase(),
	text: [...el.childNodes].every((n) => n.nodeType === 3) ? (el.textContent ?? "").trim() : null,
	cls: el.getAttribute("class") ?? "",
	style: el.getAttribute("style") ?? "",
	attrs: Object.fromEntries([...el.attributes].filter((a) => !OWN.test(a.name)).map((a) => [a.name, a.value])),
	computed: computedOf(el),
	// Tailwind 4 starts its CSS with this banner, in dev as in builds.
	tailwind: [...el.ownerDocument.querySelectorAll("style")].some((s) => s.textContent?.includes("tailwindcss v4")),
});

/** The theme-relative path the Code view opens: `.../themes/x/src/pages/a.astro` → `src/pages/a.astro`. */
// shortcut: assumes theme sources live under src/, as Astro projects do; pass the theme folder if one does not.
export const codePath = (file: string) => file.slice(file.lastIndexOf("/src/") + 1);

export async function editThemeElement(edit: ThemeEdit): Promise<boolean> {
	const el = $themeElement.get();
	if (!el) return false;
	try {
		const out = await apiData<{ loc?: string }>("POST", "/api/themes/element", {
			file: el.file,
			loc: el.loc,
			tag: el.tag,
			edit,
		});
		const patch: Partial<ThemeElement> = {};
		if (edit.action === "text") patch.text = edit.value;
		if (edit.action === "tag") patch.tag = edit.name;
		if (edit.action === "attrs") {
			const { class: cls, style, ...rest } = edit.attrs;
			if (cls !== undefined) patch.cls = cls ?? "";
			if (style !== undefined) patch.style = style ?? "";
			patch.attrs = Object.fromEntries(
				Object.entries({ ...el.attrs, ...rest }).filter((e): e is [string, string] => e[1] !== null),
			);
		}
		$themeElement.set(out.loc ? { ...el, ...patch, loc: out.loc } : null);
		return true;
	} catch (e) {
		toast((e as Error).message, "error");
		return false;
	}
}
