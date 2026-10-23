/**
 * The visual editor's page tree: one flat map of nodes plus a root id. Adapted from Instatic's `NodeTree` and
 * `page-tree/mutations.ts` (MIT, © 2026 David Babinec). The mutations work on a draft the caller already copied
 * (see `store.ts`), so they may mutate freely; `children` is the source of truth and `parentId` a cache of it.
 */

import type { NodeJson, Overrides, Styles } from "@wuppy/visual-editor";

export type { Styles };

export interface VNode {
	id: string;
	moduleId: string;
	props: Record<string, string>;
	styles: Styles;
	/** Breakpoint/condition/state styles, keyed by `overrideKey` (written as `data-ve-r` plus a `ve-<key>` class). */
	overrides: Overrides;
	/** Stable id of the node's `ve-<key>` class; set once it has overrides. */
	key?: string;
	children: string[];
	parentId: string | null;
	label?: string;
	locked?: boolean;
	hidden?: boolean;
}

export interface NodeTree {
	nodes: Record<string, VNode>;
	rootNodeId: string;
}

let seq = 0;
/** Ids live only in the editor (the MDX does not store them), so a session-unique counter is enough. */
export const newId = (): string => `n${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const newKey = (): string => Math.random().toString(36).slice(2, 8).padEnd(6, "0");

export function createNode(moduleId: string, props: Record<string, string> = {}, styles: Styles = {}): VNode {
	return {
		id: newId(),
		moduleId,
		props: { ...props },
		styles: { ...styles },
		overrides: {},
		children: [],
		parentId: null,
	};
}

const copyOverrides = (o: Overrides): Overrides => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { ...v }]));

export function emptyTree(): NodeTree {
	const root = createNode("body");
	return { nodes: { [root.id]: root }, rootNodeId: root.id };
}

/** A copy deep enough that mutations never touch the original (an undo step). */
export function cloneTree(tree: NodeTree): NodeTree {
	const nodes: Record<string, VNode> = {};
	for (const [id, n] of Object.entries(tree.nodes))
		nodes[id] = {
			...n,
			props: { ...n.props },
			styles: { ...n.styles },
			overrides: copyOverrides(n.overrides),
			children: [...n.children],
		};
	return { nodes, rootNodeId: tree.rootNodeId };
}

function get(tree: NodeTree, id: string): VNode {
	const node = tree.nodes[id];
	if (!node) throw new Error(`[visual-editor] node "${id}" not found`);
	return node;
}

export function isAncestor(tree: NodeTree, ancestorId: string, id: string): boolean {
	for (let cur: string | null | undefined = id; cur; cur = tree.nodes[cur]?.parentId)
		if (cur === ancestorId) return true;
	return false;
}

export function subtreeIds(tree: NodeTree, id: string): string[] {
	const out = [id];
	for (let i = 0; i < out.length; i++) out.push(...(tree.nodes[out[i]!]?.children ?? []));
	return out;
}

export function insertNode(tree: NodeTree, node: VNode, parentId: string, index?: number): void {
	if (tree.nodes[node.id]) throw new Error(`[visual-editor] node "${node.id}" already exists`);
	const parent = get(tree, parentId);
	tree.nodes[node.id] = node;
	node.parentId = parentId;
	parent.children.splice(index ?? parent.children.length, 0, node.id);
}

export function deleteNode(tree: NodeTree, id: string): void {
	if (id === tree.rootNodeId) throw new Error("[visual-editor] cannot delete the root");
	const parent = tree.nodes[get(tree, id).parentId ?? ""];
	if (parent) parent.children = parent.children.filter((c) => c !== id);
	for (const sub of subtreeIds(tree, id)) delete tree.nodes[sub];
}

export function updateNodeProps(tree: NodeTree, id: string, patch: Record<string, string | undefined>): void {
	const node = get(tree, id);
	for (const [k, v] of Object.entries(patch)) {
		if (v === undefined || v === "") delete node.props[k];
		else node.props[k] = v;
	}
}

export function updateNodeStyles(tree: NodeTree, id: string, patch: Record<string, string | undefined>): void {
	const node = get(tree, id);
	for (const [k, v] of Object.entries(patch)) {
		if (v === undefined || v.trim() === "") delete node.styles[k];
		else node.styles[k] = v;
	}
}

/** Set or clear styles of one context/state; the node gets its `ve-<key>` class on first use. */
export function updateNodeOverrides(
	tree: NodeTree,
	id: string,
	key: string,
	patch: Record<string, string | undefined>,
): void {
	const node = get(tree, id);
	const styles = { ...node.overrides[key] };
	for (const [k, v] of Object.entries(patch)) {
		if (v === undefined || v.trim() === "") delete styles[k];
		else styles[k] = v;
	}
	if (Object.keys(styles).length) node.overrides[key] = styles;
	else delete node.overrides[key];
	if (Object.keys(node.overrides).length) node.key ??= newKey();
}

export function renameNode(tree: NodeTree, id: string, label: string): void {
	get(tree, id).label = label.trim() || undefined;
}

export function toggleNodeLocked(tree: NodeTree, id: string): void {
	const node = get(tree, id);
	node.locked = !node.locked || undefined;
}

export function toggleNodeHidden(tree: NodeTree, id: string): void {
	const node = get(tree, id);
	node.hidden = !node.hidden || undefined;
}

export function moveNode(tree: NodeTree, id: string, newParentId: string, newIndex: number): void {
	const moved = get(tree, id);
	if (id === tree.rootNodeId) throw new Error("[visual-editor] cannot move the root");
	if (isAncestor(tree, id, newParentId)) throw new Error("[visual-editor] cannot move a node into itself");
	const newParent = get(tree, newParentId);
	const oldParent = tree.nodes[moved.parentId ?? ""];
	if (oldParent) oldParent.children = oldParent.children.filter((c) => c !== id);
	newParent.children.splice(Math.max(0, Math.min(newIndex, newParent.children.length)), 0, id);
	moved.parentId = newParentId;
}

/** Copies a node and everything inside it right after the original; returns the copy's id. */
export function duplicateNode(tree: NodeTree, id: string): string {
	const parent = get(tree, get(tree, id).parentId ?? "");
	const map = new Map(subtreeIds(tree, id).map((old) => [old, newId()]));
	for (const [old, fresh] of map) {
		const n = get(tree, old);
		tree.nodes[fresh] = {
			...n,
			id: fresh,
			props: { ...n.props },
			styles: { ...n.styles },
			overrides: copyOverrides(n.overrides),
			key: n.key && newKey(), // a copy gets its own class, or editing one would restyle both
			children: n.children.map((c) => map.get(c)!),
			parentId: map.get(n.parentId ?? "") ?? parent.id,
		};
	}
	const copy = map.get(id)!;
	parent.children.splice(parent.children.indexOf(id) + 1, 0, copy);
	return copy;
}

/** Puts a new container where the node was, with the node inside it; returns the container's id. */
export function wrapNode(tree: NodeTree, id: string, wrapper: VNode): string {
	const parent = get(tree, get(tree, id).parentId ?? "");
	tree.nodes[wrapper.id] = wrapper;
	parent.children[parent.children.indexOf(id)] = wrapper.id;
	wrapper.parentId = parent.id;
	wrapper.children.push(id);
	get(tree, id).parentId = wrapper.id;
	return wrapper.id;
}

export type DropPosition = "before" | "after" | "inside";

/** Where a dragged node lands, or null when the drop is not allowed (Instatic's `resolvePageTreeDropTarget`). */
export function resolveDrop(
	tree: NodeTree,
	draggedId: string,
	overId: string,
	position: DropPosition,
	canHaveChildren: (moduleId: string) => boolean,
): { parentId: string; index: number } | null {
	const dragged = tree.nodes[draggedId];
	const over = tree.nodes[overId];
	if (!dragged || !over || dragged.locked || draggedId === tree.rootNodeId || draggedId === overId) return null;
	let parentId: string;
	let index: number;
	if (position === "inside") {
		if (!canHaveChildren(over.moduleId) || over.locked) return null;
		parentId = overId;
		index = over.children.length;
	} else {
		const parent = tree.nodes[over.parentId ?? ""];
		if (!parent || parent.locked) return null;
		parentId = parent.id;
		index = parent.children.indexOf(overId) + (position === "after" ? 1 : 0);
	}
	if (isAncestor(tree, draggedId, parentId)) return null;
	// Removing the node first shifts later siblings left by one.
	const from = tree.nodes[parentId]!.children.indexOf(draggedId);
	if (dragged.parentId === parentId && from !== -1 && from < index) index--;
	if (dragged.parentId === parentId && from === index) return null;
	return { parentId, index };
}

/** A subtree as plain data (clipboard, saved layouts, Visual Components). */
export function toJson(tree: NodeTree, id: string): NodeJson {
	const n = get(tree, id);
	return {
		moduleId: n.moduleId,
		props: { ...n.props },
		styles: { ...n.styles },
		...(Object.keys(n.overrides).length ? { overrides: copyOverrides(n.overrides) } : {}),
		...(n.label ? { label: n.label } : {}),
		...(n.hidden ? { hidden: true } : {}),
		...(n.locked ? { locked: true } : {}),
		children: n.children.map((c) => toJson(tree, c)),
	};
}

/** Inserts plain data as new nodes (fresh ids and classes); returns the new top node's id. */
export function fromJson(tree: NodeTree, json: NodeJson, parentId: string, index?: number): string {
	const node = createNode(json.moduleId, json.props, json.styles);
	node.overrides = copyOverrides(json.overrides ?? {});
	if (Object.keys(node.overrides).length) node.key = newKey();
	node.label = json.label;
	node.hidden = json.hidden;
	node.locked = json.locked;
	insertNode(tree, node, parentId, index);
	for (const child of json.children) fromJson(tree, child, node.id);
	return node.id;
}
