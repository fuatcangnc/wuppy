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
} from "@wuppy/visual-editor";
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
import { apiSite } from "../../lib/api.ts";
import { Select } from "../../ui/index.tsx";
import { expandComponent, paramsOf, safeCssValue } from "./mdx.ts";
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

/** Suppress the browser's own drag image so the Instatic-like row is the only ghost. */
export function hideNativeDragImage(event: DragEvent): void {
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	event.dataTransfer?.setDragImage(canvas, 0, 0);
}

/** Top quarter: before, bottom quarter: after, middle: inside (Instatic's drop zones). */
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

/** Design mode zoom and pan (Instatic opens the canvas at 50%). */
export const $zoom = atom(0.5);
export const $pan = atom({ x: 48, y: 64 });
let stageEl: HTMLDivElement | null = null;

export function fitView(): void {
	const v = $visual.get();
	const total = v.baseWidth + v.breakpoints.reduce((sum, b) => sum + b.width + 64, 0);
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

/** The site's own stylesheets (from its home page), so the canvas looks like the site. Local site only. */
let themeHead: Promise<string> | undefined;

/** Drop the cached site CSS so the next canvas fetch sees a fresh Tailwind build. */
export function refreshThemeHead(): void {
	themeHead = undefined;
}

function siteHead(): Promise<string> {
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
						return (
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
					})
					.catch(() => "")
			: Promise.resolve("");
	return themeHead;
}

const CHROME_CSS = `html,body{margin:0}body{min-height:100vh}
[data-node-id]{cursor:default}[data-empty]{min-height:48px;outline:1px dashed #94a3b8;outline-offset:-1px}
[data-ve-hidden]{opacity:.35}[data-editing]{cursor:text;outline:2px solid #f59e0b!important;outline-offset:2px}
[data-ve-instance]{outline:1px dashed #a855f7;outline-offset:-1px}`;

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
			return createElement(
				"div",
				{
					...a,
					style: { ...style, whiteSpace: "pre-wrap", borderLeft: "3px solid #94a3b8", paddingLeft: 8, opacity: 0.8 },
				},
				n.props.source,
			);
		case "component":
			return createElement(
				"div",
				{ ...a, style: { ...style, border: "1px dashed #a855f7", padding: 8, borderRadius: 6 } },
				<small style={{ color: "#a855f7" }}>{`<${n.props.name || "Component"}>`}</small>,
				n.props.text ? <div>{lines(n.props.text)}</div> : null,
			);
		case "slot":
			return createElement("div", { ...a, style: { ...style, display: "contents" } }, children);
	}
	if (def.container) return createElement(def.tag(n.props), a, children);
	return createElement(def.tag(n.props), a, lines(n.props[def.text ?? ""] ?? ""));
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

function NodeView({ tree, id, editing }: { tree: NodeTree; id: string; editing: string | null }): ReactNode {
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
		...(isRoot ? { style: { minHeight: "100vh", display: "flow-root" } } : {}),
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

/** Instatic's selection toolbar: the node's name and quick actions, pinned above the selected element. */
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
 * One page frame: an iframe at a breakpoint's width so the site's media queries apply exactly, with the site theme,
 * the visual CSS and the editor chrome injected (Instatic's frame CSS injection).
 */
function Frame({
	width,
	context,
	fill,
	onKey,
	onWheel,
}: {
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

	const onLoad = async () => {
		const d = frame.current?.contentDocument;
		if (!d) return;
		const theme = await siteHead();
		d.head.innerHTML = `<meta charset="utf-8"><style>${CHROME_CSS}</style>${theme}<span id="ve-fonts" hidden></span><style id="ve-site"></style><style id="ve-nodes"></style><style id="ve-ui"></style>`;
		setBody(d.body);
	};

	const selectedNode = selected && !target ? tree.nodes[selected] : undefined;
	return (
		<>
			<iframe
				ref={frame}
				title={`Page canvas${context ? ` (${context})` : ""}`}
				srcDoc="<!doctype html><html><head></head><body></body></html>"
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
							// Alt/Option climbs the ancestor ladder from the current selection (Instatic's inspect ladder).
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
							if (node && !node.locked && MODULES[node.moduleId]?.text && node.moduleId !== "component") setEditing(id);
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
						<NodeView tree={tree} id={tree.rootNodeId} editing={editing} />
						{active && selectedNode && selectedNode.id !== tree.rootNodeId && !editing && (
							<Toolbar doc={body.ownerDocument} node={selectedNode} scale={scale} />
						)}
					</div>,
					body,
				)}
		</>
	);
}

/** Floating breakpoint/condition switch, matching Instatic's canvas context selector. */
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
 * The canvas. Design mode: every breakpoint side by side on a pannable, zoomable stage (wheel pans, Ctrl+wheel
 * zooms, drag the background to pan). Live mode: one real-size frame for the active breakpoint.
 */
export function Canvas({ onKey, chrome = true }: { onKey: (e: KeyboardEvent) => void; chrome?: boolean }) {
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
					<Frame width={null} context={bp ? bp.id : ""} fill onKey={onKey} />
				</div>
			</div>
		);
	}
	const frames = [
		...visual.breakpoints.toSorted((a, b) => a.width - b.width),
		{ id: "", label: "Desktop", width: visual.baseWidth },
	];
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
								<Frame width={f.width} context={f.id} fill={false} onKey={onKey} onWheel={frameWheel} />
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
