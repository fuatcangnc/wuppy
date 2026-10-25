import { importInstalled } from "./installed-dep.ts";
import { jsxElements } from "./jsx-elements.ts";

/**
 * Edits one element of an `.astro` file, found by the `data-astro-source-loc` ("line:col") Astro's dev server puts on
 * every element it renders, so the visual editor can change a theme's own markup. The file is parsed with Astro's
 * compiler and only the element's own source range is rewritten; the rest of the file is kept byte for byte.
 */

export type ElementEdit =
	/** `code` also replaces text made by code (`{site.title}`) with the literal value; never other elements. */
	/** `from`: the text before the edit, to find it in the theme's code when the element shows it from a variable. */
	| { action: "text"; value: string; code?: boolean; from?: string }
	/** Attribute values to set; `null` removes one, `""` leaves a bare attribute (`hidden`). */
	/** `from`: the values before the edit; a class list made by code (`cn("a", b)`) is changed by it. */
	| { action: "attrs"; attrs: Record<string, string | null>; from?: Record<string, string> }
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

const { parse } = await importInstalled<typeof import("@astrojs/compiler-rs")>("@astrojs/compiler-rs");

export class ElementEditError extends Error {}

/** Every element with the children list it sits in (`null` when it is inside an expression, e.g. a `.map()`). */
export function elements(source: string, jsx = false): Array<{ el: El; siblings: El[] | null }> {
	if (jsx) return jsxElements(source) as unknown as Array<{ el: El; siblings: El[] | null }>;
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

export const locOf = (source: string, el: El): string => {
	const before = source.slice(0, astroAt(el));
	return `${before.split("\n").length}:${before.length - before.lastIndexOf("\n")}`;
};

export const nameOf = (el: El) => String((el.openingElement.name as { name?: unknown }).name ?? "").toLowerCase();

function find(source: string, loc: string, tag: string | undefined, jsx: boolean) {
	const at = offsetOf(source, loc);
	// An element that opens with an empty child shares its location; the tag tells them apart.
	const hits = elements(source, jsx).filter(({ el }) => astroAt(el) === at);
	const hit = hits.find(({ el }) => !tag || nameOf(el) === tag.toLowerCase()) ?? hits[0];
	if (!hit) throw new ElementEditError("The element is no longer in the file; reload the page");
	return hit;
}

// `>` too: React (esbuild) rejects it in JSX text.
const escapeText = (s: string) =>
	s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\{/g, "&#123;")
		.replace(/\}/g, "&#125;");
