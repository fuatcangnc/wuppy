import { ChevronDown, Monitor, Smartphone, Tablet } from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import {
	declarations,
	fontLinks,
	nodeClass,
	nodeCss,
	overrideKey,
	visualCss,
	type NodeJson,
	type VisualData,
} from "@wuppycms/visual-editor";
import { atom } from "nanostores";
import {
	createElement,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
	type DragEvent,
	type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { apiData, apiSite } from "../../lib/api.ts";
import { Select } from "../../ui/index.tsx";
import { ActionMenu } from "../shared/ActionMenu.tsx";
import { expandComponent, paramsOf, safeCssValue } from "./markdown.ts";
import { MODULES, moduleOf, nodeName } from "./modules.ts";
import {
	$context,
	$dragPreview,
	$hovered,
	$menu,
	$mode,
	$selected,
	$state,
	$target,
	$tree,
	$visual,
	addJson,
	dropNode,
	duplicateSelected,
	editComponent,
	mutate,
	pushRecent,
	removeSelected,
	selectParent,
	$inserter,
} from "./store.ts";
import { $themeDoc, $themeElement, describeElement, flushThemeEdits, liveThemeEdit, SOURCE } from "./theme-element.ts";
import { isAncestor, updateNodeProps, type DropPosition, type NodeTree, type Styles, type VNode } from "./tree.ts";

type DragPreview = { label: string; moduleId: string };

/** What is being dragged: a node already on the page, or new nodes (a module, layout, component, image). */
export type Drag =
	| { kind: "node"; id: string; preview?: DragPreview }
	| { kind: "json"; nodes: NodeJson[]; recent?: string; preview?: DragPreview };
let drag: Drag | null = null;

const previewFor = (value: Drag): DragPreview | null => {
	if (value.preview) return value.preview;
	if (value.kind === "node") {
		const node = $tree.get().nodes[value.id];
		return node ? { label: nodeName(node), moduleId: node.moduleId } : null;
	}
	const moduleId = value.nodes[0]?.moduleId;
	return moduleId ? { label: MODULES[moduleId]?.label ?? "Module", moduleId } : null;
};

/** Start a native drag and, when possible, show the custom row that follows the pointer. */
export function startDrag(value: Drag, at?: { x: number; y: number }): void {
	drag = value;
	const preview = previewFor(value);
	if (preview) $dragPreview.set({ ...preview, x: at?.x ?? 0, y: at?.y ?? 0 });
}

export const endDrag = (): void => {
	drag = null;
	$dragPreview.set(null);
};

export const getDrag = (): Drag | null => drag;

export function moveDragPreview(x: number, y: number): void {
	const preview = $dragPreview.get();
	if (preview) $dragPreview.set({ ...preview, x, y });
}

/** Suppress the browser's own drag image so the custom row is the only ghost. */
export function hideNativeDragImage(event: DragEvent): void {
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	event.dataTransfer?.setDragImage(canvas, 0, 0);
}

/** Top quarter: before, bottom quarter: after, middle: inside (drop zones). */
export function dropPosition(e: DragEvent, el: Element, container: boolean): DropPosition {
	const r = el.getBoundingClientRect();
	const y = (e.clientY - r.top) / Math.max(r.height, 1);
	if (container && y > 0.25 && y < 0.75) return "inside";
	return y < 0.5 ? "before" : "after";
}

export function dropOn(overId: string, position: DropPosition): void {
	if (drag?.kind === "node") dropNode(drag.id, overId, position);
	else if (drag?.kind === "json") {
		addJson(drag.nodes, { overId, position });
		if (drag.recent) pushRecent(drag.recent);
	}
	drag = null;
	$dragPreview.set(null);
}

/** Design mode zoom and pan (the canvas opens at 50%). */
export const $zoom = atom(0.5);
export const $pan = atom({ x: 48, y: 64 });
let stageEl: HTMLDivElement | null = null;

/** The breakpoint whose frame design mode shows: the picked breakpoint, or the base (desktop) for anything else. */
const deviceOf = (v: VisualData, context: string) => (v.breakpoints.some((b) => b.id === context) ? context : "");

export function fitView(): void {
	const v = $visual.get();
	const id = deviceOf(v, $context.get());
	const total = v.breakpoints.find((b) => b.id === id)?.width ?? v.baseWidth;
	const width = stageEl?.clientWidth ?? 1200;
	$zoom.set(Math.min(1, Math.max(0.1, (width - 96) / total)));
	$pan.set({ x: 48, y: 64 });
}

export function zoomBy(factor: number, at?: { x: number; y: number }): void {
	const z = $zoom.get();
	const next = Math.min(2, Math.max(0.1, z * factor));
	const p = $pan.get();
	const c = at ?? { x: (stageEl?.clientWidth ?? 0) / 2, y: (stageEl?.clientHeight ?? 0) / 2 };
	$pan.set({ x: c.x - ((c.x - p.x) * next) / z, y: c.y - ((c.y - p.y) * next) / z });
	$zoom.set(next);
}

/**
 * What the canvas copies from the site's home page so it looks like the site: its stylesheets, the `<html>`/`<body>`
 * attributes (classes, data-theme) and its inline head scripts (dark-mode switches set classes at load). Local site only.
 */
interface SiteHead {
	head: string;
	html: [string, string][];
	body: [string, string][];
	scripts: string[];
}
const NO_HEAD: SiteHead = { head: "", html: [], body: [], scripts: [] };
let themeHead: Promise<SiteHead> | undefined;

/** Drop the cached site CSS so the next canvas fetch sees a fresh Tailwind build. */
export function refreshThemeHead(): void {
	themeHead = undefined;
	previews.clear();
}

const attrsOf = (el: Element): [string, string][] => [...el.attributes].map((a) => [a.name, a.value]);

function siteHead(): Promise<SiteHead> {
	themeHead ??=
		apiSite() === "local"
			? fetch("/", { credentials: "same-origin" })
					.then((r) => (r.ok ? r.text() : ""))
					.then(async (html) => {
						const doc = new DOMParser().parseFromString(html, "text/html");
						const elements = [...doc.head.querySelectorAll('link[rel="stylesheet"], style')].filter(
							(el) =>
								!el.hasAttribute("data-wuppy-visual") &&
								!(el.getAttribute("href") ?? "").includes("/api/public/visual.css"),
						);
						// In Vite dev the HTML <style> can be a stale snapshot; fetch the
						// transformed CSS module directly so Tailwind's newest utilities
						// show up in the canvas after a code save.
						const head = (
							await Promise.all(
								elements.map(async (el) => {
									const id = el instanceof HTMLElement ? el.dataset.viteDevId : undefined;
									if (!id) return el.outerHTML;
									const marker = id.includes("/src/") ? "/src/" : id.includes("/app/") ? "/app/" : null;
									if (!marker) return el.outerHTML;
									try {
										const response = await fetch(`${id.slice(id.indexOf(marker))}?direct`, {
											cache: "no-store",
											credentials: "same-origin",
										});
										if (response.ok) return `<style>${await response.text()}</style>`;
									} catch {
										// Fall through to the inline style from the HTML.
									}
									return el.outerHTML;
								}),
							)
						).join("");
						// Only classic inline scripts: module and src scripts are the dev client and the site's bundles.
						const scripts = [...doc.head.querySelectorAll("script:not([src])")]
							.filter((el) => !["module", "importmap", "application/ld+json"].includes(el.getAttribute("type") ?? ""))
							.map((el) => el.textContent ?? "");
						return { head, html: attrsOf(doc.documentElement), body: attrsOf(doc.body), scripts };
					})
					.catch(() => NO_HEAD)
			: Promise.resolve(NO_HEAD);
	return themeHead;
}

const BLANK_CSS = "html,body{margin:0}body{min-height:100vh}";
const CHROME_CSS = `astro-dev-toolbar{display:none!important}[data-node-id]{cursor:default}[data-empty]{min-height:48px;outline:1px dashed #94a3b8;outline-offset:-1px}
[data-ve-hidden]{opacity:.35}[data-editing]{cursor:text;outline:2px solid #f59e0b!important;outline-offset:2px}
[data-ve-instance]{outline:1px dashed #a855f7;outline-offset:-1px}`;
const THEME_CSS =
	"[data-wuppy-hover]{outline:1px dashed #3b82f6;outline-offset:-1px}[data-wuppy-picked]{outline:2px solid #3b82f6!important;outline-offset:-1px}";

/** The viewport height a design-mode frame lays out with: its iframe is as tall as the whole page. */
export const DEVICE_HEIGHT = 900;
const VIEWPORT_UNIT = /(-?\d*\.?\d+)[dsl]?vh\b/g;

/** "calc(100vh - 5rem)" -> "calc(900px - 5rem)" for a viewport `height` px tall; null when there is no vh unit. */
export function fixedViewport(value: string, height: number): string | null {
	if (!/\d[dsl]?vh\b/.test(value)) return null;
	return value.replace(VIEWPORT_UNIT, (_, n: string) => `${(Number(n) * height) / 100}px`);
}

/**
 * Design mode makes each iframe as tall as its page, so `100vh` there is the page's own height: a `min-h-screen`
 * section then grows the page, which grows the frame, without end. Viewport heights in the frame's CSS are turned
 * into the fixed DEVICE_HEIGHT instead.
 */
function fixDeclaration(s: CSSStyleDeclaration) {
	for (let i = 0; i < s.length; i++) {
		const name = s.item(i);
		const next = fixedViewport(s.getPropertyValue(name), DEVICE_HEIGHT);
		if (next !== null) s.setProperty(name, next, s.getPropertyPriority(name));
	}
}

// The editor's hover/selection outlines (<style id="ve-ui">) change on every hover and hold no vh.
const editorOwn = (r: MutationRecord) =>
	(r.target.nodeType === 1 ? (r.target as Element) : r.target.parentElement)?.id === "ve-ui";

// Rules come from the frame's realm, so `instanceof CSSStyleRule` would be false: check the shape instead.
function fixRules(rules: CSSRuleList) {
	for (const rule of Array.from(rules)) {
		if ("style" in rule) fixDeclaration(rule.style as CSSStyleDeclaration);
		if ("cssRules" in rule) fixRules(rule.cssRules as CSSRuleList);
	}
}

function fixViewportUnits(d: Document) {
	for (const sheet of Array.from(d.styleSheets)) {
		let rules: CSSRuleList;
		try {
			rules = sheet.cssRules;
		} catch {
			continue; // a stylesheet from another origin cannot be read; it is left as it is
		}
		fixRules(rules);
	}
	for (const el of Array.from(d.querySelectorAll<HTMLElement>('[style*="vh"]'))) fixDeclaration(el.style);
}

/** The theme's own markup around the entry's body on a live page: hover, pick, and double-click to edit its text. */
function wireThemeElements(d: Document, root: HTMLElement | null) {
	const theme = (t: EventTarget | null): HTMLElement | null => {
		const node = t as Element | null;
		if (!node?.closest || root?.contains(node)) return null; // the body's blocks are the canvas's own
		return node.closest<HTMLElement>(SOURCE);
	};
	let hover: Element | null = null;
	d.addEventListener("mouseover", (e) => {
		const el = theme(e.target);
		if (el === hover) return;
		hover?.removeAttribute("data-wuppy-hover");
		hover = el;
		el?.setAttribute("data-wuppy-hover", "");
	});
	d.addEventListener(
		"click",
		(e) => {
			const el = theme(e.target);
			if (!el || el.isContentEditable) return;
			e.preventDefault();
			e.stopPropagation(); // the theme's own scripts (menus, search) must not run while picking
			$selected.set(null);
			$target.set(null);
			$themeElement.set(describeElement(el));
		},
		true,
	);
	d.addEventListener(
		"dblclick",
		(e) => {
			const el = theme(e.target);
			if (!el || describeElement(el).text === null) return;
			e.preventDefault();
			e.stopPropagation();
			const before = el.innerText;
			el.contentEditable = "plaintext-only";
			el.focus();
			const key = (k: KeyboardEvent) => {
				if (k.key === "Escape") el.innerText = before;
				if (k.key === "Escape" || (k.key === "Enter" && !k.shiftKey)) {
					k.preventDefault();
					k.stopPropagation();
					el.blur();
				}
			};
			el.addEventListener("keydown", key);
			el.addEventListener(
				"blur",
				() => {
					el.removeEventListener("keydown", key);
					el.removeAttribute("contenteditable");
					if (el.innerText === before) return;
					// Shown here already; copies elsewhere follow, and the file is written without reloading the page.
					liveThemeEdit({ action: "text", value: el.innerText });
					flushThemeEdits();
				},
				{ once: true },
			);
		},
		true,
	);
}

/** CSS for every node with responsive or state styles, including the nodes inside component instances. */
export function nodesCss(tree: NodeTree, visual: VisualData): string {
	const out: string[] = [];
	const json = (n: NodeJson, depth: number) => {
		if (n.key && n.overrides) out.push(nodeCss(n.key, n.overrides, visual));
		if (n.moduleId === "ref" && depth < 8) {
			const c = visual.components.find((x) => x.id === n.props.ref);
			for (const j of c ? expandComponent(c, paramsOf(n.props)) : []) json(j, depth + 1);
		}
		for (const child of n.children) json(child, depth);
	};
	for (const n of Object.values(tree.nodes)) {
		if (n.key && Object.keys(n.overrides).length) out.push(nodeCss(n.key, n.overrides, visual));
		if (n.moduleId !== "ref") continue;
		const c = visual.components.find((x) => x.id === n.props.ref);
		for (const j of c ? expandComponent(c, paramsOf(n.props)) : []) json(j, 1);
	}
	return out.filter(Boolean).join("\n");
}

function reactStyle(styles: Styles): CSSProperties {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(styles))
		if (safeCssValue(v)) out[k.startsWith("--") ? k : k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
	return out;
}

const lines = (text: string): ReactNode[] =>
	text.split("\n").flatMap((line, i) => (i ? [createElement("br", { key: i }), line] : [line]));

/** The editable element is seeded once with this HTML; React must not reconcile children while the author types. */
const editableHtml = (text: string) =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r?\n/g, "<br>");

