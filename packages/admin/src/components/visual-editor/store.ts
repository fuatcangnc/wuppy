import {
	defaultVisualData,
	nodeJsonSchema,
	overrideKey,
	type NodeJson,
	type Styles,
	type VisualData,
} from "@wuppy/visual-editor";
import { atom, computed } from "nanostores";
import { api, apiData, slugPath } from "../../lib/api.ts";
import { $dirty, $doc, save, setBody } from "../../stores/editor.ts";
import { expandComponent, paramsOf, parse, serialize } from "./markdown.ts";
import { canHaveChildren, MODULES, type Preset } from "./modules.ts";
import {
	cloneTree,
	createNode,
	deleteNode,
	duplicateNode,
	emptyTree,
	fromJson,
	insertNode,
	moveNode,
	newKey,
	resolveDrop,
	toJson,
	updateNodeOverrides,
	updateNodeProps,
	updateNodeStyles,
	wrapNode,
	type DropPosition,
	type NodeTree,
} from "./tree.ts";

/**
 * Editor state, after Instatic's editor store: every change goes through `mutate` (the page tree) or `mutateVisual`
 * (site-wide data: selectors, framework, components, layouts), which records one undo step for both and writes the
 * new body into the entry being edited, so Save, autosave and the dirty flag just work.
 */
export const $tree = atom<NodeTree>(emptyTree());
export const $selected = atom<string | null>(null);
export const $hovered = atom<string | null>(null);
/** The floating row that follows a native drag, in viewport pixels. */
export const $dragPreview = atom<{ label: string; moduleId: string; x: number; y: number } | null>(null);
export const $history = atom({ canUndo: false, canRedo: false });

export const $visual = atom<VisualData>(defaultVisualData());
const $visualSaved = atom(JSON.stringify($visual.get()));
export const $visualDirty = computed([$visual, $visualSaved], (v, saved) => JSON.stringify(v) !== saved);
export const $visualError = atom<string | null>(null);
export const $visualLoaded = atom(false);

/** Editing context: "" is the base (desktop) styles, else a breakpoint or condition id. */
export const $context = atom("");
/** A pseudo-class/element (":hover") the style edits apply to, or "". */
export const $state = atom("");
/** When set, Properties edits this selector of the library instead of the selected node (Instatic's selector mode). */
export const $target = atom<string | null>(null);
export const $mode = atom<"design" | "live">("design");
/** A Visual Component open on the canvas instead of the page. */
export const $editingComponent = atom<{ id: string; page: NodeTree } | null>(null);

// UI surfaces
export const $panel = atom<"explorer" | "framework" | "selectors">("explorer");
export const $inserter = atom<{ at?: { overId: string; position: DropPosition } } | null>(null);
export const $spotlight = atom(false);
/** A theme source file requested from the component catalog; opened by the code workspace. */
export const $codeFile = atom<string | null>(null);
/** Astro components the server allows in MDX (theme source + `components` in wuppy.config). */
export const $componentNames = atom<string[]>([]);
export const $settings = atom(false);
export const $menu = atom<{ x: number; y: number; id: string } | null>(null);

interface Snapshot {
	tree: NodeTree;
	visual: VisualData;
}
const LIMIT = 100;
const COALESCE_MS = 800;
let past: Snapshot[] = [];
let future: Snapshot[] = [];
let lastKey: string | undefined;
let lastAt = 0;

const syncHistory = () => $history.set({ canUndo: past.length > 0, canRedo: future.length > 0 });
const resetHistory = () => {
	past = [];
	future = [];
	lastKey = undefined;
	syncHistory();
};

export function load(body: string): void {
	$tree.set(parse(body));
	$selected.set(null);
	$target.set(null);
	$editingComponent.set(null);
	resetHistory();
}

export async function loadVisual(): Promise<void> {
	try {
		const data = await apiData<VisualData>("GET", "/api/data/visual");
		$visual.set(data);
		$visualSaved.set(JSON.stringify(data));
		$visualError.set(null);
	} catch (e) {
		$visualError.set((e as Error).message);
	} finally {
		$visualLoaded.set(true);
	}
}

