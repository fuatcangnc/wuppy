import {
	ChevronRight,
	Component,
	ExternalLink,
	File,
	FilePlus,
	Grid2x2,
	LayoutTemplate,
	List,
	Lock,
	Pencil,
	Plus,
	RefreshCw,
	Search as SearchIcon,
	Square,
	Trash2,
	Upload,
	EyeOff,
} from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { safeStylesheet } from "@wuppy/visual-editor";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { $entries, $media, loadEntries, loadMedia, uploadImage, type MediaItem } from "../../stores/content.ts";
import { $doc } from "../../stores/editor.ts";
import { Button, IconButton, Input, Tabs, Textarea, toast } from "../../ui/index.tsx";
import { dropOn, endDrag, hideNativeDragImage, moveDragPreview, startDrag } from "./Canvas.tsx";
import { parse } from "./mdx.ts";
import { MODULE_ICONS, MODULES, moduleOf, nodeName } from "./modules.ts";
import {
	$dragPreview,
	$editingComponent,
	$hovered,
	$inserter,
	$menu,
	$selected,
	$target,
	$tree,
	$visual,
	addJson,
	componentize,
	editComponent,
	insertComponent,
	mutate,
	mutateVisual,
	pushRecent,
	saveLayout,
	updateInstances,
} from "./store.ts";
import { renameNode, updateNodeProps, type DropPosition } from "./tree.ts";

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
	return (
		<section className="grid gap-2 border-b border-border p-3">
			<div className="flex items-center justify-between gap-2">
				<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
				{action}
			</div>
			{children}
		</section>
	);
}

/** Instatic's categorical tag colours: deterministic from the first meaningful character of the tag. */
const TAG_ACCENTS: Record<string, string> = {
	a: "#8ee6c8",
	b: "#9bdcff",
	c: "#c8b6ff",
	d: "#ffc7a8",
	e: "#ffb6cd",
	f: "#b8f28b",
	g: "#f7df72",
	h: "#83e7ff",
	i: "#c8b6ff",
	j: "#f0a6ff",
	k: "#ff9f9f",
	l: "#8ee6c8",
	m: "#b8f28b",
	n: "#ffc7a8",
	o: "#9bdcff",
	p: "#c8b6ff",
	q: "#f0a6ff",
	r: "#83e7ff",
	s: "#b8f28b",
	t: "#f7df72",
	u: "#9bdcff",
	v: "#c8b6ff",
	w: "#ffc7a8",
	x: "#8ee6c8",
	y: "#f7df72",
	z: "#9bdcff",
	"0": "#8ee6c8",
	"1": "#c8b6ff",
	"2": "#9bdcff",
	"3": "#ffc7a8",
	"4": "#ffb6cd",
	"5": "#f7df72",
	"6": "#83e7ff",
	"7": "#f0a6ff",
	"8": "#b8f28b",
	"9": "#ff9f9f",
};

const tagAccent = (tag: string): string => TAG_ACCENTS[tag.trim().charAt(0).toLowerCase()] ?? "#8ee6c8";

function LayerTag({ tag }: { tag: string }) {
	const color = tagAccent(tag);
	return (
		<span
			aria-hidden="true"
			className="inline-flex h-[18px] max-w-20 shrink-0 items-center overflow-hidden rounded-[5px] px-1.5 font-mono text-[10px] leading-none font-semibold text-ellipsis whitespace-nowrap"
			style={{ color, backgroundColor: `${color}24` }}
		>
			{tag}
		</span>
	);
}

const subtreeMatches = (tree: ReturnType<typeof $tree.get>, id: string, query: string): boolean => {
	const node = tree.nodes[id];
	if (!node) return false;
	if (nodeName(node).toLowerCase().includes(query)) return true;
	return node.children.some((child) => subtreeMatches(tree, child, query));
};

/** Instatic's tree hit-testing: 8–12px edge band, everything between is "inside" a container. */
function treeDropPosition(event: React.DragEvent, element: Element, container: boolean): DropPosition {
	const rect = element.getBoundingClientRect();
	const y = event.clientY - rect.top;
	// Containers are deliberately forgiving: dropping anywhere on a div row
	// (except its 2px top edge) means "inside". Reordering after a container
	// is done on the next sibling's top edge.
	if (container) return y <= 2 ? "before" : "inside";
	return y < rect.height / 2 ? "before" : "after";
}