/** One element of a module, shared by page nodes and the (read-only) nodes inside component instances. */
function renderModule(
	n: { moduleId: string; props: Record<string, string>; styles: Styles },
	attrs: Record<string, unknown>,
	children: ReactNode,
): ReactNode {
	const def = MODULES[n.moduleId] ?? MODULES.markdown!;
	const style = { ...reactStyle(n.styles), ...(attrs.style as CSSProperties | undefined) };
	const a = { ...attrs, style };
	switch (n.moduleId) {
		case "body":
			return createElement("div", a, children);
		case "image":
			return n.props.src
				? createElement("img", { ...a, src: n.props.src, alt: n.props.alt ?? "" })
				: createElement("div", { ...a, "data-empty": "" }, "Image: choose one in Properties or drag from Media");
		case "video":
			return createElement("video", { ...a, src: n.props.src || undefined, controls: true });
		case "divider":
			return createElement("hr", a);
		case "list":
			return createElement(
				def.tag(n.props),
				a,
				(n.props.items ?? "")
					.split("\n")
					.filter((i) => i.trim())
					.map((item, i) => <li key={i}>{item}</li>),
			);
		case "markdown":
			return <MarkdownBlock attrs={a} style={style} source={n.props.source ?? ""} />;
		case "component":
			return (
				<ComponentBlock attrs={a} style={style} name={n.props.name ?? ""}>
					{children}
				</ComponentBlock>
			);
		case "slot":
			return createElement("div", { ...a, style: { ...style, display: "contents" } }, children);
	}
	if (def.container) return createElement(def.tag(n.props), a, children);
	return createElement(def.tag(n.props), a, lines(n.props[def.text ?? ""] ?? ""));
}