function record(key?: string): void {
	const now = Date.now();
	if (!(key && key === lastKey && now - lastAt < COALESCE_MS)) {
		past = [...past.slice(-(LIMIT - 1)), { tree: $tree.get(), visual: $visual.get() }];
		future = [];
	}
	lastKey = key;
	lastAt = now;
}

function commit(tree: NodeTree, visual: VisualData): void {
	$tree.set(tree);
	$visual.set(visual);
	if ($selected.get() && !tree.nodes[$selected.get()!]) $selected.set(null);
	if ($target.get() && !visual.selectors.some((s) => s.id === $target.get())) $target.set(null);
	if (!$editingComponent.get()) setBody(serialize(tree, visual.components));
	syncHistory();
}

/** Apply a change. Changes with the same `key` in quick succession (typing in a field) are one undo step. */
export function mutate(fn: (draft: NodeTree) => void, key?: string): void {
	const draft = cloneTree($tree.get());
	fn(draft);
	record(key);
	commit(draft, $visual.get());
}

export function mutateVisual(fn: (draft: VisualData) => void, key?: string): void {
	const draft = structuredClone($visual.get());
	fn(draft);
	record(key);
	commit($tree.get(), draft);
}

function mutateBoth(fn: (tree: NodeTree, visual: VisualData) => void): void {
	const tree = cloneTree($tree.get());
	const visual = structuredClone($visual.get());
	fn(tree, visual);
	record();
	commit(tree, visual);
}

export function undo(): void {
	const prev = past.pop();
	if (!prev) return;
	future.push({ tree: $tree.get(), visual: $visual.get() });
	lastKey = undefined;
	commit(prev.tree, prev.visual);
}

export function redo(): void {
	const next = future.pop();
	if (!next) return;
	past.push({ tree: $tree.get(), visual: $visual.get() });
	lastKey = undefined;
	commit(next.tree, next.visual);
}

/** Markdown blocks hold free text that cannot sit inside an element on one line, so they stay at the page's top level. */
const allowedParent = (tree: NodeTree, moduleId: string, parentId: string) =>
	moduleId !== "markdown" || (parentId === tree.rootNodeId && !$editingComponent.get());

export function presetJson(preset: Preset): NodeJson {
	const def = MODULES[preset.moduleId]!;
	return {
		moduleId: preset.moduleId,
		props: { ...def.defaults, ...preset.props },
		styles: { ...def.styles, ...preset.styles },
		children: (preset.children ?? []).map(presetJson),
	};
}

/** Where a new node goes: inside the selected container, after the selected node, or at the end of the page. */
function insertionPoint(tree: NodeTree, moduleId: string): { parentId: string; index?: number } {
	const sel = tree.nodes[$selected.get() ?? ""];
	if (!sel || sel.id === tree.rootNodeId) return { parentId: tree.rootNodeId };
	if (canHaveChildren(sel.moduleId) && sel.moduleId !== "ref" && !sel.locked && allowedParent(tree, moduleId, sel.id))
		return { parentId: sel.id };
	const parent = tree.nodes[sel.parentId ?? ""];
	if (!parent || parent.locked || !allowedParent(tree, moduleId, parent.id)) return { parentId: tree.rootNodeId };
	return { parentId: parent.id, index: parent.children.indexOf(sel.id) + 1 };
}

/** Insert plain-data nodes (a module preset, a layout, the clipboard, imported HTML); selects the first one. */
export function addJson(nodes: NodeJson[], at?: { overId: string; position: DropPosition }): void {
	if (!nodes.length) return;
	const tree = $tree.get();
	const moduleId = nodes.some((n) => n.moduleId === "markdown") ? "markdown" : nodes[0]!.moduleId;
	let target: { parentId: string; index?: number } = insertionPoint(tree, moduleId);
	const over = at && tree.nodes[at.overId];
	if (at && over) {
		const inside = at.position === "inside" && canHaveChildren(over.moduleId) && !over.locked;
		const parentId = inside ? over.id : (over.parentId ?? tree.rootNodeId);
		const parent = tree.nodes[parentId]!;
		const index = inside ? undefined : parent.children.indexOf(over.id) + (at.position === "after" ? 1 : 0);
		if (allowedParent(tree, moduleId, parentId) && !parent.locked) target = { parentId, index };
	}
	let first = "";
	mutate((draft) => {
		nodes.forEach((n, i) => {
			const id = fromJson(draft, n, target.parentId, target.index === undefined ? undefined : target.index + i);
			first ||= id;
		});
	});
	$selected.set(first);
}