/** The Instatic-style row that follows the pointer during a native drag. */
function DragGhost() {
	const preview = useStore($dragPreview);
	useEffect(() => {
		if (!preview) return;
		const move = (event: DragEvent) => moveDragPreview(event.clientX, event.clientY);
		addEventListener("dragover", move);
		return () => removeEventListener("dragover", move);
	}, [!!preview]);
	if (!preview) return null;
	const Icon = MODULE_ICONS[preview.moduleId] ?? Square;
	const left = Math.min(preview.x + 14, innerWidth - 180);
	const top = Math.min(preview.y + 14, innerHeight - 38);
	return createPortal(
		<div
			data-drag-preview=""
			className="pointer-events-none fixed z-[2000] flex h-7 max-w-56 items-center gap-2 rounded-lg border border-[#3f3f42] bg-[#2b2b2e] px-2.5 text-[12px] font-medium text-[#e4e4e7] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
			style={{ left, top }}
		>
			<span aria-hidden="true" className="grid size-3.5 shrink-0 place-items-center text-[#a1a1aa]">
				<Icon size={11} />
			</span>
			<span className="truncate">{preview.label}</span>
		</div>,
		document.body,
	);
}

function LayerRow({
	id,
	depth,
	query,
	collapsed,
	onToggle,
	dropTarget,
	setDropTarget,
}: {
	id: string;
	depth: number;
	query: string;
	collapsed: Set<string>;
	onToggle: (id: string) => void;
	dropTarget: { id: string; position: DropPosition } | null;
	setDropTarget: (target: { id: string; position: DropPosition } | null) => void;
}) {
	const tree = useStore($tree);
	const selected = useStore($selected);
	const hovered = useStore($hovered);
	const [renaming, setRenaming] = useState(false);
	const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (expandTimer.current) clearTimeout(expandTimer.current);
		},
		[],
	);
	const clearExpand = () => {
		if (!expandTimer.current) return;
		clearTimeout(expandTimer.current);
		expandTimer.current = null;
	};
	const node = tree.nodes[id];
	if (!node) return null;
	if (query && !subtreeMatches(tree, id, query)) return null;
	const isRoot = id === tree.rootNodeId;
	const hasChildren = node.children.length > 0;
	const expanded = isRoot || (query ? true : !collapsed.has(id));
	const container = MODULES[node.moduleId]?.container === true;
	const htmlTag = isRoot
		? "body"
		: node.moduleId === "ref" || node.moduleId === "slot"
			? null
			: moduleOf(node).tag(node.props);
	const Icon = MODULE_ICONS[node.moduleId] ?? Square;
	const displayName = isRoot
		? "Page"
		: node.label?.trim() || (node.moduleId === "ref" ? node.props.name || "Component" : moduleOf(node).label);
	const drop = dropTarget?.id === id ? dropTarget.position : undefined;
	return (
		<>
			<div
				role="treeitem"
				aria-selected={id === selected}
				aria-level={depth + 1}
				aria-expanded={hasChildren && !isRoot ? expanded : undefined}
				aria-label={[displayName, htmlTag, node.locked ? "locked" : "", node.hidden ? "hidden" : ""]
					.filter(Boolean)
					.join(", ")}
				data-node-id={id}
				data-module-id={node.moduleId}
				data-html-tag={htmlTag ?? undefined}
				data-drop-position={drop}
				draggable={!isRoot && !node.locked && !renaming}
				onDragStart={(e) => {
					hideNativeDragImage(e);
					startDrag(
						{
							kind: "node",
							id,
							preview: { label: displayName, moduleId: node.moduleId },
						},
						{ x: e.clientX, y: e.clientY },
					);
				}}
				onDrag={(e) => moveDragPreview(e.clientX, e.clientY)}
				onDragEnd={() => {
					clearExpand();
					endDrag();
					setDropTarget(null);
				}}
				onDragLeave={() => {
					clearExpand();
					if (dropTarget?.id === id) setDropTarget(null);
				}}
				onDragOver={(e) => {
					e.preventDefault();
					if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
					const position = isRoot ? "inside" : treeDropPosition(e, e.currentTarget, container);
					setDropTarget(dropTarget?.id === id && dropTarget.position === position ? dropTarget : { id, position });
					// Instatic expands a collapsed container after a short hover so
					// "drop inside" remains usable even when its children are hidden.
					if (position === "inside" && hasChildren && !isRoot && !expanded && !expandTimer.current) {
						expandTimer.current = setTimeout(() => {
							expandTimer.current = null;
							onToggle(id);
						}, 450);
					} else if (position !== "inside") clearExpand();
				}}
				onDrop={(e) => {
					e.preventDefault();
					clearExpand();
					const position = isRoot ? "inside" : treeDropPosition(e, e.currentTarget, container);
					setDropTarget(null);
					dropOn(id, position);
				}}
				onClick={() => {
					$selected.set(id);
					$target.set(null);
					if (hasChildren && !isRoot) onToggle(id);
				}}
				onDoubleClick={() => {
					if (!isRoot && !node.locked) setRenaming(true);
				}}
				onContextMenu={(e) => {
					e.preventDefault();
					e.stopPropagation();
					$selected.set(id);
					$menu.set({ x: e.clientX, y: e.clientY, id });
				}}
				onMouseEnter={() => $hovered.set(id)}
				onMouseLeave={() => $hovered.set(null)}
				className={`group relative flex h-7 items-center gap-1 rounded-lg pr-3 text-xs transition-colors ${
					id === selected
						? "bg-white/[0.07] text-white"
						: id === hovered
							? "bg-white/[0.04] text-[#d4d4d8]"
							: node.locked
								? "text-[#71717a]"
								: "text-[#b4b4bb] hover:bg-white/[0.04]"
				} ${node.hidden ? "opacity-35" : ""}`}
				style={{
					paddingLeft: 8 + depth * 12,
					...(drop === "inside"
						? {
								backgroundColor: "rgba(94, 234, 212, 0.08)",
								outline: "1px solid rgba(94, 234, 212, 0.65)",
								outlineOffset: "-1px",
							}
						: {}),
				}}
			>
				{drop === "before" && (
					<span
						aria-hidden="true"
						className="pointer-events-none absolute top-0 z-10 h-0.5 rounded-full bg-[#5eead4] shadow-[0_0_0_1px_rgba(94,234,212,0.18)]"
						style={{ left: 8 + depth * 12, right: 8 }}
					/>
				)}
				{drop === "after" && (
					<span
						aria-hidden="true"
						className="pointer-events-none absolute bottom-0 z-10 h-0.5 rounded-full bg-[#5eead4] shadow-[0_0_0_1px_rgba(94,234,212,0.18)]"
						style={{ left: 8 + depth * 12, right: 8 }}
					/>
				)}
				<button
					type="button"
					tabIndex={-1}
					aria-label={expanded ? "Collapse" : "Expand"}
					onClick={(e) => {
						e.stopPropagation();
						onToggle(id);
					}}
					className={`grid size-3.5 shrink-0 place-items-center rounded text-[#71717a] hover:text-white ${
						hasChildren && !isRoot ? "" : "invisible"
					}`}
				>
					<ChevronRight size={10} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
				</button>
				<span aria-hidden="true" className="grid size-3.5 shrink-0 place-items-center text-[#71717a]">
					<Icon size={11} />
				</span>
				<span className="flex min-w-0 flex-1 items-baseline gap-1.5">
					{htmlTag && <LayerTag tag={htmlTag} />}
					{renaming ? (
						<input
							autoFocus
							aria-label="Layer name"
							defaultValue={node.label ?? ""}
							placeholder={moduleOf(node).label}
							className="h-[18px] min-w-0 flex-1 rounded border border-[#3f3f42] bg-[#18181b] px-1 text-[11px] text-white outline-none"
							onBlur={(e) => {
								setRenaming(false);
								if ((node.label ?? "") !== e.target.value) mutate((d) => renameNode(d, id, e.target.value));
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
							}}
							onClick={(e) => e.stopPropagation()}
						/>
					) : (
						<span className="min-w-0 truncate text-[12px] font-medium">{displayName}</span>
					)}
				</span>
				{node.hidden && <EyeOff size={12} className="shrink-0 text-[#71717a]" />}
				{node.locked && <Lock size={11} className="shrink-0 text-[#71717a]" />}
			</div>
			{hasChildren &&
				expanded &&
				node.children.map((c) => (
					<LayerRow
						key={c}
						id={c}
						depth={depth + 1}
						query={query}
						collapsed={collapsed}
						onToggle={onToggle}
						dropTarget={dropTarget}
						setDropTarget={setDropTarget}
					/>
				))}
		</>
	);
}

