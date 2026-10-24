import { atom } from "nanostores";
import { apiData } from "../../lib/api.ts";
import { toast } from "../../ui/index.tsx";
import { themeMarkup } from "./markdown.ts";
import { MODULES } from "./modules.ts";
import { $selected, $visual, setThemeInsert } from "./store.ts";
import type { NodeJson } from "@wuppycms/visual-editor";

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
	| { action: "text"; value: string; code?: boolean }
	| { action: "attrs"; attrs: Record<string, string | null> }
	| { action: "tag"; name: string }
	| { action: "delete" | "duplicate" }
	| { action: "insert"; html: string }
	| { action: "moveTo"; loc: string; tag?: string; position: "before" | "after" | "inside" }
	| { action: "move"; by: -1 | 1 };

/** The live page the canvas shows (its last loaded frame) and its body marker, for the theme's rows in Layers. */
export const $themeDoc = atom<{ doc: Document; root: HTMLElement | null; loads: number } | null>(null);

export const $themeElement = atom<ThemeElement | null>(null);
// One selection at a time: picking a block of the body drops the theme element (Canvas does the reverse).
$selected.listen((id) => {
	if (id) $themeElement.set(null);
});
// Typed edits belong to the element they were typed for.
$themeElement.listen((el) => {
	if (pending && el?.selection !== pending.el.selection) flushThemeEdits();
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

const patchOf = (el: ThemeElement, edit: ThemeEdit): Partial<ThemeElement> => {
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
	return patch;
};

/** Every copy of the element on the canvas frames (one per breakpoint; a list item renders many). */
function copiesOf(el: ThemeElement): Element[] {
	const frames = document.querySelectorAll<HTMLIFrameElement>('iframe[title^="Page canvas"]');
	return [...frames].flatMap((f) =>
		[...(f.contentDocument?.querySelectorAll(SOURCE) ?? [])].filter(
			(e) => e.getAttribute("data-wuppy-file") === el.file && e.getAttribute("data-wuppy-loc") === el.loc,
		),
	);
}

/** Shows a text or attribute edit on the canvas right away, before the file is written. */
function previewThemeEdit(el: ThemeElement, edit: LiveEdit): void {
	for (const node of copiesOf(el)) {
		if (edit.action === "text") node.textContent = edit.value;
		else
			for (const [name, value] of Object.entries(edit.attrs))
				if (value === null) node.removeAttribute(name);
				else node.setAttribute(name, value);
	}
}

/**
 * Applies one edit to a theme element; returns it as it is afterwards (null once deleted). Throws on failure. `live`:
 * the canvas already shows the change, so the dev server may skip reloading the page.
 */
export async function applyThemeEdit(el: ThemeElement, edit: ThemeEdit, live = false): Promise<ThemeElement | null> {
	const out = await apiData<{ loc?: string }>("POST", "/api/themes/element", {
		file: el.file,
		loc: el.loc,
		tag: el.tag,
		edit,
		...(live ? { live } : {}),
	});
	// Without a reload the canvas keeps the old location on the element; later edits find it by the new one.
	if (out.loc && out.loc !== el.loc) for (const node of copiesOf(el)) node.setAttribute("data-wuppy-loc", out.loc);
	return out.loc ? { ...el, ...patchOf(el, edit), loc: out.loc } : null;
}

type LiveEdit = Extract<ThemeEdit, { action: "text" | "attrs" }>;
interface Pending {
	el: ThemeElement;
	text?: string;
	attrs?: Record<string, string | null>;
	timer: ReturnType<typeof setTimeout>;
}
let pending: Pending | null = null;
// One write at a time: each one can move the element, and the next finds it by its new location.
let queue: Promise<unknown> = Promise.resolve();
/** The element after the last finished write, for a write queued before the user picked another element. */
let written: ThemeElement | null = null;

async function write(edit: ThemeEdit, target: ThemeElement | null, live: boolean): Promise<boolean> {
	const now = $themeElement.get();
	const el = !target ? now : ([now, written].find((e) => e?.selection === target.selection) ?? target);
	if (!el) return false;
	try {
		const next = await applyThemeEdit(el, edit, live);
		written = next;
		const cur = $themeElement.get();
		// A typed edit is already in the panel (newer typing may be too): only the location is news.
		if (cur?.selection === el.selection) $themeElement.set(next && (target ? { ...cur, loc: next.loc } : next));
		return true;
	} catch (e) {
		toast((e as Error).message, "error");
		if (target) {
			// The canvas shows a change the file does not have: load it again.
			$themeElement.set(null);
			for (const f of document.querySelectorAll<HTMLIFrameElement>('iframe[title^="Page canvas"]'))
				f.contentWindow?.location.reload();
		}
		return false;
	}
}

const enqueue = (edit: ThemeEdit, target: ThemeElement | null, live: boolean): Promise<boolean> => {
	const run = queue.then(() => write(edit, target, live));
	queue = run;
	return run;
};

/** Writes the typed edits waiting for a pause now (before another edit, or when another element is picked). */
export function flushThemeEdits(): void {
	const p = pending;
	pending = null;
	if (!p) return;
	clearTimeout(p.timer);
	if (p.text !== undefined) void enqueue({ action: "text", value: p.text }, p.el, true);
	if (p.attrs) void enqueue({ action: "attrs", attrs: p.attrs }, p.el, true);
}

/**
 * A text or attribute change made while typing or dragging: shown on the canvas and in the panel at once, written to the
 * theme file after a short pause, without reloading the page.
 */
export function liveThemeEdit(edit: LiveEdit): void {
	const el = $themeElement.get();
	if (!el) return;
	if (pending && pending.el.selection !== el.selection) flushThemeEdits();
	previewThemeEdit(el, edit);
	const next = { ...el, ...patchOf(el, edit) };
	$themeElement.set(next);
	if (pending) clearTimeout(pending.timer);
	pending = {
		...pending,
		...(edit.action === "text" ? { text: edit.value } : { attrs: { ...pending?.attrs, ...edit.attrs } }),
		el: next,
		timer: setTimeout(flushThemeEdits, 400),
	};
}

/** One edit of the picked element, written now. `live`: the canvas already shows it (text typed on the canvas). */
export function editThemeElement(edit: ThemeEdit, live = false): Promise<boolean> {
	if (!$themeElement.get()) return Promise.resolve(false);
	flushThemeEdits();
	return enqueue(edit, null, live);
}

/** Writes new blocks into the theme file right after the picked element, one after another; picks the last one. */
async function insertIntoTheme(nodes: NodeJson[]): Promise<void> {
	let el = $themeElement.get();
	for (const node of nodes) {
		const html = themeMarkup(node, $visual.get().components);
		if (!el || !html) continue;
		try {
			const out = await apiData<{ loc?: string }>("POST", "/api/themes/element", {
				file: el.file,
				loc: el.loc,
				tag: el.tag,
				edit: { action: "insert", html },
			});
			if (!out.loc) return;
			const def = MODULES[node.moduleId] ?? MODULES.markdown!;
			el = {
				...el,
				selection: ++selection,
				loc: out.loc,
				tag: def.tag(node.props),
				text: def.text ? (node.props[def.text] ?? "") : null,
				cls: node.props.class ?? "",
				style: "",
				attrs: {},
				computed: {},
			};
			$themeElement.set(el);
		} catch (e) {
			toast((e as Error).message, "error");
			return;
		}
	}
}

setThemeInsert((nodes) => {
	// Markdown has no markup of its own; it stays in the body.
	if (!$themeElement.get() || nodes.some((n) => n.moduleId === "markdown")) return false;
	void insertIntoTheme(nodes);
	return true;
});
