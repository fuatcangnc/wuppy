import { atom } from "nanostores";
import { apiData } from "../../lib/api.ts";
import { moduleOf, nodeName } from "./modules.ts";
import { $doc } from "../../stores/editor.ts";
import { $selected, $tree, addJson, mutate } from "./store.ts";
import { importHtml } from "./markdown.ts";
import { parseStyle, printStyle, withClassValue } from "./tailwind.ts";
import {
	$themeElement,
	applyThemeEdit,
	codePath,
	copiesOf,
	type ThemeEdit,
	type ThemeElement,
} from "./theme-element.ts";
import { deleteNode, updateNodeProps, updateNodeStyles } from "./tree.ts";

/**
 * The editor's AI panel: the user picks elements (blocks of the body or the theme's own markup), asks for a change, and
 * the server's model answers with edits (core's ai/edit.ts) that are applied here like manual edits: blocks in one undo
 * step, theme elements through the theme file API.
 */

export type AiPick = { kind: "block"; id: string } | { kind: "theme"; el: ThemeElement };

export interface ElementPatch {
	ref: string;
	text?: string;
	tag?: string;
	classes?: string;
	styles?: Record<string, string>;
	attrs?: Record<string, string | null>;
}

export interface AiInsertion {
	html: string;
	/** A picked element's ref; the new section goes after it. Omitted: the end of the page. */
	after?: string;
}

export const $aiPicks = atom<AiPick[]>([]);
/** While on, each element picked on the canvas or in Layers is added to (or, if there already, removed from) the picks. */
export const $aiPicking = atom(false);

export const pickKey = (p: AiPick) => (p.kind === "block" ? `b:${p.id}` : `t:${p.el.file}:${p.el.loc}`);

export function togglePick(p: AiPick): void {
	const key = pickKey(p);
	const list = $aiPicks.get();
	$aiPicks.set(list.some((x) => pickKey(x) === key) ? list.filter((x) => pickKey(x) !== key) : [...list, p]);
}

$selected.listen((id) => {
	if ($aiPicking.get() && id && id !== $tree.get().rootNodeId) togglePick({ kind: "block", id });
});
let lastTheme = "";
$themeElement.listen((el) => {
	const key = el ? `${el.file}:${el.loc}` : "";
	// An edit of the same element reports it again; only a new pick counts.
	if ($aiPicking.get() && el && key !== lastTheme) togglePick({ kind: "theme", el });
	lastTheme = key;
});

/** What the AI works on: the picks, or else the element selected now. */
export function aiTargets(): AiPick[] {
	const picks = $aiPicks.get();
	if (picks.length) return picks;
	const id = $selected.get();
	if (id && id !== $tree.get().rootNodeId) return [{ kind: "block", id }];
	const el = $themeElement.get();
	return el ? [{ kind: "theme", el }] : [];
}

export function pickLabel(p: AiPick): string {
	if (p.kind === "theme") return p.el.tag;
	const node = $tree.get().nodes[p.id];
	return node ? nodeName(node) : "Removed";
}

const clip = (s: string) => s.slice(0, 1500);
const classList = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

/** How an element is shown to the model; `ref` is how its edits name it. */
export function describePick(p: AiPick, ref: string) {
	if (p.kind === "theme") {
		const { el } = p;
		return {
			ref,
			kind: "theme" as const,
			tag: el.tag,
			text: el.text === null ? null : clip(el.text),
			classes: el.cls,
			styles: parseStyle(el.style),
			attrs: Object.fromEntries(Object.entries(el.attrs).map(([k, v]) => [k, clip(v)])),
			tailwind: el.tailwind,
			children: [...(copiesOf(el)[0]?.children ?? [])]
				.slice(0, 50)
				.map((c) => ({ tag: c.tagName.toLowerCase(), classes: clip(c.getAttribute("class") ?? "") })),
		};
	}
	const node = $tree.get().nodes[p.id];
	const def = node && moduleOf(node);
	return {
		ref,
		kind: "block" as const,
		tag: node && def ? def.tag(node.props) : "div",
		text: node && def?.text ? clip(node.props[def.text] ?? "") : null,
		classes: node?.props.class ?? "",
		styles: node?.styles ?? {},
	};
}

