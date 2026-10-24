import {
	ChevronRight,
	Code,
	File,
	FileCode,
	FilePlus,
	FileText,
	Folder,
	FolderOpen,
	Lock,
	Minus,
	Plus,
	RefreshCw,
	Save,
	Search,
	Square,
	X,
} from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { Link } from "@tanstack/react-router";
import { overrideKey, safeStylesheet, type Styles } from "@wuppycms/visual-editor";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiData } from "../../lib/api.ts";
import { $collections } from "../../stores/content.ts";
import { $doc } from "../../stores/editor.ts";
import { Canvas, DeviceSwitch, $zoom, fitView, refreshThemeHead, zoomBy } from "./Canvas.tsx";
import { parse } from "./markdown.ts";
import { moduleOf, nodeName } from "./modules.ts";
import {
	$codeFile,
	$context,
	$mode,
	$selected,
	$settings,
	$state,
	$tree,
	$visual,
	mutate,
	mutateVisual,
	saveAll,
} from "./store.ts";
import { toast } from "../../ui/index.tsx";

type Language = "md" | "css" | "json" | "astro" | "ts" | "js" | "text";
type FileKind = "page" | "css" | "component" | "visual" | "theme";
type ThemeSource = { repo: string; files: { path: string; content: string; size: number }[] };

function languageOf(path: string): Language {
	const ext = path.split(".").pop()?.toLowerCase() ?? "";
	if (ext === "css" || ext === "json" || ext === "astro") return ext;
	if (ext === "md" || ext === "mdx") return "md";
	if (ext === "ts" || ext === "tsx") return "ts";
	if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") return "js";
	return "text";
}

interface WorkspaceFile {
	id: string;
	name: string;
	path: string;
	kind: FileKind;
	language: Language;
	content: string;
	readOnly?: boolean;
}

type TreeEntry =
	{ kind: "folder"; id: string; name: string; children: TreeEntry[] } | { kind: "file"; file: WorkspaceFile };

/** Folders from the files' real paths, under one root. */
function folderTree(id: string, name: string, files: WorkspaceFile[]): TreeEntry {
	const root = { kind: "folder" as const, id, name, children: [] as TreeEntry[] };
	for (const file of files) {
		const parts = file.path.split("/");
		let children = root.children;
		for (const [index, part] of parts.slice(0, -1).entries()) {
			let folder = children.find(
				(entry): entry is Extract<TreeEntry, { kind: "folder" }> => entry.kind === "folder" && entry.name === part,
			);
			if (!folder) {
				folder = {
					kind: "folder",
					id: `${id}:${parts.slice(0, index + 1).join("/")}`,
					name: part,
					children: [],
				};
				children.push(folder);
			}
			children = folder.children;
		}
		children.push({ kind: "file", file });
	}
	return root;
}

/** Pretty-print generated visual HTML for the code surface without touching hand-written Markdown. */
function formatSource(source: string): string {
	if (!source.includes("data-ve=")) return source;
	const lines = source.replace(/></g, ">\n<").split("\n");
	let depth = 0;
	const out: string[] = [];
	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;
		const closing = line.startsWith("</");
		if (closing) depth = Math.max(0, depth - 1);
		out.push(`${"  ".repeat(depth)}${line}`);
		if (
			!closing &&
			line.startsWith("<") &&
			!line.endsWith("/>") &&
			!line.includes("</") &&
			!line.startsWith("<!--") &&
			/^<[A-Za-z][^>]*>$/.test(line)
		)
			depth++;
	}
	return out.join("\n");
}

const MONO = "font-mono text-[12px] leading-5";

function token(key: string, text: string, className: string): ReactNode {
	return (
		<span key={key} className={className}>
			{text}
		</span>
	);
}