const previews = new Map<string, Promise<string | null>>();

/**
 * An Astro component as the site renders it (without props): `/_wuppy/component/<name>` is a page the Wuppy integration
 * generates in the running site. Managed sites and failed renders keep the labelled placeholder.
 */
function ComponentBlock({
	attrs,
	style,
	name,
	children,
}: {
	attrs: Record<string, unknown>;
	style: CSSProperties;
	name: string;
	children: ReactNode;
}) {
	const [html, setHtml] = useState<string | null>(null);
	useEffect(() => {
		if (!name || apiSite() !== "local") return setHtml(null);
		let live = true;
		let job = previews.get(name);
		if (!job) {
			job = fetch(`/_wuppy/component/${encodeURIComponent(name)}`, { credentials: "same-origin" }).then(
				(r) => (r.ok ? r.text() : null),
				() => null,
			);
			previews.set(name, job);
		}
		void job.then((h) => live && setHtml(h));
		return () => {
			live = false;
		};
	}, [name]);
	return createElement(
		"div",
		{
			...attrs,
			"data-astro-component": name,
			style: {
				...style,
				position: "relative",
				// Keeps `position: fixed` parts (a back-to-top button) inside the block instead of the frame's corner.
				transform: "translateZ(0)",
				minHeight: 40,
				outline: "1px dashed #a78bfa",
				outlineOffset: -1,
			},
		},
		createElement(
			"span",
			{
				style: {
					position: "absolute",
					top: 0,
					right: 0,
					zIndex: 1,
					padding: "1px 6px",
					background: "#7c3aed",
					color: "#fff",
					font: "11px ui-sans-serif, system-ui, sans-serif",
					borderBottomLeftRadius: 4,
					pointerEvents: "none",
				},
			},
			`◇ ${name || "Component"}`,
		),
		// The component threw without props (the site renders it as this comment too): say so instead of an empty box.
		html?.includes(`<!-- wuppy: <${name}> could not render -->`)
			? createElement(
					"div",
					{ style: { padding: "12px 16px", color: "#7c3aed", font: "13px ui-sans-serif, system-ui, sans-serif" } },
					`${name} needs props to render. Set them in the Code view; until then the site leaves it out.`,
				)
			: // Theme code's own output, the same HTML the public page shows; scripts in it do not run here.
				html === null
				? null
				: createElement("div", { dangerouslySetInnerHTML: { __html: html } }),
		children,
	);
}