/** The theme file edits one patch makes: tag, text, then class/style/attributes in one write. */
export function themeEdits(el: ThemeElement, patch: ElementPatch): ThemeEdit[] {
	const edits: ThemeEdit[] = [];
	if (patch.tag && patch.tag !== el.tag) edits.push({ action: "tag", name: patch.tag });
	if (patch.text !== undefined && el.text !== null && patch.text !== el.text)
		// Asking the AI for new text means replacing it, even when the theme fills it in by code.
		edits.push({ action: "text", value: patch.text, code: true });
	const attrs: Record<string, string | null> = { ...patch.attrs };
	const styles = Object.entries(patch.styles ?? {});
	if (patch.classes !== undefined || (styles.length && el.tailwind)) {
		let classes = (patch.classes ?? el.cls).split(/\s+/).filter(Boolean);
		if (el.tailwind) for (const [prop, value] of styles) classes = withClassValue(classes, prop, "", value);
		attrs.class = classes.join(" ") || null;
	}
	if (styles.length && !el.tailwind)
		attrs.style = printStyle({ ...parseStyle(el.style), ...Object.fromEntries(styles) }) || null;
	if (Object.keys(attrs).length) edits.push({ action: "attrs", attrs });
	return edits;
}

/** What one AI answer changed, to put it back: the blocks' props and styles before, each theme file before and after. */
export interface AiUndo {
	blocks: { id: string; props: Record<string, string>; styles: unknown }[];
	files: { path: string; before: string; after: string }[];
	/** Root ids of sections the AI added; undo removes their subtrees. */
	inserted: string[];
}

// shortcut: reads every theme source file to snapshot the few it edits; add a one-file read endpoint if themes grow large.
const themeFiles = async (paths: Set<string>) => {
	const source = await apiData<{ files: { path: string; content: string }[] } | null>("GET", "/api/themes/files");
	return new Map((source?.files ?? []).filter((f) => paths.has(f.path)).map((f) => [f.path, f.content]));
};

/** Puts back what an AI answer changed. Refuses a theme file edited again since, so later work is not lost. */
export async function undoAiEdits(undo: AiUndo): Promise<void> {
	if (undo.files.length) {
		const now = await themeFiles(new Set(undo.files.map((f) => f.path)));
		const changed = undo.files.find((f) => now.get(f.path) !== f.after);
		if (changed) throw new Error(`${changed.path} changed since; undo it in Code view`);
		for (const f of undo.files) await apiData("PUT", "/api/themes/file", { path: f.path, content: f.before });
		const paths = new Set(undo.files.map((f) => f.path));
		const stale = (el: ThemeElement) => paths.has(codePath(el.file));
		// Their locations may have moved back; pick them again.
		$aiPicks.set($aiPicks.get().filter((x) => x.kind !== "theme" || !stale(x.el)));
		const shown = $themeElement.get();
		if (shown && stale(shown)) $themeElement.set(null);
	}
	if (undo.blocks.length)
		mutate((d) => {
			for (const b of undo.blocks) {
				const node = d.nodes[b.id];
				if (!node) continue;
				node.props = structuredClone(b.props);
				node.styles = structuredClone(b.styles) as typeof node.styles;
			}
		}, "ai-undo");
	if (undo.inserted.length)
		mutate((d) => {
			for (const id of undo.inserted) if (d.nodes[id]) deleteNode(d, id);
		}, "ai-undo");
}