/** Small HTML/Markdown tokeniser; comments, tags, attribute names and strings get editor colours. */
function highlightTag(tag: string, prefix: string): ReactNode[] {
	const out: ReactNode[] = [];
	const re = /(<[/!]?|\/?>)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([A-Za-z_:][\w:.-]*)|(=)/g;
	let last = 0;
	let firstWord = true;
	let index = 0;
	let match: RegExpExecArray | null;
	while ((match = re.exec(tag))) {
		if (match.index > last)
			out.push(token(`${prefix}-text-${index++}`, tag.slice(last, match.index), "text-[#d4d4d4]"));
		if (match[1]) out.push(token(`${prefix}-punct-${index++}`, match[1], "text-[#808080]"));
		else if (match[2]) out.push(token(`${prefix}-string-${index++}`, match[2], "text-[#ce9178]"));
		else if (match[3]) {
			out.push(token(`${prefix}-word-${index++}`, match[3], firstWord ? "text-[#569cd6]" : "text-[#9cdcfe]"));
			firstWord = false;
		} else if (match[4]) out.push(token(`${prefix}-equals-${index++}`, match[4], "text-[#808080]"));
		last = match.index + match[0].length;
	}
	if (last < tag.length) out.push(token(`${prefix}-tail`, tag.slice(last), "text-[#d4d4d4]"));
	return out;
}

function highlightHtml(code: string): ReactNode[] {
	const out: ReactNode[] = [];
	const re = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/g;
	let last = 0;
	let index = 0;
	let match: RegExpExecArray | null;
	while ((match = re.exec(code))) {
		if (match.index > last) out.push(token(`html-text-${index++}`, code.slice(last, match.index), "text-[#d4d4d4]"));
		if (match[0].startsWith("<!--")) out.push(token(`html-comment-${index++}`, match[0], "text-[#6a9955] italic"));
		else out.push(...highlightTag(match[0], `html-tag-${index++}`));
		last = match.index + match[0].length;
	}
	if (last < code.length) out.push(token("html-tail", code.slice(last), "text-[#d4d4d4]"));
	return out;
}