function LayersTab() {
	const tree = useStore($tree);
	const [query, setQuery] = useState("");
	const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
	const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);
	const q = query.trim().toLowerCase();
	useEffect(() => {
		const clear = () => setDropTarget(null);
		addEventListener("dragend", clear);
		addEventListener("drop", clear);
		return () => {
			removeEventListener("dragend", clear);
			removeEventListener("drop", clear);
		};
	}, []);
	const toggle = (id: string) =>
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	return (
		<div className="p-2">
			<div className="mb-2 flex items-center gap-1">
				<Input
					aria-label="Search layers"
					placeholder="Search layers..."
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					className="h-8 text-xs"
				/>
				<IconButton label="Insert module (A)" onClick={() => $inserter.set({})}>
					<Plus size={14} />
				</IconButton>
			</div>
			<div
				role="tree"
				aria-label="Layers"
				className="grid gap-px"
				onDragOver={(event) => {
					moveDragPreview(event.clientX, event.clientY);
					if (!(event.target as Element).closest('[role="treeitem"]')) setDropTarget(null);
				}}
				onDragLeave={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null);
				}}
				onDrop={() => setDropTarget(null)}
			>
				<LayerRow
					id={tree.rootNodeId}
					depth={0}
					query={q}
					collapsed={collapsed}
					onToggle={toggle}
					dropTarget={dropTarget}
					setDropTarget={setDropTarget}
				/>
				{q && !subtreeMatches(tree, tree.rootNodeId, q) && (
					<p className="px-1 py-3 text-xs text-muted-foreground">No matching layers.</p>
				)}
			</div>
			{!q && (
				<p className="mt-2 px-1 text-[10px] leading-4 text-[#71717a]">Double-click to rename. Right-click for more.</p>
			)}
		</div>
	);
}

