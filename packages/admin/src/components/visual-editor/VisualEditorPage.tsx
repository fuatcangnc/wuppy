import {
	ArrowLeft,
	Code as CodeIcon,
	ExternalLink,
	Eye,
	FolderTree,
	Grid2x2Plus,
	Hash,
	Sparkles,
	Image as ImageIcon,
	Redo2,
	Search,
	Settings as SettingsIcon,
	Settings2,
	Square,
	SwatchBook,
	Text as TextIcon,
	Undo2,
} from "@react-zero-ui/icon-sprite";
import { templateOf, templateUrl } from "../../lib/theme-page.ts";
import { useStore } from "@nanostores/react";
import { Link, useBlocker, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { $collections, loadCollections } from "../../stores/content.ts";
import {
	$dirty,
	$doc,
	$editorError,
	$lockedBy,
	$saving,
	claimLock,
	openEntry,
	releaseLock,
	setField,
} from "../../stores/editor.ts";
import { Button, Dialog, ErrorText, IconButton, toast } from "../../ui/index.tsx";
import { StudioBar } from "../shared/StudioBar.tsx";
import { $zoom, Canvas, fitView, zoomBy } from "./Canvas.tsx";
import { CodeWorkspace } from "./CodeView.tsx";
import { ExplorerPanel } from "./Explorer.tsx";
import { PRESETS } from "./modules.ts";
import { FrameworkPanel } from "./Framework.tsx";
import { Breadcrumbs, ContextMenu, Inserter, Notch, Settings, Spotlight } from "./Overlays.tsx";
import { PropertiesPanel } from "./Properties.tsx";
import { SelectorsPanel } from "./Selectors.tsx";
import { AiPanel } from "./AiPanel.tsx";
import { PageSettings } from "../content/PageSettings.tsx";
import {
	$codeFile,
	$editingComponent,
	$history,
	$inserter,
	$menu,
	$mode,
	$panel,
	$selected,
	$settings,
	$spotlight,
	$target,
	$visual,
	$visualDirty,
	$visualError,
	$visualLoaded,
	copySelected,
	cutSelected,
	duplicateSelected,
	finishComponent,
	load,
	loadVisual,
	addPreset,
	nudgeSelected,
	paste,
	redo,
	removeSelected,
	saveAll,
	selectParent,
	undo,
} from "./store.ts";

const typing = (target: EventTarget | null) => {
	// Events from inside the canvas iframe use that document's Element constructor, so `instanceof Element` is false.
	const element = target as Element | null;
	return (
		!!element &&
		typeof element.closest === "function" &&
		element.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])") !== null
	);
};

const PANELS = [
	["explorer", FolderTree, "Explorer"],
	["framework", SwatchBook, "Framework"],
	["selectors", Hash, "Selectors"],
	["ai", Sparkles, "AI"],
] as const;

const doSave = () =>
	void saveAll().then((ok) => {
		if (!ok && $visualError.get()) toast(`Site styles not saved: ${$visualError.get()}`, "error");
	});

const addQuick = (label: string) => {
	const preset = PRESETS.find((entry) => entry.label === label);
	if (preset) addPreset(preset);
};

/** The editor's single-key and Ctrl shortcuts (Ctrl+S and Ctrl+K work while typing; these do not). */
function shortcut(e: KeyboardEvent, mod: boolean, key: string): (() => void) | undefined {
	if (mod && (key === "y" || (key === "z" && e.shiftKey))) return redo;
	if (mod && key === "z") return undo;
	if (mod && key === "d") return duplicateSelected;
	if (mod && key === "c") return () => void copySelected();
	if (mod && key === "x") return cutSelected;
	if (mod && key === "v") return () => void paste();
	if (mod && key === "0") return () => zoomBy(1 / $zoom.get());
	if (mod && (key === "=" || key === "+")) return () => zoomBy(1.2);
	if (mod && key === "-") return () => zoomBy(1 / 1.2);
	if (e.shiftKey && e.code === "Digit1") return fitView;
	if (e.altKey && key === "arrowup") return () => nudgeSelected(-1);
	if (e.altKey && key === "arrowdown") return () => nudgeSelected(1);
	if (!mod && !e.altKey && key === "a") return () => $inserter.set({});
	if (key === "delete" || key === "backspace") return removeSelected;
}

/** Escape closes the menu, leaves selector mode, then climbs to the parent and finally clears the selection. */
function escape(): void {
	if ($menu.get()) return $menu.set(null);
	if ($target.get()) return $target.set(null);
	const before = $selected.get();
	selectParent();
	if ($selected.get() === before) $selected.set(null);
}

/**
 * Visual editing of an entry's body (wuppy-visual-editor): a panel rail
 * (Explorer, Framework, Selectors) on the left, the multi-breakpoint canvas in the middle, Properties on the right.
 * Page content saves through the same entry API as the classic editor (permissions, MDX rules, plugin hooks, locks and
 * history apply unchanged); site-wide data (framework, selectors, components, layouts) saves to `.wuppy/data/visual.json`.
 */
