import { parse } from "@astrojs/compiler-rs";

/**
 * Edits one element of an `.astro` file, found by the `data-astro-source-loc` ("line:col") Astro's dev server puts on
 * every element it renders, so the visual editor can change a theme's own markup. The file is parsed with Astro's
 * compiler and only the element's own source range is rewritten; the rest of the file is kept byte for byte.
 */

export type ElementEdit =
	/** `code` also replaces text made by code (`{site.title}`) with the literal value; never other elements. */
	| { action: "text"; value: string; code?: boolean }
	/** Attribute values to set; `null` removes one, `""` leaves a bare attribute (`hidden`). */
	| { action: "attrs"; attrs: Record<string, string | null> }
	| { action: "tag"; name: string }
	| { action: "delete" | "duplicate" }
	/** New markup (one element) right after this one, on its own line with the same indent. */
	| { action: "insert"; html: string }
	/** Moves the element before, after or into another element of the same file (named by its location and tag). */
	| { action: "moveTo"; loc: string; tag?: string; position: "before" | "after" | "inside" }
	| { action: "move"; by: -1 | 1 };

interface Span {
	start: number;
	end: number;
}
interface El extends Span {
	type: "JSXElement";
	openingElement: Span & { name: Span; attributes: Attr[] };
	closingElement: (Span & { name: Span }) | null;
	children: Array<Span & { type: string }>;
}
type Attr = Span & { type: string; name?: Span & { name?: unknown }; value?: (Span & { type: string }) | null };

export class ElementEditError extends Error {}

/** Every element with the children list it sits in (`null` when it is inside an expression, e.g. a `.map()`). */
function elements(source: string): Array<{ el: El; siblings: El[] | null }> {
	const out: Array<{ el: El; siblings: El[] | null }> = [];
	const walk = (node: unknown, siblings: El[] | null): void => {
		if (!node || typeof node !== "object") return;
		if (Array.isArray(node)) {
			const els = node.filter((n): n is El => (n as El)?.type === "JSXElement");
			for (const n of node) walk(n, siblings === null ? null : els);
			return;
		}
		const n = node as Record<string, unknown>;
		if (n.type === "JSXElement") out.push({ el: n as unknown as El, siblings });
		for (const [key, value] of Object.entries(n)) {
			if (key === "frontmatter" || !value || typeof value !== "object") continue;
			// Children lists keep sibling order; anything else (expressions, attributes) has no movable siblings.
			walk(value, key === "children" || key === "body" ? [] : null);
		}
	};
	walk(parse(source).ast, []);
	return out;
}

const offsetOf = (source: string, loc: string): number => {
	const [line, col] = loc.split(":").map(Number);
	if (!line || !col) throw new ElementEditError(`Bad element location ${loc}`);
	let at = 0;
	for (let i = 1; i < line; i++) {
		at = source.indexOf("\n", at) + 1;
		if (at === 0) throw new ElementEditError(`Line ${line} is past the end of the file`);
	}
	return at + col - 1;
};

/**
 * Where Astro's dev server locates an element (measured against its output): at its first child, a child element
 * counting from just inside its `<`; an empty or self-closing element just inside its own `<`.
 */
const astroAt = (el: El): number => {
	const first = el.children[0];
	if (!first) return el.start + 1;
	return first.type === "JSXElement" ? first.start + 1 : first.start;
};

const locOf = (source: string, el: El): string => {
	const before = source.slice(0, astroAt(el));
	return `${before.split("\n").length}:${before.length - before.lastIndexOf("\n")}`;
};

const nameOf = (el: El) => String((el.openingElement.name as { name?: unknown }).name ?? "").toLowerCase();

function find(source: string, loc: string, tag?: string) {
	const at = offsetOf(source, loc);
	// An element that opens with an empty child shares its location; the tag tells them apart.
	const hits = elements(source).filter(({ el }) => astroAt(el) === at);
	const hit = hits.find(({ el }) => !tag || nameOf(el) === tag.toLowerCase()) ?? hits[0];
	if (!hit) throw new ElementEditError("The element is no longer in the file; reload the page");
	return hit;
}

const escapeText = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** The element's range, widened to whole lines when it is alone on them. */
function lines(source: string, { start, end }: Span): Span & { own: boolean } {
	const lineStart = source.lastIndexOf("\n", start - 1) + 1;
	const lineEnd = source.indexOf("\n", end) === -1 ? source.length : source.indexOf("\n", end);
	const own = !source.slice(lineStart, start).trim() && !source.slice(end, lineEnd).trim();
	return own ? { start: lineStart, end: lineEnd, own } : { start, end, own };
}

const splice = (s: string, start: number, end: number, insert = "") => s.slice(0, start) + insert + s.slice(end);