function ExplorerSection({
	title,
	count,
	action,
	empty = "None yet",
	children,
}: {
	title: string;
	count: number;
	action?: ReactNode;
	empty?: string;
	children: ReactNode;
}) {
	return (
		<section className="grid gap-1">
			<div className="flex h-6 items-center gap-1.5 px-1">
				<h3 className="text-[11px] font-bold tracking-[0.01em] text-[#a1a1aa]">{title}</h3>
				<span className="ml-auto text-[10px] tabular-nums text-[#71717a]">{count}</span>
				{action}
			</div>
			{count === 0 ? (
				<div className="flex h-8 items-center rounded-lg bg-[#1b1b1e] px-3 text-[12px] text-[#5f5f66]">{empty}</div>
			) : (
				<div className="overflow-hidden rounded-lg bg-[#1b1b1e]">{children}</div>
			)}
		</section>
	);
}

function RowButton({
	label,
	onClick,
	disabled,
	children,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			className="grid size-5 place-items-center rounded text-[#71717a] hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-40"
		>
			{children}
		</button>
	);
}

function SiteTab() {
	const doc = useStore($doc);
	const entries = useStore($entries);
	const visual = useStore($visual);
	const editing = useStore($editingComponent);
	const tree = useStore($tree);
	const selected = useStore($selected);
	const [busy, setBusy] = useState(false);
	const collection = doc?.collection ?? "";
	const selectedNode = selected ? tree.nodes[selected] : undefined;
	const layer = selectedNode && selectedNode.id !== tree.rootNodeId ? selectedNode : undefined;
	useEffect(() => {
		if (collection) void loadEntries(collection);
	}, [collection]);
	const pages = (entries[collection] ?? []).slice(0, 100);
	return (
		<div className="grid gap-3 p-2">
			<ExplorerSection
				title="Pages"
				count={pages.length}
				action={
					<Link
						to="/c/$collection"
						params={{ collection }}
						title="Open Pages"
						aria-label="Open Pages"
						className="grid size-5 place-items-center rounded text-[#71717a] hover:bg-white/[0.06] hover:text-white"
					>
						<ExternalLink size={12} />
					</Link>
				}
			>
				<div>
					{pages.map((entry) => {
						const slug = entry.slug === "home" ? "/" : `/${entry.slug}`;
						const active = entry.slug === doc?.slug;
						return (
							<Link
								key={entry.slug}
								to="/v/$collection/$"
								params={{ collection, _splat: entry.slug }}
								className={`flex h-8 items-center gap-2 border-b border-[#252528] px-2.5 last:border-0 hover:bg-[#232327] ${active ? "bg-white/[0.04] text-white" : "text-[#e4e4e7]"}`}
							>
								<File size={13} className="shrink-0 text-[#71717a]" />
								<span className="min-w-0 flex-1 truncate text-[12px] font-medium">
									{String(entry.data.title ?? entry.slug)}
								</span>
								<span className="shrink-0 font-mono text-[10px] text-[#71717a]">{slug}</span>
							</Link>
						);
					})}
				</div>
			</ExplorerSection>

			<ExplorerSection
				title="Templates"
				count={visual.layouts.length}
				action={
					<RowButton
						label="Save selected layer as template"
						onClick={() => {
							if (!layer) return toast("Select a layer first", "error");
							const name = prompt("Template name", nodeName(layer));
							if (name) saveLayout(name);
						}}
					>
						<FilePlus size={12} />
					</RowButton>
				}
			>
				<div>
					{visual.layouts.map((layout) => (
						<div
							key={layout.id}
							draggable
							onDragStart={(e) => {
								hideNativeDragImage(e);
								startDrag(
									{
										kind: "json",
										nodes: layout.nodes,
										recent: `layout:${layout.id}`,
										preview: { label: layout.name, moduleId: "container" },
									},
									{ x: e.clientX, y: e.clientY },
								);
							}}
							onDragEnd={endDrag}
							className="group flex h-8 items-center gap-2 border-b border-[#252528] px-2.5 last:border-0 hover:bg-[#232327]"
						>
							<LayoutTemplate size={13} className="shrink-0 text-[#71717a]" />
							<span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#e4e4e7]">{layout.name}</span>
							<span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
								<RowButton
									label="Insert template"
									onClick={() => {
										addJson(layout.nodes);
										pushRecent(`layout:${layout.id}`);
									}}
								>
									<Plus size={11} />
								</RowButton>
								<RowButton
									label="Delete template"
									onClick={() =>
										mutateVisual((v) => void (v.layouts = v.layouts.filter((item) => item.id !== layout.id)))
									}
								>
									<Trash2 size={11} />
								</RowButton>
							</span>
						</div>
					))}
				</div>
			</ExplorerSection>

			<ExplorerSection
				title="Components"
				count={visual.components.length}
				action={
					<span className="flex items-center gap-0.5">
						<RowButton
							label="Create component from selection"
							disabled={!!editing}
							onClick={() => {
								if (!layer) return toast("Select a layer first", "error");
								const name = prompt("Component name", moduleOf(layer).label);
								if (name) componentize(name);
							}}
						>
							<FilePlus size={12} />
						</RowButton>
						<RowButton
							label="Update pages"
							disabled={busy || !visual.components.length}
							onClick={() => {
								setBusy(true);
								void updateInstances()
									.then(({ updated, failed }) => {
										toast(
											`${updated} page(s) updated${failed.length ? `, ${failed.length} failed` : ""}`,
											failed.length ? "error" : "info",
										);
										for (const failure of failed) console.warn(failure);
									})
									.catch((error: Error) => toast(error.message, "error"))
									.finally(() => setBusy(false));
							}}
						>
							<RefreshCw size={12} className={busy ? "animate-spin" : ""} />
						</RowButton>
					</span>
				}
			>
				<div>
					{visual.components.map((component) => (
						<div
							key={component.id}
							draggable
							onDragStart={(e) => {
								hideNativeDragImage(e);
								startDrag(
									{
										kind: "json",
										nodes: [
											{
												moduleId: "ref",
												props: { ref: component.id, name: component.name },
												styles: {},
												children: [],
											},
										],
										recent: `component:${component.id}`,
										preview: { label: component.name, moduleId: "ref" },
									},
									{ x: e.clientX, y: e.clientY },
								);
							}}
							onDragEnd={endDrag}
							className={`group flex h-8 items-center gap-2 border-b border-[#252528] px-2.5 last:border-0 hover:bg-[#232327] ${editing?.id === component.id ? "bg-white/[0.04]" : ""}`}
						>
							<Component size={13} className="shrink-0 text-[#71717a]" />
							<span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#e4e4e7]">{component.name}</span>
							<span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
								<RowButton label="Insert component" disabled={!!editing} onClick={() => insertComponent(component.id)}>
									<Plus size={11} />
								</RowButton>
								<RowButton label="Edit component" disabled={!!editing} onClick={() => editComponent(component.id)}>
									<Pencil size={11} />
								</RowButton>
								<RowButton
									label="Delete component"
									onClick={() =>
										confirm(`Delete “${component.name}”? Pages keep their current copy until they are edited.`) &&
										mutateVisual((v) => void (v.components = v.components.filter((item) => item.id !== component.id)))
									}
								>
									<Trash2 size={11} />
								</RowButton>
							</span>
						</div>
					))}
				</div>
			</ExplorerSection>
		</div>
	);
}

