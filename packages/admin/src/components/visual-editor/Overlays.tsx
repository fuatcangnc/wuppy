import {
	ArrowUp,
	Box,
	ChevronRight,
	ClipboardPaste,
	Component,
	Copy,
	CopyPlus,
	Diamond,
	Eye,
	EyeOff,
	Grid2x2,
	Grid2x2Plus,
	History,
	LayoutTemplate,
	Lock,
	LockOpen,
	Maximize,
	Minus,
	Pencil,
	Plus,
	Rows3,
	Scissors,
	Search as SearchIcon,
	Square,
	Star,
	Trash2,
} from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { safeQuery, type NodeJson } from "@wuppy/visual-editor";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiData } from "../../lib/api.ts";
import { Button, Dialog, IconButton, Input, toast } from "../../ui/index.tsx";
import { $zoom, fitView, zoomBy } from "./Canvas.tsx";
import { importHtml } from "./markdown.ts";
import { MODULE_ICONS, MODULES, moduleOf, nodeName, PRESETS, type Category, type Preset } from "./modules.ts";
import {
	$componentNames,
	$editingComponent,
	$favorites,
	$inserter,
	$menu,
	$mode,
	$panel,
	$recents,
	$selected,
	$settings,
	$spotlight,
	$tree,
	$visual,
	addJson,
	addPreset,
	componentize,
	copySelected,
	cutSelected,
	detachSelected,
	duplicateSelected,
	editComponent,
	mutate,
	mutateVisual,
	paste,
	presetJson,
	pushRecent,
	redo,
	removeSelected,
	saveLayout,
	selectParent,
	toggleFavorite,
	undo,
	wrapSelected,
} from "./store.ts";
import { renameNode, toggleNodeHidden, toggleNodeLocked } from "./tree.ts";

/** Everything the inserter offers, under one id scheme so favorites and recents can point at any of them. */
interface Item {
	id: string;
	label: string;
	group: Category | "Layouts" | "Components";
	nodes?: () => NodeJson[];
	moduleId?: string;
	/** Source path of a theme component, used as a hint in the catalog. */
	themePath?: string;
	description?: string;
}

type ThemeFile = { path: string; content: string; size: number };
type ThemeSource = { repo: string; files: ThemeFile[] };
let themeSourcePromise: Promise<ThemeSource | null> | undefined;
const loadThemeSource = (): Promise<ThemeSource | null> => {
	themeSourcePromise ??= apiData<ThemeSource | null>("GET", "/api/themes/files").catch(() => null);
	return themeSourcePromise;
};

const MODULE_DESCRIPTION: Record<string, string> = {
	container: "A semantic container.",
	heading: "A heading for page hierarchy.",
	text: "A semantic text element.",
	button: "A button or call-to-action link.",
	link: "An anchor element.",
	image: "A responsive image.",
	list: "An ordered or unordered list.",
	video: "A responsive video.",
	divider: "A horizontal rule.",
	quote: "A blockquote.",
	code: "A code block.",
	markdown: "Free Markdown source.",
	ref: "A reusable component instance.",
	component: "An Astro component available to MDX.",
};
const GROUP_COLOR: Record<string, string> = {
	Layout: "#8b5cf6",
	Basic: "#60a5fa",
	Media: "#22d3ee",
	Advanced: "#f472b6",
	Layouts: "#2dd4bf",
	Components: "#34d399",
};
const PICKER_SECTIONS = [
	{ id: "modules", label: "Modules", icon: Grid2x2 },
	{ id: "layouts", label: "Layouts", icon: LayoutTemplate },
	{ id: "components", label: "Components", icon: Box },
	{ id: "recent", label: "Recent", icon: History },
] as const;
type PickerSection = (typeof PICKER_SECTIONS)[number]["id"];

function useItems(): Item[] {
	const visual = useStore($visual);
	const componentNames = useStore($componentNames);
	const [themeSource, setThemeSource] = useState<ThemeSource | null>(null);
	useEffect(() => {
		let live = true;
		void loadThemeSource().then((source) => live && setThemeSource(source));
		void apiData<string[]>("GET", "/api/editor/components")
			.then((names) => {
				if (live) $componentNames.set(names);
			})
			.catch(() => undefined);
		return () => {
			live = false;
		};
	}, []);
	return useMemo(() => {
		const presets = PRESETS.map((p): Item => ({
			id: `preset:${p.label}`,
			label: p.label,
			group: p.category ?? "Basic",
			description: MODULE_DESCRIPTION[p.moduleId] ?? "A content block.",
			nodes: () => [presetJson(p)],
		}));
		const layouts = visual.layouts.map((l): Item => ({
			id: `layout:${l.id}`,
			label: l.name,
			group: "Layouts",
			description: "A saved section layout.",
			nodes: () => l.nodes,
		}));
		const comps = visual.components.map((c): Item => ({
			id: `component:${c.id}`,
			label: c.name,
			group: "Components",
			description: "A reusable visual component.",
			nodes: () => [{ moduleId: "ref", props: { ref: c.id, name: c.name }, styles: {}, children: [] }],
		}));
		const astro = componentNames.map((name): Item => {
			const file = themeSource?.files.find(
				(candidate) =>
					candidate.path
						.split("/")
						.pop()
						?.replace(/\.astro$/i, "") === name,
			);
			return {
				id: `astro:${name}`,
				label: name,
				group: "Components",
				moduleId: "component",
				themePath: file?.path,
				description: file ? `Astro component · ${file.path}` : "Astro component available to MDX.",
				nodes: () => [{ moduleId: "component", props: { name, text: "" }, styles: {}, children: [] }],
			};
		});
		return [...presets, ...layouts, ...comps, ...astro];
	}, [componentNames, themeSource, visual.layouts, visual.components]);
}