export function editAstroElement(
	source: string,
	loc: string,
	edit: ElementEdit,
	tag?: string,
): { source: string; loc?: string; quiet?: boolean } {
	const { el, siblings } = find(source, loc, tag);
	let out = source;
	// Where the edited element starts afterwards, to report its new location.
	let start: number | undefined = el.start;
	if (edit.action === "text") {
		if (!el.closingElement) throw new ElementEditError("This element has no text");
		const allowed = edit.code ? ["JSXText", "JSXExpressionContainer"] : ["JSXText"];
		if (el.children.some((c) => !allowed.includes(c.type)))
			throw new ElementEditError("This text is made by code or holds other elements; edit it in Code view");
		out = splice(source, el.openingElement.end, el.closingElement.start, escapeText(edit.value));
	} else if (edit.action === "attrs") {
		const changes: Array<[number, number, string]> = [];
		for (const [name, value] of Object.entries(edit.attrs)) {
			const attr = el.openingElement.attributes.find(
				(a) => a.type === "JSXAttribute" && source.slice(a.name!.start, a.name!.end) === name,
			);
			const text = value === null ? "" : value.trim() ? `${name}="${escapeAttr(value.trim())}"` : name;
			if (attr?.value && attr.value.type !== "Literal")
				throw new ElementEditError(`This element's ${name} is set by code; edit it in Code view`);
			if (attr) {
				// Removing also drops the space before it.
				const from = text ? attr.start : source.slice(0, attr.start).trimEnd().length;
				changes.push([from, attr.end, text]);
			} else if (text) changes.push([el.openingElement.name.end, el.openingElement.name.end, ` ${text}`]);
		}
		for (const [from, to, text] of changes.toSorted((a, b) => b[0] - a[0])) out = splice(out, from, to, text);
	} else if (edit.action === "tag") {
		const { name } = el.openingElement;
		if (!/^[a-z]/.test(source.slice(name.start, name.end)))
			throw new ElementEditError("Components keep their name; edit it in Code view");
		const close = el.closingElement?.name;
		if (close) out = splice(out, close.start, close.end, edit.name);
		out = splice(out, name.start, name.end, edit.name);
	} else if (edit.action === "delete") {
		const range = lines(source, el);
		out = splice(source, range.start, range.own && range.end < source.length ? range.end + 1 : range.end);
		start = undefined;
	} else if (edit.action === "duplicate") {
		const range = lines(source, el);
		const copy = source.slice(range.start, el.end);
		out = splice(source, el.end, el.end, range.own ? `\n${copy}` : copy);
	} else if (edit.action === "insert") {
		if (!siblings?.includes(el))
			throw new ElementEditError("This element is made by code; add next to it in Code view");
		const range = lines(source, el);
		const indent = range.own ? source.slice(range.start, el.start) : "";
		out = splice(source, el.end, el.end, `${range.own ? `\n${indent}` : ""}${edit.html.trim()}`);
		start = el.end + (range.own ? 1 + indent.length : 0);
		if (!elements(out).some(({ el: e }) => e.start === start))
			throw new ElementEditError("The new markup must start with an element");
	} else if (edit.action === "moveTo") {
		if (!siblings?.includes(el)) throw new ElementEditError("This element is made by code; move it in Code view");
		const { el: target, siblings: around } = find(source, edit.loc, edit.tag);
		if (target === el || (target.start >= el.start && target.end <= el.end))
			throw new ElementEditError("An element cannot go inside itself");
		if (edit.position !== "inside" && !around?.includes(target))
			throw new ElementEditError("That element is made by code; move next to it in Code view");
		if (edit.position === "inside" && !target.closingElement)
			throw new ElementEditError("That element cannot hold other elements");
		const text = source.slice(el.start, el.end);
		const own = lines(source, el);
		const cut = { start: own.start, end: own.own && own.end < source.length ? own.end + 1 : own.end };
		const indentOf = (at: number) => /^[ \t]*/.exec(source.slice(source.lastIndexOf("\n", at - 1) + 1))![0];
		let at: number;
		let insert: string;
		let lead: number; // where the element starts within `insert`
		if (edit.position === "inside") {
			const close = target.closingElement!;
			const closeLine = lines(source, close);
			const indent = `${indentOf(target.start)}\t`;
			at = closeLine.own ? closeLine.start : close.start;
			insert = closeLine.own ? `${indent}${text}\n` : text;
			lead = closeLine.own ? indent.length : 0;
		} else {
			const range = lines(source, target);
			const indent = range.own ? indentOf(target.start) : "";
			if (edit.position === "before") {
				at = range.start;
				insert = range.own ? `${indent}${text}\n` : text;
				lead = indent.length;
			} else {
				at = target.end;
				insert = range.own ? `\n${indent}${text}` : text;
				lead = range.own ? 1 + indent.length : 0;
			}
		}
		if (at <= cut.start) {
			out = splice(splice(source, cut.start, cut.end), at, at, insert);
			start = at + lead;
		} else {
			out = splice(splice(source, at, at, insert), cut.start, cut.end);
			start = at - (cut.end - cut.start) + lead;
		}
	} else if (edit.action === "move") {
		const i = siblings?.indexOf(el) ?? -1;
		const other = i === -1 ? undefined : siblings![i + edit.by];
		if (!other)
			throw new ElementEditError(
				i === -1 ? "This element is made by code; move it in Code view" : "Nothing to move past",
			);
		const [a, b] = edit.by < 0 ? [other, el] : [el, other];
		const text = (s: Span) => source.slice(s.start, s.end);
		out = source.slice(0, a.start) + text(b) + source.slice(a.end, b.start) + text(a) + source.slice(b.end);
		start = edit.by < 0 ? a.start : b.end - (el.end - el.start);
	}
	if (start === undefined) return { source: out };
	const after = elements(out);
	const moved = after.find(({ el: e }) => e.start === start);
	// Text or attributes that leave every other element where it was: the page can show it without a reload.
	let quiet: boolean | undefined;
	if (edit.action === "text" || edit.action === "attrs") {
		const all = elements(source);
		quiet =
			after.length === all.length &&
			after.every(({ el: e }, i) => all[i]!.el.start === el.start || locOf(out, e) === locOf(source, all[i]!.el));
	}
	return { source: out, loc: moved ? locOf(out, moved.el) : undefined, ...(quiet ? { quiet } : {}) };
}