function CodeTab() {
	const visual = useStore($visual);
	const doc = useStore($doc);
	const editing = useStore($editingComponent);
	const [css, setCss] = useState(visual.stylesheet);
	const [source, setSource] = useState<string | null>(null);
	useEffect(() => setCss(visual.stylesheet), [visual.stylesheet]);
	const bad = !safeStylesheet(css);
	return (
		<div>
			<Section title="Site stylesheet">
				<Textarea
					aria-label="Site stylesheet"
					value={css}
					rows={12}
					spellCheck={false}
					className="font-mono text-xs"
					onChange={(e) => {
						setCss(e.target.value);
						if (safeStylesheet(e.target.value)) mutateVisual((v) => void (v.stylesheet = e.target.value), "stylesheet");
					}}
				/>
				{bad && (
					<p className="text-xs text-destructive">
						Not applied: no @import, url() only to https or /, nothing that closes the style element.
					</p>
				)}
				<p className="text-[11px] text-muted-foreground">Loaded on every page of the site, after the framework.</p>
			</Section>
			{!editing && (
				<Section title="Page source (MDX)">
					<Textarea
						aria-label="Page source"
						value={source ?? doc?.body ?? ""}
						rows={14}
						spellCheck={false}
						className="font-mono text-xs"
						onChange={(e) => setSource(e.target.value)}
					/>
					<Button
						size="sm"
						variant="secondary"
						disabled={source === null}
						onClick={() => {
							const tree = parse(source ?? "");
							mutate((d) => Object.assign(d, tree));
							setSource(null);
						}}
					>
						Apply source
					</Button>
				</Section>
			)}
		</div>
	);
}

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const VIDEO = /\.(mp4|webm|mov|m4v|ogv)$/i;