const rendered = new Map<string, Promise<string>>();

/** A Markdown block as the site renders it (the server checks it like a save); the source shows until then or on error. */
function MarkdownBlock({
	attrs,
	style,
	source,
}: {
	attrs: Record<string, unknown>;
	style: CSSProperties;
	source: string;
}) {
	const [html, setHtml] = useState<string | null>(null);
	useEffect(() => {
		let live = true;
		let job = rendered.get(source);
		if (!job) {
			job = apiData<{ html: string }>("POST", "/api/editor/markdown", { source }).then((r) => r.html);
			// A failed render is retried next time instead of being cached.
			job.catch(() => rendered.delete(source));
			rendered.set(source, job);
		}
		job.then(
			(h) => live && setHtml(h),
			() => live && setHtml(null),
		);
		return () => {
			live = false;
		};
	}, [source]);
	if (html === null)
		return createElement("div", { ...attrs, style: { ...style, whiteSpace: "pre-wrap", opacity: 0.6 } }, source);
	return createElement("div", { ...attrs, style, dangerouslySetInnerHTML: { __html: html } });
}

const classOf = (props: Record<string, string>, key?: string, responsive?: boolean) =>
	[props.class ?? "", key && responsive ? nodeClass(key) : ""].filter(Boolean).join(" ") || undefined;

/** A component's markup inside an instance: clicks select the instance; the slot shows the instance's own children. */
function JsonView({
	n,
	refId,
	slot,
	depth,
}: {
	n: NodeJson;
	refId: string;
	slot: ReactNode;
	depth: number;
}): ReactNode {
	const visual = useStore($visual);
	if (n.moduleId === "slot") return renderModule(n, { "data-node-id": refId }, slot);
	if (n.moduleId === "ref") {
		const c = depth < 8 ? visual.components.find((x) => x.id === n.props.ref) : undefined;
		const inner = (c ? expandComponent(c, paramsOf(n.props)) : []).map((j, i) => (
			<JsonView key={i} n={j} refId={refId} slot={null} depth={depth + 1} />
		));
		return createElement("div", { "data-node-id": refId }, inner);
	}
	const kids = n.children.map((c, i) => <JsonView key={i} n={c} refId={refId} slot={slot} depth={depth} />);
	return renderModule(
		n,
		{ "data-node-id": refId, className: classOf(n.props, n.key, !!n.overrides && Object.keys(n.overrides).length > 0) },
		kids,
	);
}

function NodeView({
	tree,
	id,
	editing,
	whole,
}: {
	tree: NodeTree;
	id: string;
	editing: string | null;
	/** The root is the whole page (blank canvas). Inside a live page it must not take the viewport's height: the frame
	 * grows to fit its page, which would grow the root again without end. */
	whole?: boolean;
}): ReactNode {
	const visual = useStore($visual);
	const node = tree.nodes[id];
	if (!node) return null;
	const def = moduleOf(node);
	const isRoot = id === tree.rootNodeId;
	const attrs: Record<string, unknown> = {
		key: id === editing ? `${id}-edit` : id,
		"data-node-id": id,
		className: classOf(node.props, node.key, Object.keys(node.overrides).length > 0),
		draggable: !isRoot && !node.locked && id !== editing,
		...(node.hidden ? { "data-ve-hidden": "" } : {}),
		...(isRoot ? { style: { minHeight: whole ? "100vh" : undefined, display: "flow-root" } } : {}),
	};
	const children = node.children.map((c) => <NodeView key={c} tree={tree} id={c} editing={editing} />);
	if (node.moduleId === "ref") {
		const component = visual.components.find((c) => c.id === node.props.ref);
		return createElement(
			"div",
			{ ...attrs, "data-ve-instance": "" },
			component ? (
				expandComponent(component, paramsOf(node.props)).map((j, i) => (
					<JsonView key={i} n={j} refId={id} slot={children} depth={1} />
				))
			) : (
				<div style={{ padding: 8, color: "#a855f7" }}>Missing component “{node.props.name || node.props.ref}”</div>
			),
		);
	}
	if (id === editing && def.text) {
		// Seed the real element once. Updating its React children on every render would reset the caret/text
		// while the author is typing (the DOM is the source of truth until blur/Enter).
		return createElement(def.tag(node.props), {
			...attrs,
			contentEditable: "plaintext-only",
			suppressContentEditableWarning: true,
			"data-editing": "",
			dangerouslySetInnerHTML: { __html: editableHtml(node.props[def.text] ?? "") },
		});
	}
	if (def.container && !children.length && !isRoot) attrs["data-empty"] = "";
	return renderModule(node, attrs, children);
}