// Astro keeps `&amp;` in a quoted attribute as is, so `sm:[&>*]:h-full` would break; a value with `&` or `"` is
// written as a JS string, the same in Astro and JSX.
const attrValue = (s: string) => (/["&]/.test(s) ? `{${JSON.stringify(s)}}` : `"${s}"`);
const JS_STRING = /^\{\s*("(?:[^"\\\n]|\\.)*")\s*\}$/;

/** An attribute's text when it is plain (`"x"`, or `{"x"}` as written above); null when code makes it. */
export function plainValue(source: string, value: { type: string; start: number; end: number }): string | null {
	const text = source.slice(value.start, value.end);
	if (value.type === "Literal") return text.slice(1, -1);
	const m = JS_STRING.exec(text);
	return m ? (JSON.parse(m[1]!) as string) : null;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);
// A quoted string that is not compared with something (`align === "center"`).
const CLASS_LITERAL = /(?<![=!]=\s*)(["'])([^"'\\\n]*)\1(?!\s*[=!]==?)/g;

/**
 * A class list made by code (`cn("flex gap-5", wide && "w-full", className)`), changed from `from` to `to` in its
 * string literals: a removed class leaves every literal it is in, an added one joins the first literal.
 */
export function classInCode(code: string, from: string, to: string): string {
	const before = new Set(words(from));
	const after = words(to);
	const literals = [...code.matchAll(CLASS_LITERAL)];
	if (!literals.length) throw new ElementEditError("This element's class is set by code; edit it in Code view");
	const lists = literals.map((m) => words(m[2]!));
	const changed = new Set<number>();
	for (const gone of [...before].filter((c) => !after.includes(c))) {
		const hits = lists.flatMap((list, i) => (list.includes(gone) ? [i] : []));
		if (!hits.length) throw new ElementEditError(`"${gone}" is added by code here; remove it in Code view`);
		for (const i of hits) {
			lists[i] = lists[i]!.filter((x) => x !== gone);
			changed.add(i);
		}
	}
	const added = after.filter((c) => !before.has(c));
	if (added.length) {
		lists[0]!.push(...added);
		changed.add(0);
	}
	let out = code;
	for (const i of [...changed].toSorted((a, b) => b - a)) {
		const m = literals[i]!;
		out = out.slice(0, m.index) + m[1] + lists[i]!.join(" ") + m[1] + out.slice(m.index + m[0].length);
	}
	return out;
}

/** The element's range, widened to whole lines when it is alone on them. */
function lines(source: string, { start, end }: Span): Span & { own: boolean } {
	const lineStart = source.lastIndexOf("\n", start - 1) + 1;
	const lineEnd = source.indexOf("\n", end) === -1 ? source.length : source.indexOf("\n", end);
	const own = !source.slice(lineStart, start).trim() && !source.slice(end, lineEnd).trim();
	return own ? { start: lineStart, end: lineEnd, own } : { start, end, own };
}

// React spells these attributes differently and takes `style` as an object.
const JSX_NAMES: Record<string, string> = { class: "className", for: "htmlFor" };
const camel = (prop: string) =>
	prop.startsWith("--") ? prop : prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const cssProp = /^-{0,2}[a-zA-Z][\w-]*$/;
export const jsxStyle = (css: string): string =>
	`{{ ${css
		.split(";")
		.filter((d) => d.includes(":"))
		.map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()] as const)
		.filter(([prop, value]) => cssProp.test(prop) && value)
		.map(([prop, value]) => `${JSON.stringify(camel(prop))}: ${JSON.stringify(value)}`)
		.join(", ")} }}`;
const VOID = /<(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)\b([^<>]*?)\s*\/?>/g;
/** Editor markup (HTML) as JSX: React attribute names, style objects, self-closed void tags. */
export const htmlToJsx = (html: string): string =>
	html
		.replace(/ (class|for)="/g, (_, n: string) => ` ${JSX_NAMES[n]}="`)
		.replace(/ style="([^"]*)"/g, (_, css: string) => ` style=${jsxStyle(css.replace(/&quot;/g, '"'))}`)
		.replace(VOID, "<$1$2 />");

const splice = (s: string, start: number, end: number, insert = "") => s.slice(0, start) + insert + s.slice(end);

export function editAstroElement(
	source: string,
	loc: string,
	edit: ElementEdit,
	tag?: string,
	/** A React (`.tsx`/`.jsx`) file: `class`/`for` are written as `className`/`htmlFor`, `style` as an object. */
	jsx = false,
): { source: string; loc?: string; quiet?: boolean } {
	const { el, siblings } = find(source, loc, tag, jsx);
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
		for (const [html, value] of Object.entries(edit.attrs)) {
			const name = jsx ? (JSX_NAMES[html] ?? html) : html;
			const attr = el.openingElement.attributes.find(
				(a) => a.type === "JSXAttribute" && source.slice(a.name!.start, a.name!.end) === name,
			);
			const text =
				value === null
					? ""
					: !value.trim()
						? name
						: jsx && name === "style"
							? `style=${jsxStyle(value)}`
							: `${name}=${attrValue(value.trim())}`;
			// A React style written as plain values (`{{ color: "red" }}`) is rewritten whole; one made by code is not.
			const plainStyle =
				jsx && name === "style" && /^\{\{[^{}`$]*\}\}$/.test(source.slice(attr?.value?.start, attr?.value?.end));
			const before = edit.from?.[html];
			const code = !!attr?.value && plainValue(source, attr.value) === null;
			if (attr?.value && code && /^class(Name)?$/.test(name) && value !== null && before !== undefined) {
				changes.push([
					attr.value.start,
					attr.value.end,
					classInCode(source.slice(attr.value.start, attr.value.end), before, value),
				]);
				continue;
			}
			if (code && !plainStyle)
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
		out = splice(
			source,
			el.end,
			el.end,
			`${range.own ? `\n${indent}` : ""}${jsx ? htmlToJsx(edit.html.trim()) : edit.html.trim()}`,
		);
		start = el.end + (range.own ? 1 + indent.length : 0);
		if (!elements(out, jsx).some(({ el: e }) => e.start === start))
			throw new ElementEditError("The new markup must start with an element");
	} else if (edit.action === "moveTo") {
		if (!siblings?.includes(el)) throw new ElementEditError("This element is made by code; move it in Code view");
		const { el: target, siblings: around } = find(source, edit.loc, edit.tag, jsx);
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
	const after = elements(out, jsx);
	const moved = after.find(({ el: e }) => e.start === start);
	// Text or attributes that leave every other element where it was: the page can show it without a reload.
	let quiet: boolean | undefined;
	if (edit.action === "text" || edit.action === "attrs") {
		const all = elements(source, jsx);
		quiet =
			after.length === all.length &&
			after.every(({ el: e }, i) => all[i]!.el.start === el.start || locOf(out, e) === locOf(source, all[i]!.el));
	}
	return { source: out, loc: moved ? locOf(out, moved.el) : undefined, ...(quiet ? { quiet } : {}) };
}