const image = (url: string, alt = "") => ({
	moduleId: "image",
	props: { src: url, alt },
	styles: { "max-width": "100%", height: "auto" },
	children: [],
});

const video = (url: string) => ({
	moduleId: "video",
	props: { src: url },
	styles: { "max-width": "100%" },
	children: [],
});

const mediaNode = (item: MediaItem, kind: "images" | "videos") =>
	kind === "videos" ? video(item.url) : image(item.url, item.alt ?? "");

const mediaName = (item: MediaItem) => item.name.split("/").pop() || item.name;

const sizeLabel = (bytes: number): string => {
	if (!bytes) return "0 B";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
	return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`;
};

function MediaPreview({
	item,
	kind,
	className = "",
}: {
	item: MediaItem;
	kind: "images" | "videos";
	className?: string;
}) {
	if (kind === "videos")
		return (
			<video src={item.url} muted preload="metadata" aria-label={`${mediaName(item)} preview`} className={className} />
		);
	return <img src={item.url} alt={item.alt ?? ""} className={className} loading="lazy" />;
}

function MediaTab() {
	const media = useStore($media);
	const tree = useStore($tree);
	const selected = useStore($selected);
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<"all" | "images" | "videos">("all");
	const [view, setView] = useState<"list" | "grid">("list");
	const [uploading, setUploading] = useState(false);
	const uploadRef = useRef<HTMLInputElement>(null);
	useEffect(() => void loadMedia(), []);
	const q = query.trim().toLowerCase();
	const matches = (item: MediaItem) =>
		!q || [mediaName(item), item.alt, item.title, item.name].filter(Boolean).join(" ").toLowerCase().includes(q);
	const images = media.filter((item) => IMAGE.test(item.name));
	const videos = media.filter((item) => VIDEO.test(item.name));
	const visibleImages = filter === "videos" ? [] : images.filter(matches);
	const visibleVideos = filter === "images" ? [] : videos.filter(matches);
	const node = selected ? tree.nodes[selected] : undefined;
	const empty = q || filter !== "all" ? "No matching media" : "None yet";
	const upload = async (files: FileList | null) => {
		if (!files?.length) return;
		setUploading(true);
		try {
			for (const file of files) await uploadImage(file);
			await loadMedia();
			toast(`${files.length} media file(s) uploaded`, "info");
		} catch (error) {
			toast((error as Error).message, "error");
		} finally {
			setUploading(false);
			if (uploadRef.current) uploadRef.current.value = "";
		}
	};
	const use = (item: MediaItem, kind: "images" | "videos") => {
		if (kind === "images" && node?.moduleId === "image" && !node.locked)
			return mutate((draft) => updateNodeProps(draft, node.id, { src: item.url, alt: item.alt ?? "" }));
		if (kind === "videos" && node?.moduleId === "video" && !node.locked)
			return mutate((draft) => updateNodeProps(draft, node.id, { src: item.url }));
		addJson([mediaNode(item, kind)]);
	};
	const uploadAction = (
		<RowButton label="Upload media" disabled={uploading} onClick={() => uploadRef.current?.click()}>
			<Upload size={12} />
		</RowButton>
	);
	const renderItem = (item: MediaItem, kind: "images" | "videos") => {
		const dragStart = (event: React.DragEvent) => {
			hideNativeDragImage(event);
			startDrag(
				{
					kind: "json",
					nodes: [mediaNode(item, kind)],
					preview: { label: kind === "videos" ? "Video" : "Image", moduleId: kind === "videos" ? "video" : "image" },
				},
				{ x: event.clientX, y: event.clientY },
			);
		};
		const row = (
			<button
				type="button"
				draggable
				onDragStart={dragStart}
				onDragEnd={endDrag}
				onClick={() => use(item, kind)}
				title={kind === "images" && node?.moduleId === "image" ? "Use for the selected image" : "Insert media"}
				className="group flex h-9 w-full items-center gap-2 border-b border-[#252528] px-2 text-left last:border-0 hover:bg-[#232327]"
			>
				<span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded bg-[#151517] text-[#71717a]">
					<MediaPreview item={item} kind={kind} className="size-full object-cover" />
				</span>
				<span className="grid min-w-0 flex-1 gap-0.5">
					<span className="truncate text-[11px] font-medium text-[#e4e4e7]">{mediaName(item)}</span>
					<span className="truncate text-[9px] text-[#71717a]">{sizeLabel(item.size)}</span>
				</span>
			</button>
		);
		const tile = (
			<button
				type="button"
				draggable
				onDragStart={dragStart}
				onDragEnd={endDrag}
				onClick={() => use(item, kind)}
				title={kind === "images" && node?.moduleId === "image" ? "Use for the selected image" : "Insert media"}
				className="group min-w-0 overflow-hidden rounded-lg bg-[#202024] text-left hover:bg-[#26262a]"
			>
				<span className="block aspect-video w-full overflow-hidden bg-[#151517]">
					<MediaPreview item={item} kind={kind} className="size-full object-cover" />
				</span>
				<span className="grid gap-0.5 p-2">
					<span className="truncate text-[10px] font-medium text-[#e4e4e7]">{mediaName(item)}</span>
					<span className="truncate text-[9px] text-[#71717a]">{sizeLabel(item.size)}</span>
				</span>
			</button>
		);
		return view === "grid" ? tile : row;
	};
	return (
		<div className="grid gap-2 p-2">
			<input
				ref={uploadRef}
				type="file"
				accept="image/*,video/*"
				multiple
				className="hidden"
				onChange={(event) => void upload(event.target.files)}
			/>
			<div className="relative">
				<SearchIcon
					size={13}
					className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[#71717a]"
				/>
				<Input
					aria-label="Search media"
					placeholder="Search media"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					className="h-8 pl-8 text-xs"
				/>
			</div>
			<div className="flex items-center gap-1">
				<div className="flex rounded-lg bg-[#1b1b1e] p-0.5">
					{(["all", "images", "videos"] as const).map((value) => (
						<button
							key={value}
							type="button"
							onClick={() => setFilter(value)}
							className={`h-6 rounded-md px-2 text-[11px] font-medium capitalize ${filter === value ? "bg-[#303034] text-white" : "text-[#a1a1aa] hover:text-white"}`}
						>
							{value === "all" ? "All" : value === "images" ? "Images" : "Videos"}
						</button>
					))}
				</div>
				<div className="ml-auto flex rounded-lg bg-[#1b1b1e] p-0.5" role="group" aria-label="Media view">
					<button
						type="button"
						aria-label="List view"
						aria-pressed={view === "list"}
						onClick={() => setView("list")}
						className={`grid size-6 place-items-center rounded-md ${view === "list" ? "bg-[#303034] text-white" : "text-[#a1a1aa] hover:text-white"}`}
					>
						<List size={12} />
					</button>
					<button
						type="button"
						aria-label="Grid view"
						aria-pressed={view === "grid"}
						onClick={() => setView("grid")}
						className={`grid size-6 place-items-center rounded-md ${view === "grid" ? "bg-[#303034] text-white" : "text-[#a1a1aa] hover:text-white"}`}
					>
						<Grid2x2 size={12} />
					</button>
				</div>
			</div>
			{filter !== "videos" && (
				<ExplorerSection title="Images" count={visibleImages.length} action={uploadAction} empty={empty}>
					{view === "grid" ? (
						<div className="grid grid-cols-2 gap-1.5 p-1.5">
							{visibleImages.map((item) => renderItem(item, "images"))}
						</div>
					) : (
						<div>{visibleImages.map((item) => renderItem(item, "images"))}</div>
					)}
				</ExplorerSection>
			)}
			{filter !== "images" && (
				<ExplorerSection title="Videos" count={visibleVideos.length} action={uploadAction} empty={empty}>
					{view === "grid" ? (
						<div className="grid grid-cols-2 gap-1.5 p-1.5">
							{visibleVideos.map((item) => renderItem(item, "videos"))}
						</div>
					) : (
						<div>{visibleVideos.map((item) => renderItem(item, "videos"))}</div>
					)}
				</ExplorerSection>
			)}
		</div>
	);
}

type Tab = "layers" | "site" | "code" | "media";

/** Instatic's Explorer: Layers, Site (pages, components, layouts), Code and Media. */
export function ExplorerPanel() {
	const [tab, setTab] = useState<Tab>("layers");
	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between border-b border-[#2a2a2d] px-3 py-2">
				<h2 className="text-sm font-semibold">Explorer</h2>
				<span className="text-[10px] text-[#71717a]">{tab}</span>
			</div>
			<div className="border-b border-[#2a2a2d] p-2">
				<Tabs
					value={tab}
					onChange={setTab}
					stretch
					items={[
						{ value: "layers", label: "Layers" },
						{ value: "site", label: "Site" },
						{ value: "code", label: "Code" },
						{ value: "media", label: "Media" },
					]}
				/>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{tab === "layers" ? <LayersTab /> : tab === "site" ? <SiteTab /> : tab === "code" ? <CodeTab /> : <MediaTab />}
			</div>
			<DragGhost />
		</div>
	);
}