export const addPreset = (preset: Preset, at?: { overId: string; position: DropPosition }): void =>
	addJson([presetJson(preset)], at);

export function dropNode(draggedId: string, overId: string, position: DropPosition): boolean {
	const tree = $tree.get();
	const dragged = tree.nodes[draggedId];
	const target = resolveDrop(tree, draggedId, overId, position, canHaveChildren);
	if (!dragged || !target || !allowedParent(tree, dragged.moduleId, target.parentId)) return false;
	mutate((draft) => moveNode(draft, draggedId, target.parentId, target.index));
	return true;
}

const selectedNode = () => {
	const tree = $tree.get();
	const node = tree.nodes[$selected.get() ?? ""];
	return node && node.id !== tree.rootNodeId ? node : undefined;
};

export function removeSelected(): void {
	const node = selectedNode();
	if (!node || node.locked) return;
	mutate((draft) => deleteNode(draft, node.id));
}

export function duplicateSelected(): void {
	const node = selectedNode();
	if (!node) return;
	let copy = "";
	mutate((draft) => (copy = duplicateNode(draft, node.id)));
	$selected.set(copy);
}

export function wrapSelected(): void {
	const node = selectedNode();
	if (!node || node.moduleId === "markdown") return;
	mutate((draft) => wrapNode(draft, node.id, createNode("container", { tag: "div" })));
}

/** Move the selected node one place up or down among its siblings. */
export function nudgeSelected(delta: -1 | 1): void {
	const tree = $tree.get();
	const node = selectedNode();
	const parent = tree.nodes[node?.parentId ?? ""];
	if (!node || !parent || node.locked) return;
	const index = parent.children.indexOf(node.id) + delta;
	if (index < 0 || index >= parent.children.length) return;
	mutate((draft) => moveNode(draft, node.id, parent.id, index));
}

export function selectParent(): void {
	const node = selectedNode();
	if (node?.parentId && node.parentId !== $tree.get().rootNodeId) $selected.set(node.parentId);
}