const idAt = (target: EventTarget | null) =>
	(target as Element | null)?.closest?.("[data-node-id]")?.getAttribute("data-node-id") ?? null;

/** Modules whose text is one line: Enter finishes editing (Shift+Enter breaks the line). */
const SINGLE_LINE = new Set(["heading", "button", "link"]);

const TOOLBAR_BUTTON: CSSProperties = {
	all: "unset",
	cursor: "pointer",
	padding: "0 5px",
	lineHeight: "20px",
	fontSize: 12,
	color: "#fff",
};

const stop = (fn: () => void) => (e: { stopPropagation: () => void; preventDefault: () => void }) => {
	e.stopPropagation();
	e.preventDefault();
	fn();
};

/** The selection toolbar: the node's name and quick actions, pinned above the selected element. */
function Toolbar({ doc, node, scale }: { doc: Document; node: VNode; scale: number }) {
	const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
	const tree = useStore($tree);
	useLayoutEffect(() => {
		const el = doc.querySelector(`[data-node-id="${node.id}"]`);
		const r = el?.getBoundingClientRect();
		const win = doc.defaultView;
		if (!r || !win) {
			setPos(null);
			return;
		}
		const above = r.top + win.scrollY - 22 / scale;
		// Near the top of the page there is no room above; put the toolbar just below the element instead of
		// covering it. Otherwise a selected heading near the top cannot be double-clicked for inline editing.
		const top = above >= 0 ? above : r.top + win.scrollY + r.height + 4 / scale;
		setPos({ top, left: r.left + win.scrollX });
	}, [doc, node, tree, scale]);
	if (!pos) return null;
	return (
		<div
			data-ve-toolbar=""
			style={{
				position: "absolute",
				top: pos.top,
				left: pos.left,
				zIndex: 2147483647,
				display: "flex",
				alignItems: "center",
				background: "#3b82f6",
				borderRadius: 4,
				font: "12px system-ui, sans-serif",
				transform: `scale(${1 / scale})`,
				transformOrigin: "0 0",
				whiteSpace: "nowrap",
			}}
			onClick={(e) => e.stopPropagation()}
			onDoubleClick={(e) => e.stopPropagation()}
		>
			<span
				draggable={!node.locked}
				onDragStart={(e) => {
					e.stopPropagation();
					hideNativeDragImage(e);
					startDrag({ kind: "node", id: node.id }, { x: e.clientX, y: e.clientY });
				}}
				title="Drag to move"
				style={{ ...TOOLBAR_BUTTON, cursor: node.locked ? "default" : "grab", fontWeight: 600 }}
			>
				⠿ {nodeName(node)}
			</span>
			<button type="button" title="Select parent" style={TOOLBAR_BUTTON} onClick={stop(selectParent)}>
				↑
			</button>
			<button
				type="button"
				title="Insert after"
				style={TOOLBAR_BUTTON}
				onClick={stop(() => $inserter.set({ at: { overId: node.id, position: "after" } }))}
			>
				+
			</button>
			<button type="button" title="Duplicate (Ctrl+D)" style={TOOLBAR_BUTTON} onClick={stop(duplicateSelected)}>
				⧉
			</button>
			{!node.locked && (
				<button type="button" title="Delete (Del)" style={TOOLBAR_BUTTON} onClick={stop(removeSelected)}>
					✕
				</button>
			)}
		</div>
	);
}

/** Selection, hover and the forced state preview (":hover" styles shown while you edit them) as CSS. */
function uiCss(tree: NodeTree, selected: string | null, hovered: string | null, key: string, active: boolean): string {
	const out: string[] = [];
	if (hovered && hovered !== selected)
		out.push(`[data-node-id="${hovered}"]{outline:1px dashed #ff5c8a!important;outline-offset:-1px}`);
	if (selected) out.push(`[data-node-id="${selected}"]{outline:2px solid #7ddc3f!important;outline-offset:-2px}`);
	const node = selected ? tree.nodes[selected] : undefined;
	if (active && node && key.includes("|:") && node.overrides[key])
		out.push(`[data-node-id="${selected}"]{${declarations(node.overrides[key]!, true)}}`);
	return out.join("\n");
}

/**
 * The live page's entry body (between the `<!--wuppy:body-->` comments the integration puts around `<Content />`)
 * replaced by an empty element the editor renders into, so the blocks sit inside the theme's own layout. Null when the
 * page has no marked body (a page not built from an entry, an unsaved entry, a remote site).
 */
export function liveBodyRoot(d: Document): HTMLElement | null {
	const walker = d.createTreeWalker(d.body, NodeFilter.SHOW_COMMENT);
	let start: Node | null = null;
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		if (!start) {
			if (n.nodeValue === "wuppy:body") start = n;
			continue;
		}
		if (n.nodeValue !== "/wuppy:body") continue;
		if (n.parentNode !== start.parentNode) return null;
		while (start.nextSibling && start.nextSibling !== n) start.nextSibling.remove();
		const root = d.createElement("div");
		root.style.display = "contents";
		n.parentNode?.insertBefore(root, n);
		return root;
	}
	return null;
}

/**
 * One page frame: an iframe at a breakpoint's width so the site's media queries apply exactly, with the site theme,
 * the visual CSS and the editor chrome injected.
 */
