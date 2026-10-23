import {
	declarations,
	NODE_KEY,
	nodeClass,
	parseOverrides,
	safeCssValue,
	type NodeJson,
	type Overrides,
	type VisualComponent,
} from "@wuppy/visual-editor";
import { MODULES } from "./modules.ts";
import { createNode, emptyTree, fromJson, type NodeTree, type Styles } from "./tree.ts";

/**
 * Page tree <-> entry body. Each top-level visual block is one line of HTML-like JSX marked `data-ve="<module>"`, so
 * it is valid in both MDX and Markdown bodies and passes the server's MDX rules (no expressions, no imports). Text is
 * written with character references, which both formats decode, so nothing an author types becomes Markdown or JSX.
 * Responsive and state styles travel in `data-ve-r` (JSON) with a `ve-<key>` class; the site turns them into CSS.
 * A Visual Component instance is written out in full (`data-ve="ref"`), so the page renders without the editor.
 * Everything else in the body (hand-written Markdown, components) is kept verbatim as a `markdown` node.
 */

export { safeCssValue };
export const styleString = (styles: Styles): string => declarations(styles);

const TEXT_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"{": "&#123;",
	"}": "&#125;",
	"*": "&#42;",
	_: "&#95;",
	"`": "&#96;",
	"[": "&#91;",
	"]": "&#93;",
	"\\": "&#92;",
	"~": "&#126;",
	"'": "&#39;",
};
const escText = (s: string) =>
	s
		.replace(/[&<>{}*_`[\]\\~]/g, (c) => TEXT_ESCAPES[c]!)
		.replace(/\r?\n/g, "<br />")
		.replace(/^ | $/g, "&#32;");
const escAttr = (s: string) => s.replace(/[&"<>{}]/g, (c) => TEXT_ESCAPES[c] ?? "&quot;").replace(/\r?\n/g, " ");
/** JSON goes in single quotes so it stays readable in Git diffs; MDX decodes the references. */
const escJson = (json: string) => json.replace(/[&'<>]/g, (c) => TEXT_ESCAPES[c]!);

function parseStyle(style: string): Styles {
	const out: Styles = {};
	for (const decl of style.split(";")) {
		const at = decl.indexOf(":");
		const key = decl.slice(0, at).trim().toLowerCase();
		const value = decl.slice(at + 1).trim();
		if (at > 0 && /^-{0,2}[a-z][a-z0-9-]*$/.test(key) && value && safeCssValue(value)) out[key] = value;
	}
	return out;
}

const hash = (s: string) => {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return (h >>> 0).toString(36);
};

export const paramsOf = (props: Record<string, string>): Record<string, string> =>
	Object.fromEntries(
		Object.entries(props)
			.filter(([k]) => k.startsWith("p."))
			.map(([k, v]) => [k.slice(2), v]),
	);

/**
 * A component's nodes for one instance: `{{param}}` replaced in every prop, and stable class keys derived from the
 * component and the node's position, so every page writes the same CSS for the same component node.
 */
export function expandComponent(component: VisualComponent, params: Record<string, string>): NodeJson[] {
	const values = Object.fromEntries(component.params.map((p) => [p.name, params[p.name] ?? p.default]));
	const fill = (s: string) => s.replace(/\{\{\s*([a-zA-Z0-9]+)\s*\}\}/g, (m, name: string) => values[name] ?? m);
	const walk = (n: NodeJson, path: string): NodeJson => ({
		...n,
		props: Object.fromEntries(Object.entries(n.props).map(([k, v]) => [k, fill(v)])),
		key: n.overrides && Object.keys(n.overrides).length ? hash(`${component.id}/${path}`).slice(0, 8) : undefined,
		children: n.children.map((c, i) => walk(c, `${path}.${i}`)),
	});
	return component.nodes.map((n, i) => walk(n, String(i)));
}

/** A tree node as plain data, keeping its class key. */
function viewOf(tree: NodeTree, id: string): NodeJson {
	const n = tree.nodes[id]!;
	return {
		moduleId: n.moduleId,
		props: n.props,
		styles: n.styles,
		overrides: n.overrides,
		key: n.key,
		label: n.label,
		hidden: n.hidden,
		locked: n.locked,
		children: n.children.map((c) => viewOf(tree, c)),
	};
}

type Attr = [string, string | null] | [string, string, "json"];

function element(node: NodeJson, components: VisualComponent[], slot: NodeJson[] = [], depth = 0): string {
	const def = MODULES[node.moduleId] ?? MODULES.markdown!;
	if (node.moduleId === "markdown") return "";
	const children = (list: NodeJson[], fill: NodeJson[] = []) =>
		list.map((c) => element(c, components, fill, depth + 1)).join("");
	if (node.moduleId === "slot") return `<div data-ve="slot" style="display: contents">${children(slot)}</div>`;

	const tag = def.tag(node.props);
	const attrs: Attr[] = [["data-ve", node.moduleId]];
	if (node.moduleId === "component") attrs.push(["data-ve-name", tag]);
	if (node.moduleId === "ref") {
		attrs.push(["data-ve-ref", node.props.ref ?? ""]);
		const params = paramsOf(node.props);
		if (Object.keys(params).length) attrs.push(["data-ve-params", JSON.stringify(params), "json"]);
	}
	if (node.label) attrs.push(["data-ve-label", node.label]);
	if (node.locked) attrs.push(["data-ve-locked", "true"]);
	if (node.hidden) attrs.push(["hidden", null]);
	for (const key of def.attrs ?? []) attrs.push([key, node.props[key] ?? ""]);
	if (node.moduleId === "video") attrs.push(["controls", null]);
	const overrides: Overrides = node.overrides ?? {};
	const responsive = Object.keys(overrides).length > 0 && !!node.key && NODE_KEY.test(node.key);
	const cls = [node.props.class ?? "", responsive ? nodeClass(node.key!) : ""].filter(Boolean).join(" ");
	if (cls) attrs.push(["class", cls]);
	const style = node.moduleId === "ref" ? "display: contents" : styleString(node.styles);
	if (style) attrs.push(["style", style]);
	if (responsive) attrs.push(["data-ve-r", JSON.stringify(overrides), "json"]);
	const open = `<${tag}${attrs
		.map((a) =>
			a[1] === null ? ` ${a[0]}` : a[2] === "json" ? ` ${a[0]}='${escJson(a[1])}'` : ` ${a[0]}="${escAttr(a[1])}"`,
		)
		.join("")}`;
	if (tag === "img" || tag === "hr") return `${open} />`;

	let inner = "";
	if (node.moduleId === "ref") {
		const component = depth < 8 ? components.find((c) => c.id === node.props.ref) : undefined;
		inner = component
			? children(expandComponent(component, paramsOf(node.props)), node.children)
			: `<div data-ve="slot" style="display: contents">${children(node.children)}</div>`;
	} else if (def.container) inner = children(node.children, slot);
	else if (node.moduleId === "list")
		inner = (node.props.items ?? "")
			.split("\n")
			.filter((i) => i.trim())
			.map((i) => `<li>${escText(i)}</li>`)
			.join("");
	else if (def.text) inner = escText(node.props[def.text] ?? "");
	return `${open}>${inner}</${tag}>`;
}

export function serialize(tree: NodeTree, components: VisualComponent[] = []): string {
	const root = tree.nodes[tree.rootNodeId]!;
	const blocks = root.children.map((id) => {
		const node = tree.nodes[id]!;
		return node.moduleId === "markdown" ? (node.props.source ?? "").trim() : element(viewOf(tree, id), components);
	});
	return `${blocks.filter(Boolean).join("\n\n")}\n`;
}

/** Text of an element, with `<br>` back as line breaks. */
function textOf(el: Element): string {
	let out = "";
	for (const child of el.childNodes)
		out += child.nodeName === "BR" ? "\n" : child.nodeType === 1 ? textOf(child as Element) : (child.textContent ?? "");
	return out;
}

/** The slot of a component instance (not one belonging to a component nested inside it). */
const slotOf = (el: Element) =>
	[...el.querySelectorAll('[data-ve="slot"]')].find((s) => s.parentElement?.closest('[data-ve="ref"]') === el);

function fromElement(tree: NodeTree, el: Element, parentId: string): void {
	const moduleId = el.getAttribute("data-ve") ?? "";
	const def = MODULES[moduleId];
	if (!def || moduleId === "body" || moduleId === "markdown" || moduleId === "slot") return;
	const node = createNode(moduleId, {}, moduleId === "ref" ? {} : parseStyle(el.getAttribute("style") ?? ""));
	node.parentId = parentId;
	node.label = el.getAttribute("data-ve-label") ?? undefined;
	node.locked = el.getAttribute("data-ve-locked") === "true" || undefined;
	node.hidden = el.hasAttribute("hidden") || undefined;
	const tag = el.tagName.toLowerCase();
	const classes = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
	const key = classes.find((c) => /^ve-[a-z0-9]{1,16}$/.test(c))?.slice(3);
	const overrides = key ? parseOverrides(el.getAttribute("data-ve-r") ?? "") : null;
	if (key && overrides && Object.keys(overrides).length) {
		node.key = key;
		node.overrides = overrides;
	}
	const cls = classes.filter((c) => c !== `ve-${key}`).join(" ");
	if (cls) node.props.class = cls;
	for (const k of def.attrs ?? []) node.props[k] = el.getAttribute(k) ?? "";
	if (moduleId === "container") node.props.tag = tag;
	if (moduleId === "heading") node.props.level = tag;
	if (moduleId === "component") node.props.name = el.getAttribute("data-ve-name") ?? "";
	if (moduleId === "ref") {
		node.props.ref = el.getAttribute("data-ve-ref") ?? "";
		const params = parseOverrides(`{"p":${el.getAttribute("data-ve-params") || "{}"}}`)?.p ?? {};
		for (const [k, v] of Object.entries(params)) node.props[`p.${k}`] = v;
	}
	if (moduleId === "list") {
		node.props.ordered = tag === "ol" ? "yes" : "no";
		node.props.items = [...el.children].map((li) => textOf(li).replace(/\n/g, " ")).join("\n");
	} else if (def.text) node.props[def.text] = textOf(el);
	tree.nodes[node.id] = node;
	tree.nodes[parentId]!.children.push(node.id);
	const inner = moduleId === "ref" ? slotOf(el) : def.container ? el : undefined;
	for (const child of inner?.children ?? []) fromElement(tree, child, node.id);
}

const VISUAL_LINE = /^<[A-Za-z][\w-]*\s+data-ve="[a-z]+"/;
const PLAIN_HTML_LINE = /^<([A-Za-z][\w-]*)\b[^>]*>.*<\/\1>\s*$/;
const VOID_HTML_LINE = /^<(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b[^>]*>\s*$/i;
/** A single-line authored HTML element is a visual block even without Wuppy's data-ve marker. */
const isVisualLine = (line: string): boolean => {
	const value = line.trim();
	return VISUAL_LINE.test(value) || PLAIN_HTML_LINE.test(value) || VOID_HTML_LINE.test(value);
};

export function parse(body: string): NodeTree {
	const tree = emptyTree();
	const root = tree.nodes[tree.rootNodeId]!;
	let pending: string[] = [];
	const flush = () => {
		const source = pending.join("\n").trim();
		pending = [];
		if (!source) return;
		const node = createNode("markdown", { source });
		node.parentId = root.id;
		tree.nodes[node.id] = node;
		root.children.push(node.id);
	};
	let fence: string | null = null;
	for (const line of body.split(/\r?\n/)) {
		const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
		if (marker && (!fence || marker.startsWith(fence))) fence = fence ? null : marker;
		if (fence || marker || !isVisualLine(line)) {
			pending.push(line);
			continue;
		}
		flush();
		// JSX-authored HTML uses className; the visual model and the site use class.
		const html = line.trim().replace(/(<[a-z][\w-]*\b[^>]*?\s)className=/gi, "$1class=");
		const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, "text/html");
		if (doc.body.querySelector("[data-ve]")) {
			for (const el of doc.body.children) fromElement(tree, el, root.id);
		} else {
			// Authored HTML without Wuppy markers: infer modules from tags so
			// normal Tailwind markup can be previewed and edited as layers.
			for (const json of walkHtml(doc.body)) fromJson(tree, json, root.id);
		}
	}
	flush();
	return tree;
}

const CONTAINERS = new Set(["section", "div", "header", "footer", "article", "aside", "main", "nav"]);
const SKIP = new Set([
	"script",
	"style",
	"iframe",
	"object",
	"embed",
	"form",
	"input",
	"select",
	"textarea",
	"template",
	"noscript",
	"svg",
	"head",
	"meta",
	"link",
]);

const htmlNode = (
	moduleId: string,
	el: Element | null,
	props: Record<string, string> = {},
	children: NodeJson[] = [],
): NodeJson => {
	const cls = el?.getAttribute("class")?.trim();
	return {
		moduleId,
		props: { ...props, ...(cls ? { class: cls } : {}) },
		styles: el ? parseStyle(el.getAttribute("style") ?? "") : {},
		children,
	};
};
const htmlText = (el: Element) =>
	textOf(el)
		.replace(/[ \t]+/g, " ")
		.trim();

function walkHtml(parent: Element): NodeJson[] {
	const out: NodeJson[] = [];
	for (const child of parent.childNodes) {
		if (child.nodeType === 3) {
			const t = (child.textContent ?? "").replace(/\s+/g, " ").trim();
			if (t) out.push(htmlNode("text", null, { text: t }));
			continue;
		}
		if (child.nodeType !== 1) continue;
		const el = child as Element;
		const tag = el.tagName.toLowerCase();
		if (SKIP.has(tag)) continue;
		if (/^h[1-6]$/.test(tag)) out.push(htmlNode("heading", el, { level: tag, text: htmlText(el) }));
		else if (tag === "p") out.push(htmlNode("text", el, { text: htmlText(el) }));
		else if (tag === "a") {
			const button = /\b(btn|button)\b/i.test(el.getAttribute("class") ?? "") || el.getAttribute("role") === "button";
			out.push(htmlNode(button ? "button" : "link", el, { text: htmlText(el), href: el.getAttribute("href") ?? "/" }));
		} else if (tag === "img")
			out.push(htmlNode("image", el, { src: el.getAttribute("src") ?? "", alt: el.getAttribute("alt") ?? "" }));
		else if (tag === "ul" || tag === "ol")
			out.push(
				htmlNode("list", el, {
					ordered: tag === "ol" ? "yes" : "no",
					items: [...el.children].map(htmlText).join("\n"),
				}),
			);
		else if (tag === "video")
			out.push(
				htmlNode("video", el, { src: el.getAttribute("src") ?? el.querySelector("source")?.getAttribute("src") ?? "" }),
			);
		else if (tag === "hr") out.push(htmlNode("divider", el));
		else if (tag === "blockquote") out.push(htmlNode("quote", el, { text: htmlText(el) }));
		else if (tag === "pre") out.push(htmlNode("code", el, { text: el.textContent ?? "" }));
		else if (CONTAINERS.has(tag) || el.children.length) {
			const kids = walkHtml(el);
			if (kids.length) out.push(htmlNode("container", el, { tag: CONTAINERS.has(tag) ? tag : "div" }, kids));
		} else if (htmlText(el)) out.push(htmlNode("text", el, { text: htmlText(el) }));
	}
	return out;
}

/** Pasted or imported HTML as visual nodes (Instatic's HTML import): tags map to the closest module, the rest becomes text. */
export function importHtml(html: string): NodeJson[] {
	const doc = new DOMParser().parseFromString(html, "text/html");
	return walkHtml(doc.body);
}