function insertItem(item: Item): void {
	addJson(item.nodes?.() ?? [], $inserter.get()?.at);
	pushRecent(item.id);
	$inserter.set(null);
}

/** Wireframe thumbnail used by the Instatic-style inserter. */
function Wireframe({ moduleId, className = "" }: { moduleId: string; className?: string }) {
	if (moduleId === "image")
		return (
			<div
				className={`h-full w-full rounded-[3px] bg-[repeating-linear-gradient(135deg,#303034_0,#303034_6px,#3b3b40_6px,#3b3b40_12px)] ${className}`}
			/>
		);
	if (moduleId === "button")
		return (
			<div className={`grid h-full place-items-center ${className}`}>
				<span className="h-2 w-14 rounded-full bg-[#4a4a50]" />
			</div>
		);
	if (moduleId === "divider")
		return (
			<div className={`grid h-full place-items-center ${className}`}>
				<span className="h-px w-20 bg-[#6b7280]" />
			</div>
		);
	if (moduleId === "list")
		return (
			<div className={`grid content-center gap-1.5 px-3 ${className}`}>
				{[0, 1, 2].map((n) => (
					<span key={n} className="flex items-center gap-2">
						<span className="size-1 rounded-full bg-[#71717a]" />
						<span className="h-1 flex-1 rounded bg-[#4a4a50]" />
					</span>
				))}
			</div>
		);
	if (moduleId === "heading")
		return (
			<div className={`grid content-center gap-1.5 px-3 ${className}`}>
				<span className="h-2 w-3/4 rounded bg-[#6b7280]" />
				<span className="h-2 w-1/2 rounded bg-[#4a4a50]" />
			</div>
		);
	if (moduleId === "text" || moduleId === "markdown")
		return (
			<div className={`grid content-center gap-1.5 px-3 ${className}`}>
				{[0, 1, 2].map((n) => (
					<span key={n} className="h-1 rounded bg-[#4a4a50]" style={{ width: `${88 - n * 12}%` }} />
				))}
			</div>
		);
	if (moduleId === "ref" || moduleId === "component")
		return (
			<div className={`grid h-full place-items-center ${className}`}>
				<span className="size-4 rotate-45 rounded-[2px] border border-[#a78bfa]" />
			</div>
		);
	if (moduleId === "container" || moduleId === "body")
		return <div className={`m-2 rounded border border-dashed border-[#4a4a50] ${className}`} />;
	if (moduleId === "layout" || moduleId === "preset")
		return (
			<div className={`grid h-full grid-cols-3 gap-1 p-2 ${className}`}>
				{[0, 1, 2].map((n) => (
					<span key={n} className="rounded-[2px] border border-[#4a4a50]" />
				))}
			</div>
		);
	return (
		<div className={`grid h-full place-items-center ${className}`}>
			<span className="h-2 w-16 rounded bg-[#4a4a50]" />
		</div>
	);
}

const itemModule = (item: Item) => item.moduleId ?? item.nodes?.()[0]?.moduleId ?? "container";