function Frame({
	width,
	context,
	fill,
	onKey,
	onWheel,
	page,
	preview,
}: {
	page?: string;
	preview?: boolean;
	width: number | null;
	context: string;
	fill: boolean;
	onKey: (e: KeyboardEvent) => void;
	onWheel?: (e: WheelEvent, frame: DOMRect) => void;
}) {
	const tree = useStore($tree);
	const visual = useStore($visual);
	const selected = useStore($selected);
	const hovered = useStore($hovered);
	const current = useStore($context);
	const state = useStore($state);
	const target = useStore($target);
	const mode = useStore($mode);
	const zoom = useStore($zoom);
	const frame = useRef<HTMLIFrameElement>(null);
	const [body, setBody] = useState<HTMLElement | null>(null);
	const [height, setHeight] = useState(900);
	const [blank, setBlank] = useState(false);
	const [loads, setLoads] = useState(0);
	const picked = useStore($themeElement);
	const live = page && apiSite() === "local" && !blank ? page : undefined;
	const [editing, setEditing] = useState<string | null>(null);
	const original = useRef("");
	const cancelled = useRef(false);
	const active = current === context || (context === "" && !visual.breakpoints.some((b) => b.id === current));
	const scale = mode === "design" ? zoom : 1;

	const doc = body?.ownerDocument;
	const style = (id: string, css: string) => {
		const el = doc?.getElementById(id);
		if (el && el.textContent !== css) el.textContent = css;
	};
	useEffect(() => style("ve-site", visualCss(visual)));
	useEffect(() => style("ve-nodes", nodesCss(tree, visual)));
	useEffect(() => style("ve-ui", uiCss(tree, target ? null : selected, hovered, overrideKey(current, state), active)));
	useEffect(() => {
		const el = doc?.getElementById("ve-fonts");
		const html = fontLinks(visual.framework)
			.map((h) => `<link rel="stylesheet" href="${h.replace(/&/g, "&amp;")}">`)
			.join("");
		if (el && el.innerHTML !== html) el.innerHTML = html;
	});

	useEffect(() => {
		if (!doc) return;
		const wheel = (e: WheelEvent) => {
			if (!onWheel || !frame.current) return;
			e.preventDefault();
			onWheel(e, frame.current.getBoundingClientRect());
		};
		doc.addEventListener("keydown", onKey);
		doc.addEventListener("wheel", wheel, { passive: false });
		return () => {
			doc.removeEventListener("keydown", onKey);
			doc.removeEventListener("wheel", wheel);
		};
	}, [doc, onKey, onWheel]);

	useEffect(() => {
		if (!doc || fill) return;
		let queued = 0;
		const observer = new MutationObserver((records) => {
			if (queued || records.every(editorOwn)) return;
			queued = requestAnimationFrame(() => {
				queued = 0;
				fixViewportUnits(doc);
			});
		});
		observer.observe(doc.documentElement, {
			childList: true,
			subtree: true,
			characterData: true,
			attributeFilter: ["style"],
		});
		fixViewportUnits(doc);
		return () => {
			observer.disconnect();
			cancelAnimationFrame(queued);
		};
	}, [doc, fill]);

	// Design mode shows each frame at its full page height, so the whole page is visible at once.
	useEffect(() => {
		if (!doc || fill) return;
		const measure = () => setHeight(Math.max(600, doc.documentElement.scrollHeight));
		const observer = new ResizeObserver(measure);
		observer.observe(doc.body);
		measure();
		return () => observer.disconnect();
	}, [doc, fill]);

	useEffect(() => {
		const el = editing ? body?.querySelector<HTMLElement>(`[data-node-id="${editing}"]`) : null;
		if (!el) return;
		original.current = el.innerText;
		cancelled.current = false;
		el.focus();
		body?.ownerDocument.getSelection()?.selectAllChildren(el);
		body?.ownerDocument.getSelection()?.collapseToEnd();
	}, [editing, body]);

	const finishEditing = (el: HTMLElement) => {
		const id = editing;
		const node = id ? tree.nodes[id] : undefined;
		setEditing(null);
		const key = node && MODULES[node.moduleId]?.text;
		if (!node || !key || cancelled.current) return; // Escape: the remount puts the old text back
		const text = el.innerText.replace(/\n$/, "");
		if (text !== node.props[key]) mutate((d) => updateNodeProps(d, node.id, { [key]: text }));
	};

	// Outline the picked theme element (every copy, e.g. each item of a list) again after each reload of the page.
	useEffect(() => {
		const d = frame.current?.contentDocument;
		if (!d || !loads) return;
		for (const el of d.querySelectorAll("[data-wuppy-picked]")) el.removeAttribute("data-wuppy-picked");
		for (const el of picked ? d.querySelectorAll(SOURCE) : [])
			if (el.getAttribute("data-wuppy-file") === picked?.file && el.getAttribute("data-wuppy-loc") === picked.loc)
				el.setAttribute("data-wuppy-picked", "");
	}, [picked, loads]);

	const onLoad = async () => {
		const d = frame.current?.contentDocument;
		if (!d) return;
		if (live) {
			const root = liveBodyRoot(d);
			if (!root && !preview) return setBlank(true);
			d.head.insertAdjacentHTML(
				"beforeend",
				`<style>${CHROME_CSS}${THEME_CSS}</style><span id="ve-fonts" hidden></span><style id="ve-site"></style><style id="ve-nodes"></style><style id="ve-ui"></style>`,
			);
			// The theme's own links and forms must not leave the page being edited.
			d.addEventListener(
				"click",
				(e) => (e.target as Element | null)?.closest?.("a[href]") && e.preventDefault(),
				true,
			);
			d.addEventListener("submit", (e) => e.preventDefault(), true);
			wireThemeElements(d, root);
			setLoads((n) => n + 1);
			$themeDoc.set({ doc: d, root, loads: ($themeDoc.get()?.loads ?? 0) + 1 });
			// shortcut: a preview has no editable body, so keys and design-mode height are not wired to it; add if needed.
			if (root) setBody(root);
			return;
		}
		const theme = await siteHead();
		for (const [name, value] of theme.html) d.documentElement.setAttribute(name, value);
		for (const [name, value] of theme.body) d.body.setAttribute(name, value);
		d.head.innerHTML = `<meta charset="utf-8"><style>${BLANK_CSS}${CHROME_CSS}</style>${theme.head}<span id="ve-fonts" hidden></span><style id="ve-site"></style><style id="ve-nodes"></style><style id="ve-ui"></style>`;
		// Run like the site does (same origin, so the visitor's saved light/dark choice applies too).
		for (const code of theme.scripts) {
			const script = d.createElement("script");
			script.textContent = code;
			d.head.append(script);
		}
		setBody(d.body);
	};

	const selectedNode = selected && !target ? tree.nodes[selected] : undefined;
	return (
		<>
			<iframe
				ref={frame}
				key={live ?? "blank"}
				title={`Page canvas${context ? ` (${context})` : ""}`}
				src={live}
				srcDoc={live ? undefined : "<!doctype html><html><head></head><body></body></html>"}
				onLoad={() => void onLoad()}
				className={`block bg-white ${fill ? "h-full" : ""}`}
				style={{ width: width ?? "100%", height: fill ? "100%" : height, maxWidth: fill ? "100%" : undefined }}
			/>
			{body &&
				createPortal(
					<div
						onClick={(e) => {
							e.preventDefault(); // links and buttons on the canvas must not navigate
							if (editing) return;
							$context.set(context);
							const id = idAt(e.target);
							const sel = $selected.get();
							// Alt/Option climbs the ancestor ladder from the current selection (inspect ladder).
							if (e.altKey && id && sel && sel !== tree.rootNodeId && isAncestor(tree, sel, id)) {
								const parent = tree.nodes[sel]?.parentId;
								$selected.set(parent && parent !== tree.rootNodeId ? parent : sel);
							} else $selected.set(id);
							$target.set(null);
						}}
						onDoubleClick={(e) => {
							const id = idAt(e.target);
							const node = id ? tree.nodes[id] : undefined;
							if (node?.moduleId === "ref") return editComponent(node.props.ref ?? "");
							if (node && !node.locked && MODULES[node.moduleId]?.text) setEditing(id);
						}}
						onContextMenu={(e) => {
							const id = idAt(e.target);
							if (!id || !frame.current) return;
							e.preventDefault();
							$selected.set(id);
							const r = frame.current.getBoundingClientRect();
							$menu.set({ x: r.left + e.clientX * scale, y: r.top + e.clientY * scale, id });
						}}
						onBlur={(e) => {
							if ((e.target as Element).hasAttribute?.("data-editing")) finishEditing(e.target as HTMLElement);
						}}
						onKeyDown={(e) => {
							if (!editing) return;
							const node = tree.nodes[editing];
							const commit =
								e.key === "Enter" && (e.metaKey || e.ctrlKey || (!e.shiftKey && SINGLE_LINE.has(node?.moduleId ?? "")));
							if (e.key === "Escape") {
								cancelled.current = true;
								(e.target as HTMLElement).innerText = original.current;
							}
							if (e.key !== "Escape" && !commit) return;
							e.preventDefault();
							e.stopPropagation(); // the edit ends; Escape must not also clear the selection
							(e.target as HTMLElement).blur();
						}}
						onMouseOver={(e) => $hovered.set(idAt(e.target))}
						onMouseLeave={() => $hovered.set(null)}
						onDragStart={(e) => {
							const id = idAt(e.target);
							if (id && !drag) {
								hideNativeDragImage(e);
								const dragged = tree.nodes[id];
								startDrag(
									{
										kind: "node",
										id,
										preview: dragged ? { label: nodeName(dragged), moduleId: dragged.moduleId } : undefined,
									},
									{ x: e.clientX, y: e.clientY },
								);
							}
							e.dataTransfer.effectAllowed = "move";
						}}
						onDragOver={(e) => {
							const id = idAt(e.target);
							if (!id || !drag) return;
							e.preventDefault();
							$hovered.set(id);
						}}
						onDrop={(e) => {
							e.preventDefault();
							const el = (e.target as Element).closest("[data-node-id]");
							const id = el?.getAttribute("data-node-id");
							const node = id ? tree.nodes[id] : undefined;
							if (!el || !node) return;
							const container = MODULES[node.moduleId]?.container === true && node.moduleId !== "ref";
							dropOn(node.id, node.id === tree.rootNodeId ? "inside" : dropPosition(e, el, container));
						}}
						onDragEnd={endDrag}
					>
						<NodeView tree={tree} id={tree.rootNodeId} editing={editing} whole={!live} />
						{active && selectedNode && selectedNode.id !== tree.rootNodeId && !editing && (
							<Toolbar doc={body.ownerDocument} node={selectedNode} scale={scale} />
						)}
					</div>,
					body,
				)}
		</>
	);
}