function highlightCss(code: string): ReactNode[] {
	const out: ReactNode[] = [];
	const re =
		/(\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([\w-]+)(?=\s*:)|(#[0-9a-fA-F]{3,8}\b)|(-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms)?)|([{}();:,])/g;
	let last = 0;
	let index = 0;
	let match: RegExpExecArray | null;
	while ((match = re.exec(code))) {
		if (match.index > last) out.push(token(`css-text-${index++}`, code.slice(last, match.index), "text-[#d4d4d4]"));
		if (match[1]) out.push(token(`css-comment-${index++}`, match[1], "text-[#6a9955] italic"));
		else if (match[2]) out.push(token(`css-string-${index++}`, match[2], "text-[#ce9178]"));
		else if (match[3]) out.push(token(`css-prop-${index++}`, match[3], "text-[#9cdcfe]"));
		else if (match[4]) out.push(token(`css-hex-${index++}`, match[4], "text-[#b5cea8]"));
		else if (match[5]) out.push(token(`css-number-${index++}`, match[5], "text-[#b5cea8]"));
		else if (match[6]) out.push(token(`css-punct-${index++}`, match[6], "text-[#808080]"));
		last = match.index + match[0].length;
	}
	if (last < code.length) out.push(token("css-tail", code.slice(last), "text-[#d4d4d4]"));
	return out;
}

function highlightJson(code: string): ReactNode[] {
	const out: ReactNode[] = [];
	const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?)|(true|false|null)|([{}[\],:])/g;
	let last = 0;
	let index = 0;
	let match: RegExpExecArray | null;
	while ((match = re.exec(code))) {
		if (match.index > last) out.push(token(`json-text-${index++}`, code.slice(last, match.index), "text-[#d4d4d4]"));
		if (match[1]) {
			if (match[2])
				out.push(
					token(`json-key-${index++}`, match[1], "text-[#9cdcfe]"),
					token(`json-colon-${index++}`, match[2], "text-[#808080]"),
				);
			else out.push(token(`json-string-${index++}`, match[1], "text-[#ce9178]"));
		} else if (match[3]) out.push(token(`json-number-${index++}`, match[3], "text-[#b5cea8]"));
		else if (match[4]) out.push(token(`json-word-${index++}`, match[4], "text-[#569cd6]"));
		else if (match[5]) out.push(token(`json-punct-${index++}`, match[5], "text-[#808080]"));
		last = match.index + match[0].length;
	}
	if (last < code.length) out.push(token("json-tail", code.slice(last), "text-[#d4d4d4]"));
	return out;
}

function highlight(code: string, language: Language): ReactNode[] {
	if (language === "css") return highlightCss(code);
	if (language === "json") return highlightJson(code);
	return highlightHtml(code);
}

function CodeEditor({
	value,
	onChange,
	language,
	onSave,
}: {
	value: string;
	onChange: (value: string) => void;
	language: Language;
	onSave: () => void;
}) {
	const textarea = useRef<HTMLTextAreaElement>(null);
	const highlighter = useRef<HTMLPreElement>(null);
	const gutter = useRef<HTMLDivElement>(null);
	const lines = useMemo(() => value.split("\n"), [value]);
	const highlighted = useMemo(() => highlight(value, language), [language, value]);

	const syncScroll = () => {
		const element = textarea.current;
		if (!element) return;
		if (highlighter.current) {
			highlighter.current.scrollTop = element.scrollTop;
			highlighter.current.scrollLeft = element.scrollLeft;
		}
		if (gutter.current) gutter.current.scrollTop = element.scrollTop;
	};

	return (
		<div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#111113]">
			<div
				ref={gutter}
				aria-hidden="true"
				className="w-10 shrink-0 overflow-hidden border-r border-[#252528] bg-[#111113] py-4 text-right font-mono text-[10px] leading-5 text-[#5f5f66] select-none"
			>
				{lines.map((_, index) => (
					<div key={index} className="pr-2">
						{index + 1}
					</div>
				))}
			</div>
			<div className="relative min-w-0 flex-1">
				<pre
					ref={highlighter}
					aria-hidden="true"
					className={`pointer-events-none absolute inset-0 overflow-auto p-4 font-mono text-[12px] leading-5 whitespace-pre [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${MONO}`}
				>
					{highlighted}
				</pre>
				<textarea
					ref={textarea}
					aria-label="Code editor"
					aria-multiline="true"
					spellCheck={false}
					autoCapitalize="off"
					autoCorrect="off"
					wrap="off"
					value={value}
					onChange={(event) => onChange(event.target.value)}
					onScroll={syncScroll}
					onKeyDown={(event) => {
						if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
							event.preventDefault();
							event.stopPropagation();
							onSave();
							return;
						}
						if (event.key === "Tab") {
							event.preventDefault();
							const element = event.currentTarget;
							const start = element.selectionStart;
							const end = element.selectionEnd;
							const next = `${value.slice(0, start)}  ${value.slice(end)}`;
							onChange(next);
							requestAnimationFrame(() => {
								element.selectionStart = start + 2;
								element.selectionEnd = start + 2;
							});
						}
					}}
					className="absolute inset-0 h-full w-full resize-none overflow-auto border-0 bg-transparent p-4 font-mono text-[12px] leading-5 whitespace-pre text-transparent caret-[#f4f4f5] outline-none selection:bg-[#264f78] selection:text-transparent"
				/>
			</div>
		</div>
	);
}

function fileIcon(file: WorkspaceFile) {
	if (file.language === "css" || file.language === "json" || file.kind === "theme") return FileCode;
	if (file.language === "md") return FileText;
	return File;
}

function CodePreviewToolbar({ onExit }: { onExit: () => void }) {
	const zoom = useStore($zoom);
	return (
		<div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#2a2a2d] bg-[#19191b] px-3">
			<div className="flex items-center gap-0.5">
				<DeviceSwitch />
				<button
					type="button"
					aria-label="Add breakpoint"
					onClick={() => $settings.set(true)}
					className="grid size-6 place-items-center rounded-md text-[#a1a1aa] hover:bg-white/[0.06] hover:text-white"
				>
					<Plus size={13} />
				</button>
			</div>
			<span className="h-4 w-px bg-[#2f2f31]" />
			<span className="text-[10px] text-[#71717a]">Preview</span>
			<div className="ml-auto flex items-center gap-0.5">
				<button
					type="button"
					aria-label="Zoom out"
					onClick={() => zoomBy(1 / 1.2)}
					className="grid size-6 place-items-center rounded-md text-[#a1a1aa] hover:bg-white/[0.06] hover:text-white"
				>
					<Minus size={12} />
				</button>
				<button
					type="button"
					aria-label="Fit preview"
					onClick={fitView}
					className="min-w-11 rounded-md px-1.5 py-1 text-center text-[10px] text-[#d4d4d8] hover:bg-white/[0.06]"
				>
					{Math.round(zoom * 100)}%
				</button>
				<button
					type="button"
					aria-label="Zoom in"
					onClick={() => zoomBy(1.2)}
					className="grid size-6 place-items-center rounded-md text-[#a1a1aa] hover:bg-white/[0.06] hover:text-white"
				>
					<Plus size={12} />
				</button>
			</div>
			<span className="mx-1 h-4 w-px bg-[#2f2f31]" />
			<button
				type="button"
				aria-label="Back to design view"
				onClick={onExit}
				className="flex h-6 items-center gap-1 rounded-md px-2 text-[10px] font-medium text-[#a1a1aa] hover:bg-white/[0.06] hover:text-white"
			>
				<Square size={11} />
				Design
			</button>
		</div>
	);
}

