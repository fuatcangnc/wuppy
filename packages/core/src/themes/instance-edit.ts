import { editAstroElement, ElementEditError, elements, locOf, plainValue, type ElementEdit } from "./astro-edit.ts";

/**
 * One use of a component (`<SectionHeader … />`) on a page: the element of another file that holds what it renders
 * (`file`/`loc`/`tag`, the host), and which of the host's children made by other files it is (`slot` of `count`).
 * The editor sends it for the outermost element of a component used in several places, so an edit of that element
 * changes this use only: its class goes to the call's `className`/`class`, and moving, copying, deleting or adding
 * next to it changes the call.
 */
export interface ElementHost {
	file: string;
	loc: string;
	tag?: string;
	slot: number;
	count: number;
}

/** The edits a component call can take for its one use; the others change the component. */
export const forInstance = (edit: ElementEdit): boolean =>
	(edit.action === "attrs" && Object.keys(edit.attrs).every((k) => k === "class")) ||
	["delete", "duplicate", "move", "insert"].includes(edit.action);

const HTML_NAME = /^[a-z][a-z0-9-]*$/;
// `{" "}` or `{2}` render no element.
const NO_ELEMENT = /^\{\s*(?:(["'`])[^"'`]*\1|\d+)?\s*\}$/;
const words = (s: string) => s.split(/\s+/).filter(Boolean);
type El = ReturnType<typeof elements>[number]["el"];
const nameOf = (source: string, el: El) => source.slice(el.openingElement.name.start, el.openingElement.name.end);

/** The component calls among the children of the element starting at `start`; null when code could render some. */
function callsIn(source: string, start: number, jsx: boolean): El[] | null {
	const all = elements(source, jsx);
	const host = all.find(({ el }) => el.start === start)?.el;
	if (!host) throw new ElementEditError("The element is no longer in the file; reload the page");
	const calls: El[] = [];
	for (const child of host.children) {
		if (child.type === "JSXExpressionContainer" && !NO_ELEMENT.test(source.slice(child.start, child.end))) return null;
		if (child.type !== "JSXElement") continue;
		const el = all.find(({ el: e }) => e.start === child.start)!.el;
		if (!HTML_NAME.test(nameOf(source, el))) calls.push(el);
	}
	return calls;
}

/**
 * The host file with the edit made on the component call; `slot` is where this use is afterwards. `takesClass`: the
 * component passes a `className`/`class` to its outer element. `merge`: the theme's `tailwind-merge`, by which a class
 * of the call replaces one of the component (`gap-8` over `gap-5`).
 */
export function editInstance(
	source: string,
	hostLoc: string,
	host: ElementHost,
	edit: ElementEdit,
	o: { jsx: boolean; takesClass: boolean; merge?: (classes: string) => string },
): { source: string; slot: number; loc?: string } {
	const at = elements(source, o.jsx).find(
		({ el }) => locOf(source, el) === hostLoc && (!host.tag || nameOf(source, el) === host.tag),
	);
	if (!at) throw new ElementEditError("The element is no longer in the file; reload the page");
	// Edits stay inside the host, so it keeps its start.
	const start = at.el.start;
	const calls = callsIn(source, start, o.jsx);
	const call = calls?.length === host.count ? calls[host.slot] : undefined;
	if (!call)
		throw new ElementEditError(
			"Wuppy cannot tell which use of this component it is; change it in Code view, or pick an element inside it",
		);
	const name = nameOf(source, call);
	if (edit.action !== "attrs") {
		const { source: out, loc } = editAstroElement(source, locOf(source, call), edit, name, o.jsx);
		const text = source.slice(call.start, call.end);
		const slot =
			edit.action === "move"
				? (callsIn(out, start, o.jsx) ?? []).findIndex((c) => out.slice(c.start, c.end) === text)
				: host.slot;
		// `loc`: where an added element is.
		return { source: out, slot, ...(edit.action === "insert" && loc ? { loc } : {}) };
	}
	if (!o.takesClass)
		throw new ElementEditError(
			`${name} takes no class from where it is used, so this would change every use; edit it in Code view`,
		);
	const attrName = o.jsx ? "className" : "class";
	const attr = call.openingElement.attributes.find(
		(a) => a.type === "JSXAttribute" && source.slice(a.name!.start, a.name!.end) === attrName,
	);
	const ownText = attr?.value ? plainValue(source, attr.value) : "";
	if (ownText === null) throw new ElementEditError(`This use's ${attrName} is set by code; edit it in Code view`);
	const own = words(ownText);
	const to = words(edit.attrs.class ?? "");
	const base = words(edit.from?.class ?? "").filter((c) => !own.includes(c));
	const extra = to.filter((c) => !base.includes(c));
	// A class of the component goes only when one of this use replaces it.
	const left = o.merge ? words(o.merge([...base, ...extra].join(" "))) : base;
	const kept = base.filter((c) => !to.includes(c) && left.includes(c));
	if (kept.length)
		throw new ElementEditError(
			`"${kept[0]}" comes from ${name} itself, so it cannot be removed for one use; replace it with another class, or edit ${name} in Code view`,
		);
	const attrs = { class: extra.join(" ") || null };
	return {
		source: editAstroElement(source, locOf(source, call), { action: "attrs", attrs }, name, o.jsx).source,
		slot: host.slot,
	};
}

/** Whether the element's class list is made by code that takes the component's `className`/`class`. */
export function passesClass(source: string, loc: string, tag: string | undefined, jsx: boolean): boolean {
	const hit = elements(source, jsx).find(
		({ el }) => locOf(source, el) === loc && (!tag || nameOf(source, el).toLowerCase() === tag.toLowerCase()),
	);
	const attr = hit?.el.openingElement.attributes.find(
		(a) => a.type === "JSXAttribute" && /^class(Name|:list)?$/.test(source.slice(a.name!.start, a.name!.end)),
	);
	return (
		!!attr?.value &&
		attr.value.type !== "Literal" &&
		/\bclass(Name)?\b/.test(source.slice(attr.value.start, attr.value.end))
	);
}