/** Desktop / tablet / mobile dropdown: the frame the canvas shows and the breakpoint styles are edited for. */
export function DeviceSwitch() {
	const visual = useStore($visual);
	const context = useStore($context);
	const tablet = visual.breakpoints.find((breakpoint) => breakpoint.width >= 600 && breakpoint.width < 1100);
	const phone = visual.breakpoints.find((breakpoint) => breakpoint.width < 600);
	const devices: [string, string, typeof Monitor][] = [["", "Desktop", Monitor]];
	if (tablet) devices.push([tablet.id, "Tablet", Tablet]);
	if (phone) devices.push([phone.id, "Mobile", Smartphone]);
	const shown = deviceOf(visual, context);
	const [, current, Current] = devices.find(([id]) => id === shown) ?? devices[0]!;
	return (
		<ActionMenu
			label={`Device: ${current}`}
			trigger={
				<>
					<Current size={14} />
					<ChevronDown size={12} />
				</>
			}
			items={devices.map(([id, label, Icon]) => ({
				label,
				icon: <Icon size={14} />,
				onSelect: () => {
					$context.set(id);
					fitView();
				},
			}))}
		/>
	);
}

/** Floating breakpoint/condition switch. */
function ContextSelector() {
	const visual = useStore($visual);
	const context = useStore($context);
	return (
		<div className="absolute top-3 right-3 z-20 w-44">
			<Select
				aria-label="Canvas context"
				size="sm"
				value={context}
				onChange={(event) => $context.set(event.target.value)}
			>
				<option value="">Base ({visual.baseWidth}px)</option>
				{visual.breakpoints
					.toSorted((a, b) => b.width - a.width)
					.map((breakpoint) => (
						<option key={breakpoint.id} value={breakpoint.id}>
							{breakpoint.label} (≤{breakpoint.width}px)
						</option>
					))}
				{visual.conditions.map((condition) => (
					<option key={condition.id} value={condition.id}>
						{condition.label}
					</option>
				))}
			</Select>
		</div>
	);
}