function CodeStylesPanel() {
	const selected = useStore($selected);
	const tree = useStore($tree);
	const visual = useStore($visual);
	const context = useStore($context);
	const state = useStore($state);
	const [tab, setTab] = useState<"styles" | "computed">("styles");
	const node = selected ? tree.nodes[selected] : undefined;
	const contextLabel =
		visual.breakpoints.find((breakpoint) => breakpoint.id === context)?.label ??
		visual.conditions.find((condition) => condition.id === context)?.label ??
		"Base";
	const declarations: Record<string, string> = {};
	if (node) {
		Object.assign(declarations, (moduleOf(node).styles ?? {}) as Styles);
		Object.assign(declarations, node.styles);
		Object.assign(declarations, node.overrides[overrideKey(context, state)] ?? {});
	}
	const tag = node ? (selected === tree.rootNodeId ? "body" : moduleOf(node).tag(node.props)) : "";
	const selector = node ? (selected === tree.rootNodeId ? "body" : `:where([data-ve="${node.moduleId}"])`) : "";
	const css = node
		? `${selector} {\n${
				Object.entries(declarations)
					.map(([property, value]) => `  ${property}: ${value};`)
					.join("\n") || "  /* no styles */"
			}\n}`
		: "";
	return (
		<section
			aria-label="Styles inspector"
			className="flex h-[214px] shrink-0 flex-col border-t border-[#2a2a2d] bg-[#141416]"
		>
			<div className="flex h-8 shrink-0 items-center gap-2 border-b border-[#2a2a2d] px-3">
				<Code size={12} className="text-[#a1a1aa]" />
				<span className="text-[11px] font-semibold text-[#e4e4e7]">Styles</span>
				<div className="ml-2 flex rounded-md bg-[#1b1b1e] p-0.5">
					<button
						type="button"
						onClick={() => setTab("styles")}
						className={`h-5 rounded px-2 text-[10px] ${tab === "styles" ? "bg-[#303034] text-white" : "text-[#a1a1aa] hover:text-white"}`}
					>
						Styles
					</button>
					<button
						type="button"
						onClick={() => setTab("computed")}
						className={`h-5 rounded px-2 text-[10px] ${tab === "computed" ? "bg-[#303034] text-white" : "text-[#a1a1aa] hover:text-white"}`}
					>
						Computed
					</button>
				</div>
				<span className="ml-auto text-[9px] text-[#71717a]">{contextLabel}</span>
				<span className="text-[9px] text-[#5f5f66]">Kept</span>
			</div>
			{node ? (
				<>
					<div className="flex h-6 shrink-0 items-center gap-2 px-3 font-mono text-[10px] text-[#a1a1aa]">
						<span className="text-[#9bdcff]">{tag}</span>
						<span>{nodeName(node)}</span>
						<span className="ml-auto text-[#5f5f66]">{tab === "styles" ? "source" : "resolved"}</span>
					</div>
					<pre className="min-h-0 flex-1 overflow-auto px-3 pb-3 font-mono text-[10px] leading-4 whitespace-pre">
						{highlight(css, "css")}
					</pre>
				</>
			) : (
				<p className="grid flex-1 place-items-center px-4 text-[11px] text-[#71717a]">
					Select an element on the canvas to inspect its styles.
				</p>
			)}
		</section>
	);
}