/** The site's content wrapper around a generated section's children, unless the model already used one. */
function withContainer(html: string, containerClass?: string): string {
	if (!containerClass) return html;
	const doc = new DOMParser().parseFromString(html, "text/html");
	const roots = [...doc.body.children];
	if (!roots.length) return html;
	const contained = (el: Element) => {
		const list = classList(el);
		return list.includes(containerClass) || list.some((name) => name === "container" || name.startsWith("max-w-"));
	};
	for (const root of roots) {
		if (contained(root) || [...root.children].some(contained) || [...root.querySelectorAll("*")].some(contained))
			continue;
		const wrapper = doc.createElement("div");
		wrapper.className = containerClass;
		while (root.firstChild) wrapper.appendChild(root.firstChild);
		root.appendChild(wrapper);
	}
	return doc.body.innerHTML;
}

const position = (el: ThemeElement) => el.loc.split(":").map(Number) as [number, number];

/** Applies the model's edits; returns how many elements changed and what failed. */
export async function applyAiEdits(
	targets: AiPick[],
	patches: ElementPatch[],
	insertions: AiInsertion[] = [],
	containerClass?: string,
): Promise<{ changed: number; inserted: number; failed: string[]; undo: AiUndo }> {
	const byRef = new Map(targets.map((t, i) => [`e${i + 1}`, t]));
	let changed = 0;
	const failed: string[] = [];
	const blocks = patches.flatMap((p) => {
		const t = byRef.get(p.ref);
		return t?.kind === "block" && $tree.get().nodes[t.id] ? [{ id: t.id, p }] : [];
	});
	const undo: AiUndo = {
		blocks: blocks.map(({ id }) => {
			const node = $tree.get().nodes[id]!;
			return { id, props: structuredClone(node.props), styles: structuredClone(node.styles) };
		}),
		files: [],
		inserted: [],
	};
	if (blocks.length) {
		mutate((d) => {
			for (const { id, p } of blocks) {
				const node = d.nodes[id];
				if (!node) continue;
				const def = moduleOf(node);
				if (p.text !== undefined && def.text) updateNodeProps(d, id, { [def.text]: p.text });
				if (p.classes !== undefined) updateNodeProps(d, id, { class: p.classes.trim() });
				if (p.styles)
					updateNodeStyles(
						d,
						id,
						Object.fromEntries(Object.entries(p.styles).map(([k, v]) => [k, v.trim() || undefined])),
					);
			}
		}, "ai");
		changed += blocks.length;
	}
	let inserted = 0;
	for (const insertion of insertions) {
		const nodes = importHtml(withContainer(insertion.html, containerClass));
		if (!nodes.length) {
			failed.push("New section was empty");
			continue;
		}
		const after = insertion.after ? byRef.get(insertion.after) : undefined;
		const at =
			after?.kind === "block" && $tree.get().nodes[after.id]
				? { overId: after.id, position: "after" as const }
				: { overId: $tree.get().rootNodeId, position: "inside" as const };
		const ids = addJson(nodes, at);
		if (ids.length) {
			undo.inserted.push(...ids);
			inserted++;
		}
	}

	// Later spots in a file first, so an edit does not move the elements still to be edited.
	const themes = patches
		.flatMap((p) => {
			const t = byRef.get(p.ref);
			return t?.kind === "theme" ? [{ el: t.el, p }] : [];
		})
		.toSorted((a, b) => {
			const [la, ca] = position(a.el);
			const [lb, cb] = position(b.el);
			return a.el.file === b.el.file ? lb - la || cb - ca : 0;
		});
	const paths = new Set(themes.map((t) => codePath(t.el.file)));
	const before = paths.size ? await themeFiles(paths) : new Map<string, string>();
	for (const { el, p } of themes) {
		let current: ThemeElement | null = el;
		try {
			for (const edit of themeEdits(el, p)) if (current) current = await applyThemeEdit(current, edit);
			changed++;
		} catch (e) {
			failed.push(`<${el.tag}>: ${(e as Error).message}`);
		}
		const key = `${el.file}:${el.loc}`;
		const after = current;
		$aiPicks.set(
			$aiPicks
				.get()
				.flatMap((x): AiPick[] =>
					x.kind === "theme" && `${x.el.file}:${x.el.loc}` === key
						? after
							? [{ kind: "theme", el: after }]
							: []
						: [x],
				),
		);
		const shown = $themeElement.get();
		if (shown && `${shown.file}:${shown.loc}` === key) {
			lastTheme = after ? `${after.file}:${after.loc}` : "";
			$themeElement.set(after);
		}
	}
	if (paths.size) {
		const after = await themeFiles(paths);
		undo.files = [...before].flatMap(([path, content]) => {
			const now = after.get(path);
			return now !== undefined && now !== content ? [{ path, before: content, after: now }] : [];
		});
	}
	return { changed, inserted, failed, undo };
}