// Clipboard: kept in localStorage so it works across entries and tabs, like Instatic's.
const CLIPBOARD = "wuppy.visual.clipboard";
const readJson = (raw: string | null): unknown => {
	try {
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
};

export function copySelected(): boolean {
	const node = selectedNode();
	if (!node) return false;
	localStorage.setItem(CLIPBOARD, JSON.stringify(toJson($tree.get(), node.id)));
	return true;
}

export function cutSelected(): void {
	if (selectedNode()?.locked) return;
	if (copySelected()) removeSelected();
}

export function paste(): boolean {
	const parsed = nodeJsonSchema.safeParse(readJson(localStorage.getItem(CLIPBOARD)));
	if (!parsed.success) return false;
	const sel = selectedNode();
	addJson([parsed.data], sel && { overId: sel.id, position: "after" });
	return true;
}

/** Styles of the current target (selected node or library selector) in the current context and state. */
export function setStyle(prop: string, value: string | undefined): void {
	const key = overrideKey($context.get(), $state.get());
	const patch = (styles: Styles) => {
		const out = { ...styles };
		if (value === undefined || !value.trim()) delete out[prop];
		else out[prop] = value;
		return out;
	};
	const target = $target.get();
	if (target)
		return mutateVisual((v) => {
			const s = v.selectors.find((x) => x.id === target);
			if (!s) return;
			if (!key) s.styles = patch(s.styles);
			else {
				s.overrides[key] = patch(s.overrides[key] ?? {});
				if (!Object.keys(s.overrides[key]).length) delete s.overrides[key];
			}
		}, `sel:${target}:${key}:${prop}`);
	const node = selectedNode();
	if (!node) return;
	mutate(
		(d) =>
			key ? updateNodeOverrides(d, node.id, key, { [prop]: value }) : updateNodeStyles(d, node.id, { [prop]: value }),
		`${node.id}:${key}:${prop}`,
	);
}

// Selector library
const uniqueId = (base: string, taken: string[]) => {
	const root =
		base
			.replace(/[^a-z0-9-]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 32) || "item";
	let id = root;
	for (let i = 2; taken.includes(id); i++) id = `${root}-${i}`;
	return id;
};

/** Adds `.name`/`h1`/`.a > b` to the library unless it is there; returns its id. */
export function ensureSelector(selector: string): string {
	const s = selector.trim();
	const found = $visual.get().selectors.find((x) => x.selector === s);
	if (found) return found.id;
	const id = uniqueId(
		s.replace(/^\./, ""),
		$visual.get().selectors.map((x) => x.id),
	);
	mutateVisual((v) => void v.selectors.push({ id, selector: s, styles: {}, overrides: {} }));
	return id;
}

export function setClasses(id: string, classes: string[]): void {
	const value = [...new Set(classes.filter((c) => /^-?[A-Za-z_][\w-]*$/.test(c) && !c.startsWith("ve-")))].join(" ");
	mutate((d) => updateNodeProps(d, id, { class: value }));
}

// Saved layouts and Visual Components
export function saveLayout(name: string): void {
	const node = selectedNode();
	if (!node || !name.trim()) return;
	const json = toJson($tree.get(), node.id);
	mutateVisual(
		(v) =>
			void v.layouts.push({
				id: uniqueId(
					name.toLowerCase(),
					v.layouts.map((l) => l.id),
				),
				name: name.trim(),
				nodes: [json],
			}),
	);
}

/** Turns the selected subtree into a Visual Component and puts an instance of it in its place. */
export function componentize(name: string): void {
	const node = selectedNode();
	if (!node || node.moduleId === "markdown" || !/^[A-Za-z][\w -]{0,39}$/.test(name.trim())) return;
	let ref = "";
	mutateBoth((tree, visual) => {
		const id = uniqueId(
			name.toLowerCase(),
			visual.components.map((c) => c.id),
		);
		visual.components.push({ id, name: name.trim(), params: [], nodes: [toJson(tree, node.id)] });
		const parent = tree.nodes[node.parentId!]!;
		const index = parent.children.indexOf(node.id);
		deleteNode(tree, node.id);
		const instance = createNode("ref", { ref: id, name: name.trim() });
		insertNode(tree, instance, parent.id, index);
		ref = instance.id;
	});
	$selected.set(ref);
}

export function insertComponent(id: string, at?: { overId: string; position: DropPosition }): void {
	const c = $visual.get().components.find((x) => x.id === id);
	if (c) addJson([{ moduleId: "ref", props: { ref: c.id, name: c.name }, styles: {}, children: [] }], at);
}

/** Replaces an instance with a plain copy of the component's nodes (its slot content moved in), like Instatic's detach. */
export function detachSelected(): void {
	const node = selectedNode();
	const component = node && $visual.get().components.find((c) => c.id === node.props.ref);
	if (!node || node.moduleId !== "ref" || !component) return;
	mutate((tree) => {
		const parent = tree.nodes[node.parentId!]!;
		let index = parent.children.indexOf(node.id);
		const build = (json: NodeJson, parentId: string, at?: number): number => {
			if (json.moduleId === "slot") {
				let i = at ?? tree.nodes[parentId]!.children.length;
				for (const child of tree.nodes[node.id]!.children.slice()) moveNode(tree, child, parentId, i++);
				return i - (at ?? i);
			}
			const n = createNode(json.moduleId, json.props, json.styles);
			n.overrides = structuredClone(json.overrides ?? {});
			if (Object.keys(n.overrides).length) n.key = newKey();
			n.label = json.label;
			insertNode(tree, n, parentId, at);
			for (const child of json.children) build(child, n.id);
			return 1;
		};
		for (const json of expandComponent(component, paramsOf(node.props))) index += build(json, parent.id, index);
		deleteNode(tree, node.id);
	});
}

export function editComponent(id: string): void {
	const component = $visual.get().components.find((c) => c.id === id);
	if (!component || $editingComponent.get()) return;
	$editingComponent.set({ id, page: $tree.get() });
	const tree = emptyTree();
	for (const json of component.nodes) fromJson(tree, json, tree.rootNodeId);
	$tree.set(tree);
	$selected.set(null);
	$target.set(null);
	resetHistory(); // shortcut: component edits have their own undo history, dropped when you go back to the page
}

export function finishComponent(): void {
	const editing = $editingComponent.get();
	if (!editing) return;
	const tree = $tree.get();
	const nodes = tree.nodes[tree.rootNodeId]!.children.map((id) => toJson(tree, id));
	$editingComponent.set(null);
	$tree.set(editing.page);
	$selected.set(null);
	resetHistory();
	mutateVisual((v) => {
		const c = v.components.find((x) => x.id === editing.id);
		if (c) c.nodes = nodes;
	});
}

// Favorites and recents of the inserter (Instatic keeps them per user, so do we: in this browser).
const listStore = (key: string) => {
	const store = atom<string[]>(
		((readJson(localStorage.getItem(key)) as string[] | null) ?? []).filter((x) => typeof x === "string"),
	);
	store.listen((v) => localStorage.setItem(key, JSON.stringify(v)));
	return store;
};
export const $favorites = listStore("wuppy.visual.favorites");
export const $recents = listStore("wuppy.visual.recents");
export const toggleFavorite = (id: string) =>
	$favorites.set($favorites.get().includes(id) ? $favorites.get().filter((x) => x !== id) : [...$favorites.get(), id]);
export const pushRecent = (id: string) => $recents.set([id, ...$recents.get().filter((x) => x !== id)].slice(0, 12));

export async function saveVisual(): Promise<boolean> {
	const data = $visual.get();
	try {
		await apiData("PUT", "/api/data/visual", { data });
		$visualSaved.set(JSON.stringify(data));
		$visualError.set(null);
		return true;
	} catch (e) {
		$visualError.set((e as Error).message);
		return false;
	}
}

/** Saves the site data first (the page's CSS refers to it), then the entry. */
export async function saveAll(): Promise<boolean> {
	if ($editingComponent.get()) finishComponent();
	if ($visualDirty.get() && !(await saveVisual())) return false;
	return $dirty.get() ? save() : true;
}

/**
 * Rewrites every other entry that uses a Visual Component with the components as they are now (Instatic republishes
 * pages when a component changes; here the markup lives in each entry, so each one is saved again).
 */
export async function updateInstances(): Promise<{ updated: number; failed: string[] }> {
	const current = $doc.get();
	const components = $visual.get().components;
	const collections = await apiData<{ name: string }[]>("GET", "/api/collections");
	let updated = 0;
	const failed: string[] = [];
	for (const { name } of collections) {
		const rows = await apiData<{ slug: string }[]>(
			"GET",
			`/api/content/${name}?q=${encodeURIComponent('data-ve="ref"')}`,
		);
		for (const { slug } of rows) {
			if (current && current.collection === name && current.slug === slug) continue;
			try {
				const { data: entry, etag } = await api<{
					data: { data: Record<string, unknown>; body: string };
					etag?: string;
				}>("GET", `/api/content/${name}/${slugPath(slug)}`);
				const body = serialize(parse(entry.body), components);
				if (body === entry.body) continue;
				await api(
					"PUT",
					`/api/content/${name}/${slugPath(slug)}`,
					{ data: entry.data, body, message: "Update Visual Components" },
					etag ? { "If-Match": etag } : {},
				);
				updated++;
			} catch (e) {
				failed.push(`${name}/${slug}: ${(e as Error).message}`);
			}
		}
	}
	return { updated, failed };
}