/** Keep the styles inspector useful when the code view opens or a page save replaces node ids. */
function selectFirstPreviewNode(): void {
	const current = $tree.get();
	const children = current.nodes[current.rootNodeId]?.children ?? [];
	const first =
		children.map((id) => current.nodes[id]).find((node) => node && node.moduleId !== "markdown") ??
		current.nodes[children[0] ?? ""];
	if (first) $selected.set(first.id);
}

export function CodeWorkspace({
	onExit,
	onDirtyChange,
}: {
	onExit: () => void;
	onDirtyChange?: (dirty: boolean) => void;
}) {
	const doc = useStore($doc);
	const collections = useStore($collections);
	const visual = useStore($visual);
	const [query, setQuery] = useState("");
	const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
	const [activeId, setActiveId] = useState<string | null>("page");
	const [openIds, setOpenIds] = useState<string[]>(["page"]);
	const [buffers, setBuffers] = useState<Record<string, string>>({});
	const [saved, setSaved] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);
	const [rebuilding, setRebuilding] = useState(false);
	const [previewRevision, setPreviewRevision] = useState(0);
	const [themeSource, setThemeSource] = useState<ThemeSource | null>(null);
	const requestedFile = useStore($codeFile);
	const q = query.trim().toLowerCase();

	// The active theme's code (admins only); null when the built-in site is active.
	useEffect(() => {
		let cancelled = false;
		void apiData<ThemeSource | null>("GET", "/api/themes/files").then(
			(source) => !cancelled && setThemeSource(source),
			() => !cancelled && setThemeSource(null),
		);
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		$mode.set("design");
		if ($selected.get()) return;
		const current = $tree.get();
		const children = current.nodes[current.rootNodeId]?.children ?? [];
		const first =
			children.map((id) => current.nodes[id]).find((node) => node && node.moduleId !== "markdown") ??
			current.nodes[children[0] ?? ""];
		if (first) $selected.set(first.id);
	}, []);

	const pageFile = useMemo<WorkspaceFile | null>(() => {
		if (!doc) return null;
		// The entry's real file in the site, e.g. content/pages/about.md.
		const dir = collections.find((c) => c.name === doc.collection)?.dir ?? doc.collection;
		return {
			id: "page",
			name: `${doc.slug.split("/").pop() || "page"}.md`,
			path: `${dir}/${doc.slug}.md`,
			kind: "page",
			language: "md",
			content: formatSource(doc.body),
		};
	}, [doc?.body, doc?.slug, doc?.collection, collections]);

	const files = useMemo<WorkspaceFile[]>(() => {
		const next: WorkspaceFile[] = [];
		if (pageFile) next.push(pageFile);
		next.push({
			id: "site-css",
			name: "site.css",
			// Part of visual.json (its stylesheet), shown as a CSS file.
			path: ".wuppy/data/visual/site.css",
			kind: "css",
			language: "css",
			content: visual.stylesheet,
		});
		for (const component of visual.components) {
			next.push({
				id: `component:${component.id}`,
				name: `${component.id}.json`,
				path: `.wuppy/data/visual/components/${component.id}.json`,
				kind: "component",
				language: "json",
				content: JSON.stringify({ name: component.name, params: component.params, nodes: component.nodes }, null, 2),
				readOnly: true,
			});
		}
		next.push({
			id: "visual-data",
			name: "visual.json",
			path: ".wuppy/data/visual.json",
			kind: "visual",
			language: "json",
			content: JSON.stringify(visual, null, 2),
			readOnly: true,
		});
		for (const file of themeSource?.files ?? []) {
			next.push({
				id: `theme:${file.path}`,
				name: file.path.split("/").pop() ?? file.path,
				path: file.path,
				kind: "theme",
				language: languageOf(file.path),
				content: file.content,
			});
		}
		return next;
	}, [pageFile, visual, themeSource]);

	// The site's content and data, then the active theme's code (its design) as a second root.
	const tree = useMemo<TreeEntry[]>(() => {
		const site = folderTree(
			"site",
			"site",
			files.filter((f) => f.kind !== "theme"),
		);
		const theme = files.filter((f) => f.kind === "theme");
		return themeSource && theme.length ? [site, folderTree("theme", `theme: ${themeSource.repo}`, theme)] : [site];
	}, [files, themeSource]);

	const contentFor = (file: WorkspaceFile) => buffers[file.id] ?? file.content;
	const dirtyFor = (file: WorkspaceFile) => contentFor(file) !== (saved[file.id] ?? file.content);
	const dirty = openIds.some((id) => {
		const file = files.find((entry) => entry.id === id);
		return file ? dirtyFor(file) : false;
	});
	const openFiles = openIds.flatMap((id) => files.find((file) => file.id === id) ?? []);
	const activeFile = openFiles.find((file) => file.id === activeId) ?? openFiles.at(-1) ?? null;
	const empty = q ? "No matching files" : "None yet";

	useEffect(() => {
		onDirtyChange?.(dirty);
	}, [dirty, onDirtyChange]);

	const openFile = (file: WorkspaceFile) => {
		setOpenIds((previous) => (previous.includes(file.id) ? previous : [...previous, file.id]));
		setActiveId(file.id);
	};
	useEffect(() => {
		if (!requestedFile || !themeSource) return;
		const id = `theme:${requestedFile}`;
		const file = files.find((entry) => entry.id === id);
		if (!file) {
			$codeFile.set(null);
			return;
		}
		setOpenIds((previous) => (previous.includes(id) ? previous : [...previous, id]));
		setActiveId(id);
		$codeFile.set(null);
	}, [files, requestedFile, themeSource]);

	const closeFile = (id: string) => {
		const file = files.find((entry) => entry.id === id);
		if (file && dirtyFor(file) && !confirm(`Discard unsaved changes to ${file.name}?`)) return;
		setOpenIds((previous) => {
			const next = previous.filter((entry) => entry !== id);
			if (activeId === id) setActiveId(next.at(-1) ?? null);
			return next;
		});
	};
	const save = async () => {
		if (!activeFile || activeFile.readOnly || saving) return;
		const content = contentFor(activeFile);
		setSaving(true);
		try {
			if (activeFile.kind === "page") {
				const next = parse(content);
				mutate((draft) => Object.assign(draft, next));
				requestAnimationFrame(selectFirstPreviewNode);
			} else if (activeFile.kind === "css") {
				if (!safeStylesheet(content)) throw new Error("Stylesheet is not valid or is unsafe.");
				mutateVisual((draft) => void (draft.stylesheet = content));
			} else if (activeFile.kind === "theme") {
				await apiData("PUT", "/api/themes/file", { path: activeFile.path, content });
			} else {
				return;
			}
			if (activeFile.kind !== "theme" && !(await saveAll())) throw new Error("Could not save the code changes.");
			setBuffers((previous) => ({ ...previous, [activeFile.id]: content }));
			setSaved((previous) => ({ ...previous, [activeFile.id]: content }));
			if (activeFile.kind === "page") {
				// Tailwind's Vite plugin writes the new utility selectors on the next
				// rebuild; give it a beat, then remount the preview with fresh CSS.
				await new Promise((resolve) => setTimeout(resolve, 900));
				refreshThemeHead();
				setPreviewRevision((revision) => revision + 1);
			}
			toast(
				activeFile.kind === "theme" ? "Theme file saved; in production, rebuild the theme to apply it" : "Code saved",
				"info",
			);
		} catch (error) {
			toast((error as Error).message, "error");
		} finally {
			setSaving(false);
		}
	};

	const rebuildTheme = async () => {
		if (rebuilding) return;
		setRebuilding(true);
		try {
			await apiData("POST", "/api/themes/rebuild");
			toast("Theme rebuild started; the server may restart when it finishes", "info");
		} catch (error) {
			toast((error as Error).message, "error");
		} finally {
			setRebuilding(false);
		}
	};

	const renderFile = (file: WorkspaceFile, depth: number) => {
		const Icon = fileIcon(file);
		const isDirty = dirtyFor(file);
		return (
			<button
				key={file.id}
				type="button"
				aria-current={activeFile?.id === file.id ? "true" : undefined}
				onClick={() => openFile(file)}
				className={`flex h-6 w-full items-center gap-1.5 rounded px-1.5 text-left text-[11px] ${
					activeFile?.id === file.id
						? "bg-white/[0.07] text-white"
						: "text-[#a1a1aa] hover:bg-white/[0.04] hover:text-[#e4e4e7]"
				}`}
				style={{ paddingLeft: 6 + depth * 12 }}
			>
				<Icon size={11} className="shrink-0 text-[#71717a]" />
				<span className="min-w-0 flex-1 truncate">{file.name}</span>
				{file.readOnly ? (
					<Lock size={9} className="shrink-0 text-[#5f5f66]" />
				) : (
					<>
						{isDirty && <span className="text-[9px] text-[#fbbf24]">U</span>}
						<span className={`size-1.5 shrink-0 rounded-full ${isDirty ? "bg-[#fbbf24]" : "bg-[#22c55e]"}`} />
					</>
				)}
			</button>
		);
	};

	const renderEntries = (entries: TreeEntry[], depth = 0): ReactNode =>
		entries.map((entry) => {
			if (entry.kind === "file") return renderFile(entry.file, depth);
			const expanded = !collapsed.has(entry.id);
			return (
				<div key={entry.id}>
					<button
						type="button"
						aria-expanded={expanded}
						onClick={() =>
							setCollapsed((previous) => {
								const next = new Set(previous);
								if (next.has(entry.id)) next.delete(entry.id);
								else next.add(entry.id);
								return next;
							})
						}
						className="flex h-6 w-full items-center gap-1 rounded px-1.5 text-left text-[11px] font-medium text-[#a1a1aa] hover:bg-white/[0.04] hover:text-[#e4e4e7]"
						style={{ paddingLeft: 4 + depth * 12 }}
					>
						<ChevronRight
							size={10}
							className={`shrink-0 text-[#71717a] transition-transform ${expanded ? "rotate-90" : ""}`}
						/>
						{expanded ? (
							<FolderOpen size={11} className="shrink-0 text-[#71717a]" />
						) : (
							<Folder size={11} className="shrink-0 text-[#71717a]" />
						)}
						<span className="truncate">{entry.name}</span>
					</button>
					{expanded && renderEntries(entry.children, depth + 1)}
				</div>
			);
		});

	const searchResults = q ? files.filter((file) => `${file.path} ${file.name}`.toLowerCase().includes(q)) : null;
	const ActiveIcon = activeFile ? fileIcon(activeFile) : File;

	return (
		<div className="flex min-h-0 flex-1 bg-[#111113] text-[#e4e4e7]" data-testid="code-workspace">
			<aside
				aria-label="Workspace files"
				className="flex w-[260px] shrink-0 flex-col border-r border-[#2a2a2d] bg-[#111113]"
			>
				<div className="flex items-center gap-1 border-b border-[#2a2a2d] p-2">
					<div className="relative min-w-0 flex-1">
						<Search
							size={12}
							className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[#71717a]"
						/>
						<input
							aria-label="Find a file"
							placeholder="Find a file..."
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							className="h-8 w-full rounded-lg border border-[#2f2f31] bg-[#18181b] pr-2 pl-8 text-[11px] text-[#e4e4e7] outline-none placeholder:text-[#5f5f66]"
						/>
					</div>
					<Link
						to="/c/$collection"
						params={{ collection: doc?.collection ?? "pages" }}
						aria-label="Open pages"
						title="Open pages"
						className="grid size-7 place-items-center rounded text-[#a1a1aa] hover:bg-white/[0.06] hover:text-white"
					>
						<FilePlus size={13} />
					</Link>
					<button
						type="button"
						aria-label="Close code view"
						title="Close code view"
						onClick={onExit}
						className="grid size-7 place-items-center rounded text-[#a1a1aa] hover:bg-white/[0.06] hover:text-white"
					>
						<X size={13} />
					</button>
				</div>
				{doc && (
					<Link
						to="/c/$collection"
						params={{ collection: doc.collection }}
						className="flex h-7 items-center gap-2 border-b border-[#252528] px-3 text-[11px] text-[#a1a1aa] hover:bg-white/[0.04] hover:text-white"
					>
						<FilePlus size={12} />
						New page
					</Link>
				)}
				<div className="min-h-0 flex-1 overflow-y-auto p-1">
					{searchResults ? (
						searchResults.length ? (
							searchResults.map((file) => renderFile(file, 0))
						) : (
							<p className="px-2 py-3 text-[11px] text-[#5f5f66]">{empty}</p>
						)
					) : (
						renderEntries(tree)
					)}
				</div>
				<div className="border-t border-[#252528] px-3 py-2 font-mono text-[9px] text-[#5f5f66]">
					Markdown + theme code · Git workspace
				</div>
			</aside>

			<div className="flex min-w-0 flex-1 flex-col">
				<CodePreviewToolbar onExit={onExit} />
				<div className="relative flex min-h-0 flex-1">
					<Canvas key={previewRevision} chrome={false} onKey={() => {}} />
				</div>
				<CodeStylesPanel />
			</div>

			<aside
				aria-label="Code panel"
				className="flex w-[46%] max-w-[640px] min-w-[360px] shrink-0 flex-col border-l border-[#2a2a2d] bg-[#151517]"
			>
				<div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[#2a2a2d] bg-[#111113] px-1">
					{openFiles.map((file) => {
						const Icon = fileIcon(file);
						const isActive = activeFile?.id === file.id;
						return (
							<div
								key={file.id}
								className={`flex h-7 shrink-0 items-center rounded-t-md ${
									isActive ? "bg-[#1b1b1d] text-[#e4e4e7]" : "text-[#71717a] hover:bg-white/[0.04] hover:text-[#d4d4d8]"
								}`}
							>
								<button
									type="button"
									onClick={() => setActiveId(file.id)}
									className="flex h-full items-center gap-1.5 px-2 text-[10px]"
								>
									<Icon size={11} />
									{file.name}
								</button>
								<button
									type="button"
									aria-label={`Close ${file.name}`}
									onClick={() => closeFile(file.id)}
									className="mr-1 grid size-4 place-items-center rounded hover:bg-white/[0.08]"
								>
									<X size={9} />
								</button>
							</div>
						);
					})}
				</div>
				{activeFile ? (
					<>
						<div className="flex h-8 shrink-0 items-center gap-2 border-b border-[#2a2a2d] px-3 text-[10px] text-[#71717a]">
							<ActiveIcon size={11} className="shrink-0" />
							<span className="min-w-0 flex-1 truncate font-mono">{activeFile.path}</span>
							<span
								role="status"
								data-testid="code-save-status"
								aria-live="polite"
								className={`shrink-0 ${dirtyFor(activeFile) ? "text-[#fbbf24]" : "text-[#7ddc3f]"}`}
							>
								{activeFile.readOnly ? "Read only" : dirtyFor(activeFile) ? "Unsaved" : "Saved"}
							</span>
							{!activeFile.readOnly && (
								<button
									type="button"
									aria-label="Save code changes"
									title="Save code changes (Ctrl+S)"
									disabled={!dirtyFor(activeFile) || saving}
									onClick={() => void save()}
									className="grid size-5 place-items-center rounded text-[#a1a1aa] hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
								>
									<Save size={11} />
								</button>
							)}
						</div>
						<CodeEditor
							value={contentFor(activeFile)}
							onChange={(value) => setBuffers((previous) => ({ ...previous, [activeFile.id]: value }))}
							language={activeFile.language}
							onSave={() => void save()}
						/>
						<div className="flex h-6 shrink-0 items-center gap-3 border-t border-[#2a2a2d] px-3 font-mono text-[9px] text-[#5f5f66]">
							<span>{activeFile.language.toUpperCase()}</span>
							{!activeFile.readOnly && <span>Ctrl+S save</span>}
							{activeFile.kind === "page" && <span className="text-[#fbbf24]">Tailwind compiles on save</span>}
							{activeFile.kind === "theme" && (
								<button
									type="button"
									aria-label="Rebuild theme"
									disabled={rebuilding}
									onClick={() => void rebuildTheme()}
									className="flex items-center gap-1 rounded px-1 text-[#a1a1aa] hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
								>
									<RefreshCw size={9} className={rebuilding ? "animate-spin" : ""} />
									{rebuilding ? "Starting…" : "Rebuild"}
								</button>
							)}
							<span className="ml-auto">UTF-8</span>
						</div>
					</>
				) : (
					<div className="grid flex-1 place-items-center p-6 text-center text-[11px] text-[#71717a]">
						Select a file from the workspace to edit it.
					</div>
				)}
			</aside>
		</div>
	);
}
