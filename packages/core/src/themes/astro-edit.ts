import { parse } from "@astrojs/compiler-rs";

/**
 * Edits one element of an `.astro` file, found by the `data-astro-source-loc` ("line:col") Astro's dev server puts on
 * every element it renders, so the visual editor can change a theme's own markup. The file is parsed with Astro's
 * compiler and only the element's own source range is rewritten; the rest of the file is kept byte for byte.
 */

export type ElementEdit =
	| { action: "text"; value: string }
	/** Attribute values to set; `null` removes one, `""` leaves a bare attribute (`hidden`). */
	| { action: "attrs"; attrs: Record<string, string | null> }
	| { action: "tag"; name: string }
	| { action: "delete" | "duplicate" }
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
): { source: string; loc?: string } {
	const { el, siblings } = find(source, loc, tag);
	let out = source;
	// Where the edited element starts afterwards, to report its new location.
	let start: number | undefined = el.start;
	if (edit.action === "text") {
		if (!el.closingElement) throw new ElementEditError("This element has no text");
		if (el.children.some((c) => c.type !== "JSXText"))
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
	const moved = elements(out).find(({ el: e }) => e.start === start);
	return { source: out, loc: moved ? locOf(out, moved.el) : undefined };
}