/**
 * The canvas. Design mode: the picked device's frame on a pannable, zoomable stage (wheel pans, Ctrl+wheel
 * zooms, drag the background to pan). Live mode: one real-size frame for the active breakpoint.
 */
export function Canvas({
	onKey,
	chrome = true,
	page,
	preview,
}: {
	onKey: (e: KeyboardEvent) => void;
	chrome?: boolean;
	/** The entry's live URL: the canvas edits the entry inside the theme's real page when it can. */
	page?: string;
	/** Without body markers (e.g. a theme `.astro` page whose theme is not running here) show the page as it is. */
	preview?: boolean;
}) {
	const mode = useStore($mode);
	const visual = useStore($visual);
	const context = useStore($context);
	const zoom = useStore($zoom);
	const pan = useStore($pan);
	const stage = useRef<HTMLDivElement>(null);
	const panning = useRef<{ x: number; y: number } | null>(null);

	useEffect(() => {
		stageEl = stage.current;
	}, [mode]);

	const wheel = (deltaX: number, deltaY: number, zoomIt: boolean, clientX: number, clientY: number) => {
		const r = stage.current?.getBoundingClientRect();
		if (!r) return;
		if (zoomIt) zoomBy(Math.exp(-deltaY * 0.002), { x: clientX - r.left, y: clientY - r.top });
		else $pan.set({ x: $pan.get().x - deltaX, y: $pan.get().y - deltaY });
	};
	const frameWheel = (e: WheelEvent, rect: DOMRect) =>
		wheel(
			e.deltaX,
			e.deltaY,
			e.ctrlKey || e.metaKey,
			rect.left + e.clientX * $zoom.get(),
			rect.top + e.clientY * $zoom.get(),
		);

	if (mode === "live") {
		const bp = visual.breakpoints.find((b) => b.id === context);
		return (
			<div className="relative flex min-w-0 flex-1 justify-center overflow-hidden bg-[#2c2c2e] p-3">
				{chrome && <ContextSelector />}
				<div
					className="h-full max-w-full overflow-hidden rounded-md shadow-lg"
					style={{ width: bp ? bp.width : "100%" }}
				>
					<Frame width={null} context={bp ? bp.id : ""} fill onKey={onKey} page={page} preview={preview} />
				</div>
			</div>
		);
	}
	const shown = deviceOf(visual, context);
	const frames = [...visual.breakpoints, { id: "", label: "Desktop", width: visual.baseWidth }].filter(
		(f) => f.id === shown,
	);
	return (
		<div
			ref={stage}
			className="relative min-w-0 flex-1 cursor-grab overflow-hidden bg-[#2c2c2e] active:cursor-grabbing"
			onWheel={(e) => wheel(e.deltaX, e.deltaY, e.ctrlKey || e.metaKey, e.clientX, e.clientY)}
			onPointerDown={(e) => {
				if ((e.target as Element).closest("[data-frame]")) return;
				panning.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
				e.currentTarget.setPointerCapture(e.pointerId);
			}}
			onPointerMove={(e) => {
				if (panning.current) $pan.set({ x: e.clientX - panning.current.x, y: e.clientY - panning.current.y });
			}}
			onPointerUp={() => (panning.current = null)}
		>
			{chrome && <ContextSelector />}
			<div
				className="absolute top-0 left-0 flex items-start gap-16"
				style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
			>
				{frames.map((f) => {
					const active = f.id === context || (f.id === "" && !visual.breakpoints.some((b) => b.id === context));
					return (
						<div key={f.id || "base"} data-frame="" className="cursor-default">
							<button
								type="button"
								onClick={() => $context.set(f.id)}
								className={`mb-3 flex items-baseline gap-2 text-left whitespace-nowrap ${active ? "text-[#7ddc3f]" : "text-[#a1a1aa]"}`}
								style={{ fontSize: 14 / zoom }}
							>
								<span className="font-semibold">{f.label}</span>
								<span>{f.width}px</span>
							</button>
							<div
								className={`rounded-sm ${active ? "ring-blue-500" : "ring-transparent"}`}
								style={{ boxShadow: active ? `0 0 0 ${1 / zoom}px #7ddc3f` : undefined }}
							>
								<Frame
									width={f.width}
									context={f.id}
									fill={false}
									onKey={onKey}
									onWheel={frameWheel}
									page={page}
									preview={preview}
								/>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