export function VisualEditorPage() {
	const { collection, _splat } = useParams({ from: "/v/$collection/$" });
	const slug = _splat ?? "";
	const doc = useStore($doc);
	const dirty = useStore($dirty);
	const visualDirty = useStore($visualDirty);
	const visualLoaded = useStore($visualLoaded);
	const visualError = useStore($visualError);
	const saving = useStore($saving);
	const error = useStore($editorError);
	const lockedBy = useStore($lockedBy);
	const history = useStore($history);
	const panel = useStore($panel);
	const editing = useStore($editingComponent);
	const visual = useStore($visual);
	const collections = useStore($collections);
	const info = collections.find((c) => c.name === collection);
	const loaded = doc?.slug === slug && doc.collection === collection;
	const unsaved = dirty || visualDirty || !!editing;
	const [view, setView] = useState<"design" | "code">("design");
	const [pageSettingsOpen, setPageSettingsOpen] = useState(false);
	const [codeDirty, setCodeDirty] = useState(false);
	const codeFile = useStore($codeFile);

	useEffect(() => {
		if (!codeFile) return;
		$mode.set("design");
		setView("code");
	}, [codeFile]);

	useBlocker({
		shouldBlockFn: () =>
			($dirty.get() || $visualDirty.get()) && !confirm("You have unsaved changes. Leave without saving?"),
		enableBeforeUnload: () => $dirty.get() || $visualDirty.get(),
		disabled: !unsaved,
	});

	useEffect(() => {
		void loadCollections();
		void loadVisual();
	}, []);
	useEffect(() => {
		const d = $doc.get();
		if (!(d && d.collection === collection && d.slug === slug)) void openEntry(collection, slug);
	}, [collection, slug]);
	// Built from the body once per entry (it may hold unsaved edits from the classic editor).
	useEffect(() => {
		if (loaded) load($doc.get()!.body);
	}, [loaded, collection, slug]);
	useEffect(() => {
		if (!loaded) return;
		void claimLock();
		const beat = setInterval(() => void claimLock(), 20_000);
		return () => {
			clearInterval(beat);
			void releaseLock(collection, slug);
		};
	}, [loaded, collection, slug]);

	const onKey = useCallback(
		(e: KeyboardEvent) => {
			const mod = e.metaKey || e.ctrlKey;
			const key = e.key.toLowerCase();
			if (view === "code") {
				// The code editor owns Ctrl/Cmd+S while it has focus; don't let the
				// visual-editor shortcut save the design tree underneath it.
				if (typing(e.target)) return;
				if (mod && key === "s") return;
				return;
			}
			if (mod && (key === "s" || key === "k")) {
				e.preventDefault();
				if (key === "s") doSave();
				else $spotlight.set(true);
				return;
			}
			if (typing(e.target) || $inserter.get() || $spotlight.get() || $settings.get()) return;
			if (key === "escape") return escape();
			const action = shortcut(e, mod, key);
			if (!action) return;
			e.preventDefault();
			action();
		},
		[view],
	);
	useEffect(() => {
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onKey]);

	if (!loaded || !visualLoaded)
		return error ? <ErrorText>{error}</ErrorText> : <p className="text-muted-foreground">Loading…</p>;
	const component = editing && visual.components.find((c) => c.id === editing.id);
	const template = doc ? templateOf(doc.data) : undefined;
	const livePath = template ? templateUrl(template) : (info?.route ?? `/${collection}/{slug}`).replace("{slug}", slug);
	const kind = info?.kind ?? (collection === "pages" ? "pages" : collection === "posts" ? "posts" : undefined);
	const toggleCode = () => {
		if (view === "code" && codeDirty && !confirm("Discard unsaved code changes?")) return;
		$mode.set("design");
		setView((current) => (current === "code" ? "design" : "code"));
	};

	return (
		<div className="dark fixed inset-0 z-40 flex flex-col bg-[#1d1d1f] text-[#f4f4f5]">
			<StudioBar active="site" />

			{(error || visualError) && (
				<div className="border-b border-border px-3 py-1">
					<ErrorText>{error ?? `Site styles: ${visualError}`}</ErrorText>
				</div>
			)}
			{component && (
				<div className="flex items-center gap-2 border-b border-purple-500/40 bg-purple-500/15 px-3 py-1 text-sm">
					<span>
						Editing component <strong>{component.name}</strong>. Changes apply to every instance; use “Update pages” in
						Explorer › Site to write them into other pages.
					</span>
					<Button size="sm" className="ml-auto" onClick={finishComponent}>
						Done
					</Button>
				</div>
			)}
			{view === "code" ? (
				<CodeWorkspace onExit={toggleCode} onDirtyChange={setCodeDirty} />
			) : (
				<div className="flex min-h-0 flex-1">
					<nav
						aria-label="Panels"
						className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-[#2a2a2d] bg-[#141416] py-2"
					>
						{PANELS.map(([id, Icon, label]) => (
							<IconButton
								key={id}
								label={label}
								aria-pressed={panel === id}
								className={panel === id ? "bg-muted" : ""}
								onClick={() => $panel.set(id)}
							>
								<Icon size={16} />
							</IconButton>
						))}
					</nav>
					<aside
						className="w-[340px] shrink-0 overflow-y-auto border-r border-[#2a2a2d] bg-[#111113]"
						aria-label={PANELS.find((p) => p[0] === panel)![2]}
					>
						{panel === "explorer" ? (
							<ExplorerPanel />
						) : panel === "framework" ? (
							<FrameworkPanel />
						) : panel === "ai" ? (
							<AiPanel />
						) : (
							<SelectorsPanel />
						)}
					</aside>
					<div className="relative flex min-w-0 flex-1 flex-col">
						<div className="flex h-10 min-w-0 shrink-0 items-center gap-2 overflow-x-auto overflow-y-hidden border-b border-[#2a2a2d] bg-[#19191b] px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
							<Link to="/c/$collection" params={{ collection }} aria-label="Back" className="contents">
								<IconButton label="Back to the list">
									<ArrowLeft size={16} />
								</IconButton>
							</Link>
							<IconButton label="Undo (Ctrl+Z)" disabled={!history.canUndo} onClick={undo}>
								<Undo2 size={16} />
							</IconButton>
							<IconButton label="Redo (Ctrl+Shift+Z)" disabled={!history.canRedo} onClick={redo}>
								<Redo2 size={16} />
							</IconButton>
							<span className="mx-1 h-5 w-px bg-[#2f2f31]" />
							<IconButton label="Add container" onClick={() => addQuick("Container")}>
								<Square size={15} />
							</IconButton>
							<IconButton label="Add text" onClick={() => addQuick("Text")}>
								<TextIcon size={16} />
							</IconButton>
							<IconButton label="Add image" onClick={() => addQuick("Image")}>
								<ImageIcon size={16} />
							</IconButton>
							<IconButton
								label="Add module (A)"
								className="rounded-full bg-white text-[#18181b] hover:bg-zinc-200"
								onClick={() => $inserter.set({})}
							>
								<Grid2x2Plus size={17} />
							</IconButton>
							<span className="mx-1 h-5 w-px bg-[#2f2f31]" />
							<IconButton
								label="Search layers and commands (Ctrl+K)"
								className="max-[1700px]:hidden"
								onClick={() => $spotlight.set(true)}
							>
								<Search size={16} />
							</IconButton>
							<IconButton
								label={$mode.get() === "live" ? "Switch to design mode" : "Preview live"}
								className="max-[1700px]:hidden"
								onClick={() => $mode.set($mode.get() === "live" ? "design" : "live")}
							>
								<Eye size={16} />
							</IconButton>
							<button
								type="button"
								aria-label="Code view"
								onClick={toggleCode}
								className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-[#a1a1aa] transition-colors hover:bg-white/[0.06] hover:text-white"
							>
								<CodeIcon size={13} />
								Code
							</button>
							<span className="mx-auto max-[1700px]:hidden truncate text-xs text-[#a1a1aa]">
								{String(doc.data.title ?? slug)}
							</span>
							<IconButton label="Page settings" onClick={() => setPageSettingsOpen(true)}>
								<Settings2 size={16} />
							</IconButton>
							<IconButton label="Editor settings" onClick={() => $settings.set(true)}>
								<SettingsIcon size={16} />
							</IconButton>
							<span role="status" aria-live="polite" className="shrink-0 text-xs text-[#a1a1aa]">
								{lockedBy
									? `${lockedBy.name} is editing`
									: saving
										? "Saving…"
										: unsaved
											? "Unsaved changes"
											: "All changes saved"}
							</span>
							<a href={livePath} target="_blank" rel="noreferrer" className="contents">
								<IconButton label="Open live page">
									<ExternalLink size={16} />
								</IconButton>
							</a>
							<Link to="/e/$collection/$" params={{ collection, _splat: slug }} className="contents">
								<Button variant="secondary" size="sm" className="border-[#3f3f42] bg-[#242427] text-[#e4e4e7]">
									Classic editor
								</Button>
							</Link>
							<div className="sticky right-0 z-10 flex shrink-0 items-center bg-[#19191b] pl-2">
								<Button
									size="sm"
									className="rounded-full bg-white text-[#18181b] hover:bg-[#e4e4e7]"
									disabled={!unsaved || saving || !!lockedBy}
									onClick={doSave}
								>
									{saving ? "Saving…" : unsaved ? "Publish" : "Published"}
								</Button>
							</div>
						</div>
						<Canvas onKey={onKey} page={editing ? undefined : livePath} preview={!!template} />
						<Notch />
					</div>
					<aside
						className="w-[376px] shrink-0 overflow-hidden border-l border-[#2a2a2d] bg-[#111113]"
						aria-label="Properties"
					>
						<PropertiesPanel />
					</aside>
				</div>
			)}
			{view === "design" && <Breadcrumbs />}
			{view === "design" && <Inserter />}
			<Spotlight />
			<Settings />
			<ContextMenu />
			<Dialog open={pageSettingsOpen} title="Page settings" size="medium" onClose={() => setPageSettingsOpen(false)}>
				<div className="p-6">
					<PageSettings data={doc.data} onChange={setField} path={livePath} kind={kind} showHeader={false} />
				</div>
			</Dialog>
		</div>
	);
}