/** Instatic's "Add to canvas": category rail, search, list/grid views, wireframes, favorites and recents. */
export function Inserter() {
	const open = useStore($inserter);
	const favorites = useStore($favorites);
	const recents = useStore($recents);
	const items = useItems();
	const [query, setQuery] = useState("");
	const [section, setSection] = useState<PickerSection>("modules");
	const [view, setView] = useState<"list" | "grid">("list");
	const [preview, setPreview] = useState<string | null>(null);
	const [html, setHtml] = useState<string | null>(null);
	useEffect(() => {
		setQuery("");
		setSection("modules");
		setPreview(null);
		setHtml(null);
	}, [open]);
	const q = query.trim().toLowerCase();
	const byId = new Map(items.map((i) => [i.id, i]));
	const priority = [
		"Container",
		"Text",
		"Image",
		"Button",
		"Link",
		"Heading",
		"List",
		"Quote",
		"Divider",
		"Code",
		"Markdown",
		"Video",
		"Component",
	];
	const modules = items
		.filter((item) => item.group !== "Layouts" && item.group !== "Components")
		.toSorted((a, b) => {
			const ai = priority.indexOf(a.label);
			const bi = priority.indexOf(b.label);
			return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
		});
	const layouts = items.filter((item) => item.group === "Layouts");
	const componentsList = items.filter((item) => item.group === "Components");
	const recent = recents.flatMap((id) => byId.get(id) ?? []).slice(0, 21);
	const source =
		section === "modules"
			? modules
			: section === "layouts"
				? layouts
				: section === "components"
					? componentsList
					: recent;
	const list = q
		? items.filter((item) => item.label.toLowerCase().includes(q) || (item.description ?? "").toLowerCase().includes(q))
		: source;
	const previewItem = byId.get(preview ?? "") ?? list[0] ?? modules[0];
	const counts: Record<PickerSection, number> = {
		modules: modules.length,
		layouts: layouts.length,
		components: componentsList.length,
		recent: recent.length,
	};
	const insert = (item: Item) => {
		insertItem(item);
		setPreview(item.id);
	};
	return (
		<Dialog open={!!open} title="Add to canvas" onClose={() => $inserter.set(null)} size="wide" bare>
			<div className="grid h-[min(82vh,900px)] grid-cols-[250px_minmax(0,1fr)] overflow-hidden bg-[#232325] text-[#e4e4e7]">
				<aside className="flex min-h-0 flex-col border-r border-[#2f2f31] bg-[#1b1b1d] p-3">
					<div className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
						<Grid2x2 size={15} /> Add to canvas
					</div>
					<nav className="grid gap-1" aria-label="Inserter sections">
						{PICKER_SECTIONS.map(({ id, label, icon: Icon }) => (
							<button
								key={id}
								type="button"
								onClick={() => {
									setSection(id);
									setQuery("");
								}}
								className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${section === id ? "bg-[#2d2d31] text-white" : "text-[#b4b4bb] hover:bg-[#252528]"}`}
							>
								<span
									className={`grid size-6 place-items-center rounded-md ${id === "modules" ? "bg-[#3b2d66] text-[#c4b5fd]" : id === "layouts" ? "bg-[#153f44] text-[#67e8f9]" : id === "components" ? "bg-[#174b37] text-[#6ee7b7]" : "bg-[#4b2431] text-[#fda4af]"}`}
								>
									<Icon size={13} />
								</span>
								<span className="flex-1">{label}</span>
								<span className="text-[#71717a]">{counts[id]}</span>
							</button>
						))}
					</nav>
					<div className="mt-auto grid gap-3">
						{previewItem && (
							<div className="rounded-lg bg-[#26262a] p-3 text-xs">
								<p className="mb-1 text-[10px] tracking-wide text-[#71717a] uppercase">
									{previewItem.group === "Components"
										? previewItem.themePath
											? "Theme component"
											: "Component"
										: previewItem.group === "Layouts"
											? "Layout"
											: "Module"}
								</p>
								<p className="flex items-center gap-2 font-medium text-white">
									<span
										className="size-1.5 rounded-full"
										style={{ background: GROUP_COLOR[previewItem.group] ?? "#a1a1aa" }}
									/>
									{previewItem.label}
								</p>
								<p className="mt-1 leading-4 text-[#a1a1aa]">{previewItem.description ?? "A content block."}</p>
							</div>
						)}
						{html !== null && (
							<div className="grid gap-2">
								<textarea
									aria-label="HTML to import"
									rows={4}
									value={html}
									onChange={(event) => setHtml(event.target.value)}
									className="w-full rounded-md border border-[#3f3f42] bg-[#151517] p-2 font-mono text-[11px] outline-none"
									placeholder="<section>…</section>"
								/>
								<Button
									size="sm"
									variant="secondary"
									className="rounded-md border-[#3f3f42] bg-[#2b2b2e] text-[#e4e4e7]"
									onClick={() => {
										const nodes = importHtml(html);
										if (!nodes.length) return toast("Nothing to import", "error");
										addJson(nodes, $inserter.get()?.at);
										$inserter.set(null);
									}}
								>
									Import HTML
								</Button>
							</div>
						)}
						<button
							type="button"
							className="text-left text-[11px] text-[#a1a1aa] hover:text-white"
							onClick={() => setHtml(html === null ? "" : null)}
						>
							{html === null ? "Paste HTML…" : "Close HTML import"}
						</button>
						<div className="grid gap-1 border-t border-[#2f2f31] pt-3 text-[10px] text-[#71717a]">
							<div className="flex gap-1">
								<kbd className="rounded bg-[#2b2b2e] px-1">↑</kbd>
								<kbd className="rounded bg-[#2b2b2e] px-1">↓</kbd>
								<span>navigate</span>
							</div>
							<div className="flex gap-1">
								<kbd className="rounded bg-[#2b2b2e] px-1">←</kbd>
								<kbd className="rounded bg-[#2b2b2e] px-1">→</kbd>
								<span>categories</span>
								<kbd className="ms-2 rounded bg-[#2b2b2e] px-1">↵</kbd>
								<span>add</span>
							</div>
							<div className="flex gap-1">
								<kbd className="rounded bg-[#2b2b2e] px-1">/</kbd>
								<span>search</span>
								<kbd className="ms-2 rounded bg-[#2b2b2e] px-1">drag</kbd>
								<span>to canvas</span>
							</div>
						</div>
					</div>
				</aside>
				<div className="flex min-h-0 flex-col">
					<div className="flex items-center gap-3 border-b border-[#2f2f31] px-5 py-4">
						<div className="relative min-w-0 flex-1">
							<SearchIcon
								size="1em"
								className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#71717a]"
							/>
							<input
								autoFocus
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search every module, layout & component…"
								className="h-9 w-full rounded-md border border-transparent bg-transparent pl-9 pr-16 text-base text-[#e4e4e7] outline-none placeholder:text-[#71717a] focus:border-[#3f3f42]"
							/>
							<kbd className="absolute top-1/2 right-2 -translate-y-1/2 rounded bg-[#303034] px-1.5 py-0.5 text-[10px] text-[#a1a1aa]">
								Esc
							</kbd>
						</div>
					</div>
					<div className="flex items-center gap-2 px-5 py-3">
						<span className="h-5 w-0.5 rounded-full bg-[#a855f7]" />
						<h3 className="text-base font-semibold text-white">
							{q
								? "Search results"
								: section === "modules"
									? "Modules"
									: section === "layouts"
										? "Layouts"
										: section === "components"
											? "Components"
											: "Recent"}
						</h3>
						<span className="text-xs text-[#71717a]">{list.length} items</span>
						<div className="ms-auto flex rounded-md bg-[#2b2b2e] p-0.5">
							<button
								type="button"
								aria-label="List view"
								aria-pressed={view === "list"}
								onClick={() => setView("list")}
								className={`grid size-6 place-items-center rounded ${view === "list" ? "bg-[#3f3f42] text-white" : "text-[#a1a1aa]"}`}
							>
								<Rows3 size={13} />
							</button>
							<button
								type="button"
								aria-label="Grid view"
								aria-pressed={view === "grid"}
								onClick={() => setView("grid")}
								className={`grid size-6 place-items-center rounded ${view === "grid" ? "bg-[#3f3f42] text-white" : "text-[#a1a1aa]"}`}
							>
								<Grid2x2 size={13} />
							</button>
						</div>
					</div>
					<div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-5">
						{list.length === 0 ? (
							<p className="p-6 text-center text-sm text-[#71717a]">Nothing matches “{query}”.</p>
						) : view === "grid" ? (
							<div className="grid grid-cols-3 gap-2">
								{list.map((item) => {
									const mod = itemModule(item);
									const favorite = favorites.includes(item.id);
									return (
										<div
											key={item.id}
											onMouseEnter={() => setPreview(item.id)}
											className="group relative rounded-lg bg-[#2f2f33] p-2"
										>
											<button
												type="button"
												title={item.themePath ? "Add this Astro component to the canvas" : undefined}
												onClick={() => insert(item)}
												className="grid w-full gap-2 text-left"
											>
												<div className="h-[86px] overflow-hidden rounded-md border border-[#3f3f42] bg-[#27272a]">
													<Wireframe moduleId={mod} />
												</div>
												<div className="flex items-center gap-1.5 text-xs">
													<span
														className="size-1.5 rounded-full"
														style={{ background: GROUP_COLOR[item.group] ?? "#a1a1aa" }}
													/>
													<span className="truncate font-medium text-white">{item.label}</span>
													{item.themePath && (
														<span className="rounded bg-[#174b37] px-1 py-0.5 text-[8px] font-semibold tracking-wide text-[#6ee7b7] uppercase">
															Astro
														</span>
													)}
												</div>
												<p className="line-clamp-2 text-[11px] leading-4 text-[#a1a1aa]">{item.description}</p>
											</button>
											<button
												type="button"
												aria-label={favorite ? `Unfavorite ${item.label}` : `Favorite ${item.label}`}
												onClick={() => toggleFavorite(item.id)}
												className={`absolute bottom-2 left-2 grid size-5 place-items-center rounded-full bg-[#18181b]/80 ${favorite ? "text-white" : "text-[#a1a1aa]"}`}
											>
												<Star size={12} fill={favorite ? "currentColor" : "none"} />
											</button>
										</div>
									);
								})}
							</div>
						) : (
							<div className="grid gap-1">
								{list.map((item) => {
									const mod = itemModule(item);
									const favorite = favorites.includes(item.id);
									return (
										<div
											key={item.id}
											onMouseEnter={() => setPreview(item.id)}
											className={`group relative flex items-center gap-3 rounded-lg px-2 py-1.5 ${preview === item.id ? "bg-[#3a3a3f]" : "bg-[#2b2b2f] hover:bg-[#343438]"}`}
										>
											<button
												type="button"
												title={item.themePath ? "Add this Astro component to the canvas" : undefined}
												onClick={() => insert(item)}
												className="flex min-w-0 flex-1 items-center gap-3 text-left"
											>
												<div className="h-10 w-16 shrink-0 overflow-hidden rounded border border-[#3f3f42] bg-[#27272a]">
													<Wireframe moduleId={mod} />
												</div>
												<div className="min-w-0 flex-1">
													<p className="flex items-center gap-1.5 text-sm font-medium text-white">
														<span
															className="size-1.5 rounded-full"
															style={{ background: GROUP_COLOR[item.group] ?? "#a1a1aa" }}
														/>
														{item.label}
														{item.themePath && (
															<span className="rounded bg-[#174b37] px-1 py-0.5 text-[8px] font-semibold tracking-wide text-[#6ee7b7] uppercase">
																Astro
															</span>
														)}
													</p>
													<p className="truncate text-[11px] text-[#a1a1aa]">{item.description}</p>
												</div>
											</button>
											<button
												type="button"
												aria-label={favorite ? `Unfavorite ${item.label}` : `Favorite ${item.label}`}
												onClick={() => toggleFavorite(item.id)}
												className={`grid size-7 place-items-center rounded-full ${favorite ? "bg-white text-[#18181b]" : "text-[#a1a1aa] hover:bg-[#3f3f42] hover:text-white"}`}
											>
												<Star size={14} fill={favorite ? "currentColor" : "none"} />
											</button>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</div>
			</div>
		</Dialog>
	);
}

/** The floating bar over the canvas: favorites, add, Design/Live and zoom (Instatic's canvas notch). */
export function Notch() {
	const mode = useStore($mode);
	const zoom = useStore($zoom);
	const favorites = useStore($favorites);
	const items = useItems();
	const favs = favorites.flatMap((id) => items.find((i) => i.id === id) ?? []).slice(0, 6);
	return (
		<div className="absolute top-14 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[#3f3f42] bg-[#171719]/95 px-2 py-1 shadow-lg">
			{favs.map((item) => (
				<Button
					key={item.id}
					size="sm"
					variant="ghost"
					className="h-7 rounded-full px-2 text-xs"
					onClick={() => insertItem(item)}
				>
					{item.label}
				</Button>
			))}
			<IconButton
				label="Add (A)"
				size="icon-sm"
				className="rounded-full bg-primary text-primary-foreground"
				onClick={() => $inserter.set({})}
			>
				<Plus size={14} />
			</IconButton>
			<span className="mx-1 h-5 w-px bg-border" />
			<div role="group" aria-label="Canvas mode" className="flex rounded-full bg-muted p-0.5 text-xs">
				{(["design", "live"] as const).map((m) => (
					<button
						key={m}
						type="button"
						aria-pressed={mode === m}
						onClick={() => $mode.set(m)}
						className={`rounded-full px-2 py-0.5 capitalize ${mode === m ? "bg-background shadow" : "text-muted-foreground"}`}
					>
						{m}
					</button>
				))}
			</div>
			{mode === "design" && (
				<>
					<span className="mx-1 h-5 w-px bg-border" />
					<IconButton label="Zoom out (Ctrl+-)" size="icon-sm" onClick={() => zoomBy(1 / 1.2)}>
						<Minus size={14} />
					</IconButton>
					<button
						type="button"
						title="Zoom to 100% (Ctrl+0)"
						className="w-10 text-center text-xs tabular-nums"
						onClick={() => zoomBy(1 / zoom)}
					>
						{Math.round(zoom * 100)}%
					</button>
					<IconButton label="Zoom in (Ctrl+=)" size="icon-sm" onClick={() => zoomBy(1.2)}>
						<Plus size={14} />
					</IconButton>
					<IconButton label="Fit (Shift+1)" size="icon-sm" onClick={fitView}>
						<Maximize size={14} />
					</IconButton>
				</>
			)}
		</div>
	);
}

/** Ctrl+K: jump to any layer, or run a command (Instatic's spotlight). */
export function Spotlight() {
	const open = useStore($spotlight);
	const tree = useStore($tree);
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	useEffect(() => {
		setQuery("");
		setActive(0);
	}, [open]);
	const commands: [string, () => void][] = [
		["Add…", () => $inserter.set({})],
		["Undo", undo],
		["Redo", redo],
		["Paste", () => void paste()],
		["Switch to Live mode", () => $mode.set("live")],
		["Switch to Design mode", () => $mode.set("design")],
		["Fit canvas", fitView],
		["Open Framework", () => $panel.set("framework")],
		["Open Selectors", () => $panel.set("selectors")],
		["Open Explorer", () => $panel.set("explorer")],
		["Settings (breakpoints, conditions)", () => $settings.set(true)],
	];
	const q = query.trim().toLowerCase();
	const results: [string, () => void][] = [
		...commands,
		...Object.values(tree.nodes)
			.filter((n) => n.id !== tree.rootNodeId)
			.map((n): [string, () => void] => [`Layer: ${nodeName(n)}`, () => $selected.set(n.id)]),
	]
		.filter(([label]) => !q || label.toLowerCase().includes(q))
		.slice(0, 30);
	const run = (i: number) => {
		results[i]?.[1]();
		$spotlight.set(false);
	};
	return (
		<Dialog open={open} title="Search" onClose={() => $spotlight.set(false)}>
			<Input
				autoFocus
				aria-label="Search layers and commands"
				placeholder="Layers, commands…"
				value={query}
				onChange={(e) => {
					setQuery(e.target.value);
					setActive(0);
				}}
				onKeyDown={(e) => {
					if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
					else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
					else if (e.key === "Enter") run(active);
					else return;
					e.preventDefault();
				}}
			/>
			<ul role="listbox" aria-label="Results" className="mt-2 max-h-80 overflow-y-auto text-sm">
				{results.map(([label], i) => (
					<li key={`${label}${i}`} role="option" aria-selected={i === active}>
						<button
							type="button"
							onMouseEnter={() => setActive(i)}
							onClick={() => run(i)}
							className={`w-full rounded px-2 py-1 text-left ${i === active ? "bg-muted" : ""}`}
						>
							{label}
						</button>
					</li>
				))}
			</ul>
		</Dialog>
	);
}

const SHORTCUTS: [string, string][] = [
	["Ctrl+S", "Save"],
	["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"],
	["Ctrl+C / X / V", "Copy / cut / paste"],
	["Ctrl+D", "Duplicate"],
	["Ctrl+K", "Search"],
	["A", "Add"],
	["Delete", "Delete"],
	["Escape", "Select parent / clear"],
	["Alt+↑ / Alt+↓", "Move up / down"],
	["Ctrl+0 / = / -", "Zoom 100% / in / out"],
	["Shift+1", "Fit canvas"],
	["Enter / Ctrl+Enter", "Finish editing text"],
	["Alt+click", "Select the element behind"],
];

/** Site settings of the editor: base width, breakpoints, conditions, and the shortcut list. */
export function Settings() {
	const open = useStore($settings);
	const visual = useStore($visual);
	const set = (fn: (v: typeof visual) => void, key: string) => mutateVisual(fn, `settings:${key}`);
	return (
		<Dialog
			open={open}
			title="Editor settings"
			description="Saved with the site (Save writes them to Git)."
			onClose={() => $settings.set(false)}
			size="medium"
		>
			<div className="grid gap-4 p-4 text-sm">
				<Input
					label="Base (desktop) width"
					type="number"
					value={visual.baseWidth}
					onChange={(e) => set((v) => void (v.baseWidth = Number(e.target.value) || v.baseWidth), "base")}
				/>
				<section className="grid gap-2">
					<h3 className="font-medium">Breakpoints (max-width, desktop first)</h3>
					{visual.breakpoints.map((b, i) => (
						<div key={i} className="flex items-end gap-2">
							<Input
								label="Id"
								value={b.id}
								onChange={(e) => set((v) => void (v.breakpoints[i]!.id = e.target.value), `bp${i}id`)}
								className="font-mono"
							/>
							<Input
								label="Label"
								value={b.label}
								onChange={(e) => set((v) => void (v.breakpoints[i]!.label = e.target.value), `bp${i}l`)}
							/>
							<Input
								label="Width"
								type="number"
								value={b.width}
								onChange={(e) => set((v) => void (v.breakpoints[i]!.width = Number(e.target.value) || 0), `bp${i}w`)}
							/>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => set((v) => void v.breakpoints.splice(i, 1), `bp${i}del`)}
							>
								Remove
							</Button>
						</div>
					))}
					<Button
						variant="secondary"
						size="sm"
						disabled={visual.breakpoints.length >= 8}
						onClick={() =>
							set(
								(v) => void v.breakpoints.push({ id: `bp-${v.breakpoints.length + 1}`, label: "New", width: 1024 }),
								"bp-add",
							)
						}
					>
						Add breakpoint
					</Button>
				</section>
				<section className="grid gap-2">
					<h3 className="font-medium">Conditions</h3>
					<p className="text-xs text-muted-foreground">
						Any @media, @container or @supports rule, e.g. “@media (prefers-color-scheme: dark)”.
					</p>
					{visual.conditions.map((c, i) => (
						<div key={i} className="flex items-end gap-2">
							<Input
								label="Id"
								value={c.id}
								onChange={(e) => set((v) => void (v.conditions[i]!.id = e.target.value), `c${i}id`)}
								className="font-mono"
							/>
							<Input
								label="Label"
								value={c.label}
								onChange={(e) => set((v) => void (v.conditions[i]!.label = e.target.value), `c${i}l`)}
							/>
							<Input
								label="Query"
								value={c.query}
								error={safeQuery(c.query) ? null : "Not a valid at-rule"}
								onChange={(e) => set((v) => void (v.conditions[i]!.query = e.target.value), `c${i}q`)}
								className="font-mono"
							/>
							<Button variant="ghost" size="sm" onClick={() => set((v) => void v.conditions.splice(i, 1), `c${i}del`)}>
								Remove
							</Button>
						</div>
					))}
					<Button
						variant="secondary"
						size="sm"
						onClick={() =>
							set(
								(v) =>
									void v.conditions.push({
										id: `cond-${v.conditions.length + 1}`,
										label: "Dark scheme",
										query: "@media (prefers-color-scheme: dark)",
									}),
								"c-add",
							)
						}
					>
						Add condition
					</Button>
				</section>
				<section>
					<h3 className="mb-1 font-medium">Keyboard shortcuts</h3>
					<dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
						{SHORTCUTS.map(([k, v]) => (
							<div key={k} className="contents">
								<dt className="font-mono">{k}</dt>
								<dd className="text-muted-foreground">{v}</dd>
							</div>
						))}
					</dl>
				</section>
			</div>
		</Dialog>
	);
}

const ask = (label: string, fallback: string, fn: (name: string) => void) => () => {
	const name = prompt(label, fallback);
	if (name) fn(name);
};

const QUICK_INSERT = [
	"Container",
	"Heading",
	"Text",
	"Button",
	"Image",
	"List",
	"Quote",
	"Divider",
	"Code",
	"Markdown",
] as const;

type MenuIcon = typeof Square;

function MenuItem({
	icon: Icon,
	label,
	onSelect,
	disabled = false,
	danger = false,
	shortcut,
}: {
	icon: MenuIcon;
	label: string;
	onSelect: () => void;
	disabled?: boolean;
	danger?: boolean;
	shortcut?: string;
}) {
	return (
		<button
			type="button"
			role="menuitem"
			disabled={disabled}
			onClick={onSelect}
			className={`flex h-7 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[12px] font-medium outline-none transition-colors focus-visible:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-35 ${
				danger
					? "text-[#f87171] hover:bg-[#f87171]/10 focus-visible:bg-[#f87171]/10"
					: "text-[#d4d4d8] hover:bg-white/[0.07] focus-visible:bg-white/[0.07]"
			}`}
		>
			<span aria-hidden="true" className="grid w-4 shrink-0 place-items-center text-current opacity-80">
				<Icon size={13} />
			</span>
			<span className="flex-1 truncate">{label}</span>
			{shortcut && <kbd className="text-[10px] font-normal text-[#71717a]">{shortcut}</kbd>}
		</button>
	);
}

function MenuSeparator() {
	return <div role="separator" className="mx-2 my-1 h-px bg-[#2f2f31]" />;
}

/** Instatic-style right-click menu for a layer, on the canvas or in Layers. */
export function ContextMenu() {
	const menu = useStore($menu);
	const tree = useStore($tree);
	const editing = useStore($editingComponent);
	const ref = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
	const [sub, setSub] = useState<"insert" | null>(null);
	const [subUp, setSubUp] = useState(false);
	const submenuTrigger = useRef<HTMLButtonElement>(null);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const node = menu ? tree.nodes[menu.id] : undefined;

	useEffect(() => {
		if (!menu) return;
		const close = (event: Event) => {
			if (!ref.current?.contains(event.target as Node)) {
				$menu.set(null);
				setSub(null);
			}
		};
		const key = (event: Event) => {
			if ((event as KeyboardEvent).key !== "Escape") return;
			event.preventDefault();
			if (sub) setSub(null);
			else $menu.set(null);
		};
		// The canvas is an iframe, so listen in its documents too; otherwise a
		// click on the page under an open menu would leave the menu behind.
		const docs = [
			document,
			...[...document.querySelectorAll("iframe")].flatMap((frame) =>
				frame.contentDocument ? [frame.contentDocument] : [],
			),
		];
		for (const doc of docs) {
			doc.addEventListener("pointerdown", close, true);
			doc.addEventListener("keydown", key, true);
		}
		return () => {
			for (const doc of docs) {
				doc.removeEventListener("pointerdown", close, true);
				doc.removeEventListener("keydown", key, true);
			}
		};
	}, [menu, sub]);

	useEffect(() => {
		setSub(null);
		setSubUp(false);
	}, [menu?.id, menu?.x, menu?.y]);

	useLayoutEffect(() => {
		if (!menu || !ref.current) return;
		const rect = ref.current.getBoundingClientRect();
		const x = Math.max(8, Math.min(menu.x, innerWidth - rect.width - 8));
		const y = Math.max(8, Math.min(menu.y, innerHeight - rect.height - 8));
		setPos((prev) => (prev?.x === x && prev.y === y ? prev : { x, y }));
	}, [menu]);

	useEffect(() => {
		if (!menu) return;
		const frame = requestAnimationFrame(() => {
			ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
		});
		return () => cancelAnimationFrame(frame);
	}, [menu]);

	if (!menu || !node) return null;
	const isRoot = node.id === tree.rootNodeId;
	const locked = Boolean(node.locked);
	const markdown = node.moduleId === "markdown";
	const isRef = node.moduleId === "ref";
	const container = isRoot || MODULES[node.moduleId]?.container === true;
	const insertPosition: "inside" | "after" = container && !locked ? "inside" : "after";
	const canPaste = typeof localStorage !== "undefined" && Boolean(localStorage.getItem("wuppy.visual.clipboard"));
	const quick = QUICK_INSERT.map((label) => PRESETS.find((preset) => preset.label === label)).filter(
		(preset): preset is Preset => Boolean(preset),
	);

	const run = (fn: () => void) => () => {
		$menu.set(null);
		setSub(null);
		$selected.set(node.id);
		fn();
	};

	const insertPreset = (preset: Preset) => {
		$menu.set(null);
		setSub(null);
		$selected.set(node.id);
		addPreset(preset, { overId: node.id, position: insertPosition });
	};

	const openInserter = () => {
		const at = { overId: node.id, position: insertPosition };
		$menu.set(null);
		setSub(null);
		$inserter.set({ at });
	};

	const openSubmenu = () => {
		if (closeTimer.current) clearTimeout(closeTimer.current);
		closeTimer.current = null;
		const trigger = submenuTrigger.current;
		if (trigger) setSubUp(trigger.getBoundingClientRect().bottom > innerHeight / 2);
		setSub("insert");
	};
	const scheduleSubmenuClose = () => {
		if (closeTimer.current) clearTimeout(closeTimer.current);
		closeTimer.current = setTimeout(() => {
			setSub(null);
			closeTimer.current = null;
		}, 120);
	};

	const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
		event.preventDefault();
		const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
		const index = items.indexOf(document.activeElement as HTMLElement);
		const next = event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
		items[next]?.focus();
	};

	return createPortal(
		<div
			ref={ref}
			role="menu"
			aria-label={`${nodeName(node)} actions`}
			onKeyDown={onKeyDown}
			onContextMenu={(event) => event.preventDefault()}
			className="fixed z-[1000] w-[236px] rounded-2xl border border-[#343438] bg-[#1b1b1d] p-1 text-[#e4e4e7] shadow-[0_12px_28px_rgba(0,0,0,0.55)]"
			style={{
				left: pos?.x ?? menu.x,
				top: pos?.y ?? menu.y,
				visibility: pos ? "visible" : "hidden",
			}}
		>
			{!isRoot && (
				<>
					<MenuItem
						icon={node.hidden ? Eye : EyeOff}
						label={node.hidden ? "Unhide" : "Hide"}
						onSelect={run(() => mutate((d) => toggleNodeHidden(d, node.id)))}
					/>
					<MenuSeparator />
				</>
			)}
			{!isRoot && (
				<MenuItem
					icon={Pencil}
					label="Rename"
					disabled={locked}
					onSelect={run(() => {
						const name = prompt("Rename layer", nodeName(node));
						if (name?.trim()) mutate((d) => renameNode(d, node.id, name));
					})}
				/>
			)}
			<MenuItem icon={CopyPlus} label="Duplicate" disabled={isRoot || locked} onSelect={run(duplicateSelected)} />
			{isRef ? (
				<>
					<MenuItem
						icon={Component}
						label="Edit component"
						disabled={!!editing}
						onSelect={run(() => editComponent(node.props.ref ?? ""))}
					/>
					<MenuItem icon={Diamond} label="Detach component" onSelect={run(detachSelected)} />
				</>
			) : (
				<MenuItem
					icon={Box}
					label="Componentize…"
					disabled={markdown || !!editing || locked || isRoot}
					onSelect={run(ask("Component name", moduleOf(node).label, componentize))}
				/>
			)}
			<MenuItem
				icon={LayoutTemplate}
				label="Save as layout…"
				disabled={isRoot || markdown || locked}
				onSelect={run(ask("Layout name", nodeName(node), saveLayout))}
			/>
			<MenuSeparator />
			<MenuItem icon={Copy} label="Copy" disabled={isRoot} onSelect={run(() => void copySelected())} />
			<MenuItem icon={Scissors} label="Cut" disabled={isRoot || locked} onSelect={run(cutSelected)} />
			<MenuItem icon={ClipboardPaste} label="Paste after" disabled={!canPaste} onSelect={run(() => void paste())} />
			<MenuSeparator />
			<MenuItem
				icon={Square}
				label="Wrap in container"
				disabled={isRoot || markdown || locked}
				onSelect={run(wrapSelected)}
			/>
			<MenuItem
				icon={ArrowUp}
				label="Select parent"
				disabled={isRoot || !node.parentId || node.parentId === tree.rootNodeId}
				onSelect={run(selectParent)}
			/>
			<div className="relative" onMouseEnter={openSubmenu} onMouseLeave={scheduleSubmenuClose}>
				<button
					ref={submenuTrigger}
					type="button"
					role="menuitem"
					aria-haspopup="menu"
					aria-expanded={sub === "insert"}
					onClick={() => {
						if (sub === "insert") setSub(null);
						else openSubmenu();
					}}
					className="flex h-7 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[12px] font-medium text-[#d4d4d8] outline-none transition-colors hover:bg-white/[0.07] focus-visible:bg-white/[0.07]"
				>
					<span aria-hidden="true" className="grid w-4 shrink-0 place-items-center opacity-80">
						<Grid2x2Plus size={13} />
					</span>
					<span className="flex-1 truncate">Insert module here</span>
					<ChevronRight size={10} className="shrink-0 text-[#71717a]" />
				</button>
				{sub === "insert" && (
					<div
						role="menu"
						aria-label="Insert module here"
						className={`absolute left-[calc(100%+4px)] z-[1001] w-60 rounded-xl border border-[#343438] bg-[#1b1b1d] p-1 shadow-[0_12px_28px_rgba(0,0,0,0.55)] ${subUp ? "bottom-0" : "top-0"}`}
					>
						<p className="px-2 py-1 text-[10px] font-medium tracking-wide text-[#71717a] uppercase">
							{insertPosition === "inside" ? "Inside" : "After"} {nodeName(node)}
						</p>
						<div className="max-h-72 overflow-y-auto">
							{quick.map((preset) => {
								const Icon = MODULE_ICONS[preset.moduleId] ?? Square;
								return (
									<MenuItem key={preset.label} icon={Icon} label={preset.label} onSelect={() => insertPreset(preset)} />
								);
							})}
						</div>
						<MenuSeparator />
						<MenuItem icon={Grid2x2Plus} label="All modules…" onSelect={openInserter} />
					</div>
				)}
			</div>
			<MenuSeparator />
			<MenuItem
				icon={node.locked ? LockOpen : Lock}
				label={node.locked ? "Unlock" : "Lock"}
				disabled={isRoot}
				onSelect={run(() => mutate((d) => toggleNodeLocked(d, node.id)))}
			/>
			<MenuItem icon={Trash2} label="Delete" danger disabled={isRoot || locked} onSelect={run(removeSelected)} />
		</div>,
		document.body,
	);
}

/** Path from the page to the selection; each step selects that ancestor. */
export function Breadcrumbs() {
	const tree = useStore($tree);
	const selected = useStore($selected);
	const path: string[] = [];
	for (let id = selected; id && tree.nodes[id] && id !== tree.rootNodeId; id = tree.nodes[id]!.parentId)
		path.unshift(id);
	return (
		<nav
			aria-label="Breadcrumbs"
			className="flex h-7 shrink-0 items-center gap-1 overflow-x-auto border-t border-border px-3 text-xs text-muted-foreground"
		>
			<button type="button" onClick={() => $selected.set(null)} className="hover:text-foreground">
				Page
			</button>
			{path.map((id) => (
				<span key={id} className="contents">
					<span>›</span>
					<button
						type="button"
						onClick={() => $selected.set(id)}
						className={`whitespace-nowrap hover:text-foreground ${id === selected ? "text-foreground" : ""}`}
					>
						{nodeName(tree.nodes[id]!)}
					</button>
				</span>
			))}
		</nav>
	);
}