export interface AiTurn {
	role: "user" | "assistant";
	content: string;
	/** What was applied or failed; shown under the reply and told to the AI on the next turn. */
	note?: string;
	failed?: boolean;
	/** Kept only while the page is open (file copies are too big for the saved chats). */
	undo?: AiUndo;
	undone?: boolean;
}

export interface AiChat {
	id: string;
	title: string;
	turns: AiTurn[];
	at: number;
}

const CHATS = "wuppy.visual.ai-chats";

function readChats(): AiChat[] {
	try {
		const list: unknown = JSON.parse(localStorage.getItem(CHATS) ?? "[]");
		return Array.isArray(list)
			? list.filter((c: AiChat) => typeof c?.id === "string" && typeof c.title === "string" && Array.isArray(c.turns))
			: [];
	} catch (e) {
		if (!(e instanceof SyntaxError)) throw e;
		return [];
	}
}

/** Past AI chats, newest first, kept in this browser like the inserter's recents. */
export const $aiChats = atom<AiChat[]>(readChats());
$aiChats.listen((v) => localStorage.setItem(CHATS, JSON.stringify(v)));

export function saveChat(chat: AiChat): void {
	chat = { ...chat, turns: chat.turns.map((t) => ({ ...t, undo: undefined })) };
	$aiChats.set([chat, ...$aiChats.get().filter((c) => c.id !== chat.id)].slice(0, 30));
}

/** The top-level blocks and their classes: enough for the model to match the page's design without a pick. */
function pageContext() {
	const tree = $tree.get();
	const root = tree.nodes[tree.rootNodeId];
	const doc = $doc.get();
	const sections = (root?.children ?? []).flatMap((id) => {
		const node = tree.nodes[id];
		if (!node) return [];
		const def = moduleOf(node);
		return [
			{
				tag: def.tag(node.props),
				classes: (node.props.class ?? "").slice(0, 1200),
				...(def.text ? { text: String(node.props[def.text] ?? "").slice(0, 300) } : {}),
			},
		];
	});
	const pageClasses = sections.flatMap((section) => (section.classes ?? "").split(/\s+/).filter(Boolean));
	const candidates = pageClasses.filter((name) => /(^|-)container($|-)/.test(name) || name.startsWith("max-w-"));
	const containerClass = candidates.find((name) => /container|max-w-/.test(name)) ?? candidates[0];
	return {
		title: doc && typeof doc.data.title === "string" ? doc.data.title : undefined,
		sections: sections.slice(0, 40),
		...(containerClass ? { containerClass } : {}),
	};
}

export async function askAi(model: string, prompt: string, history: AiTurn[]) {
	const targets = aiTargets();
	const out = await apiData<{
		reply: string;
		edits: ElementPatch[];
		insertions?: AiInsertion[];
		containerClass?: string;
	}>("POST", "/api/ai/edit", {
		model,
		prompt,
		elements: targets.map((t, i) => describePick(t, `e${i + 1}`)),
		page: pageContext(),
		history: history.slice(-10).map(({ role, content, note }) => ({
			role,
			content: (note ? `${content}\n[Editor: ${note}]` : content).slice(0, 5000),
		})),
	});
	return {
		reply: out.reply,
		...(await applyAiEdits(targets, out.edits, out.insertions ?? [], out.containerClass)),
	};
}
