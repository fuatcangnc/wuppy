import {
	Code,
	Component,
	Diamond,
	File,
	Heading,
	Image,
	Layout,
	Link,
	List,
	Minus,
	Quote,
	Square,
	Text,
	Video,
} from "@react-zero-ui/icon-sprite";
import type { Styles, VNode } from "./tree.ts";

/** A property control in the Properties panel. */
export interface Field {
	key: string;
	label: string;
	type: "text" | "textarea" | "select" | "url" | "image";
	options?: readonly string[];
}

/** What a node is: its HTML tag, which props become attributes, and how it is edited. Mirrors Instatic's modules. */
export interface ModuleDef {
	id: string;
	label: string;
	tag: (props: Record<string, string>) => string;
	/** Can hold other nodes. */
	container?: boolean;
	/** The prop shown as the element's text (edited inline on the canvas). */
	text?: string;
	/** Props written as HTML attributes. */
	attrs?: readonly string[];
	fields: readonly Field[];
	defaults?: Record<string, string>;
	styles?: Styles;
}

const CONTAINER_TAGS = ["section", "div", "header", "footer", "article", "aside", "main", "nav"] as const;
const LEVELS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
const classField: Field = { key: "class", label: "CSS classes", type: "text" };

const defs: ModuleDef[] = [
	{ id: "body", label: "Page", tag: () => "div", container: true, fields: [] },
	{
		id: "container",
		label: "Container",
		tag: (p) => ((CONTAINER_TAGS as readonly string[]).includes(p.tag ?? "") ? p.tag! : "section"),
		container: true,
		fields: [{ key: "tag", label: "Element", type: "select", options: CONTAINER_TAGS }, classField],
		defaults: { tag: "section" },
		styles: { padding: "32px 16px" },
	},
	{
		id: "heading",
		label: "Heading",
		tag: (p) => ((LEVELS as readonly string[]).includes(p.level ?? "") ? p.level! : "h2"),
		text: "text",
		fields: [{ key: "level", label: "Level", type: "select", options: LEVELS }, classField],
		defaults: { level: "h2", text: "Heading" },
	},
	{
		id: "text",
		label: "Text",
		tag: () => "p",
		text: "text",
		fields: [classField],
		defaults: { text: "Write something here." },
	},
	{
		id: "button",
		label: "Button",
		tag: () => "a",
		text: "text",
		attrs: ["href"],
		fields: [{ key: "href", label: "Link", type: "url" }, classField],
		defaults: { text: "Click me", href: "/" },
		styles: {
			display: "inline-block",
			padding: "10px 20px",
			"background-color": "#111827",
			color: "#ffffff",
			"border-radius": "6px",
			"text-decoration": "none",
		},
	},
	{
		id: "link",
		label: "Link",
		tag: () => "a",
		text: "text",
		attrs: ["href"],
		fields: [{ key: "href", label: "Link", type: "url" }, classField],
		defaults: { text: "Link", href: "/" },
	},
	{
		id: "image",
		label: "Image",
		tag: () => "img",
		attrs: ["src", "alt"],
		fields: [
			{ key: "src", label: "Image", type: "image" },
			{ key: "alt", label: "Alt text", type: "text" },
			classField,
		],
		defaults: { src: "", alt: "" },
		styles: { "max-width": "100%", height: "auto" },
	},
	{
		id: "list",
		label: "List",
		tag: (p) => (p.ordered === "yes" ? "ol" : "ul"),
		fields: [
			{ key: "items", label: "Items (one per line)", type: "textarea" },
			{ key: "ordered", label: "Numbered", type: "select", options: ["no", "yes"] },
			classField,
		],
		defaults: { items: "First\nSecond\nThird", ordered: "no" },
	},
	{
		id: "video",
		label: "Video",
		tag: () => "video",
		attrs: ["src"],
		fields: [{ key: "src", label: "Video URL (.mp4, .webm)", type: "url" }, classField],
		defaults: { src: "" },
		styles: { "max-width": "100%" },
	},
	{ id: "divider", label: "Divider", tag: () => "hr", fields: [classField] },
	{
		id: "quote",
		label: "Quote",
		tag: () => "blockquote",
		text: "text",
		fields: [classField],
		defaults: { text: "A quote worth sharing." },
		styles: { "border-left": "4px solid currentColor", "padding-left": "16px", margin: "0" },
	},
	{
		id: "code",
		label: "Code",
		tag: () => "pre",
		text: "text",
		fields: [classField],
		defaults: { text: "const hello = 'world';" },
		styles: {
			padding: "16px",
			"border-radius": "6px",
			"background-color": "#0f172a",
			color: "#e2e8f0",
			overflow: "auto",
		},
	},
	{
		// An instance of a Visual Component: the component's markup with this instance's params, and its own
		// children in the component's slot.
		id: "ref",
		label: "Component instance",
		tag: () => "div",
		container: true,
		fields: [],
	},
	{ id: "slot", label: "Slot", tag: () => "div", fields: [] },
	{
		id: "component",
		label: "Component",
		tag: (p) => (/^[A-Z][A-Za-z0-9]*$/.test(p.name ?? "") ? p.name! : "div"),
		text: "text",
		fields: [{ key: "name", label: "Component", type: "select", options: [] }],
		defaults: { text: "" },
	},
	{
		id: "markdown",
		label: "Markdown",
		tag: () => "div",
		fields: [{ key: "source", label: "Markdown / MDX", type: "textarea" }],
		defaults: { source: "Some **Markdown** text." },
	},
];

export const MODULES: Record<string, ModuleDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const moduleOf = (node: VNode): ModuleDef => MODULES[node.moduleId] ?? MODULES.markdown!;
export const canHaveChildren = (moduleId: string): boolean => MODULES[moduleId]?.container === true;

/** One icon per module, shared by the layer tree, module picker and context menu. */
export const MODULE_ICONS: Record<string, typeof Square> = {
	body: Layout,
	container: Square,
	heading: Heading,
	text: Text,
	button: Link,
	link: Link,
	image: Image,
	list: List,
	video: Video,
	divider: Minus,
	quote: Quote,
	code: Code,
	markdown: File,
	ref: Diamond,
	slot: Diamond,
	component: Component,
};

/** One entry in the Add panel: a module with starting props, styles and (for presets) children. */
export type Category = "Layout" | "Basic" | "Media" | "Advanced";

export interface Preset {
	label: string;
	category?: Category;
	moduleId: string;
	props?: Record<string, string>;
	styles?: Styles;
	children?: Preset[];
}

const column: Preset = { label: "Column", moduleId: "container", props: { tag: "div" }, styles: { padding: "8px" } };
const grid = (n: number): Preset => ({
	label: `${n} columns`,
	category: "Layout",
	moduleId: "container",
	props: { tag: "div" },
	styles: { display: "grid", "grid-template-columns": `repeat(${n}, minmax(0, 1fr))`, gap: "24px" },
	children: Array.from({ length: n }, () => column),
});

export const PRESETS: Preset[] = [
	{ label: "Section", category: "Layout", moduleId: "container" },
	{ label: "Container", category: "Layout", moduleId: "container", props: { tag: "div" }, styles: { padding: "16px" } },
	{ ...grid(2), label: "Columns" },
	grid(3),
	grid(4),
	{
		label: "Stack",
		category: "Layout",
		moduleId: "container",
		props: { tag: "div" },
		styles: { display: "flex", "flex-direction": "column", gap: "16px" },
	},
	{
		label: "Row",
		category: "Layout",
		moduleId: "container",
		props: { tag: "div" },
		styles: { display: "flex", "flex-wrap": "wrap", "align-items": "center", gap: "16px" },
	},
	{
		label: "Card",
		category: "Layout",
		moduleId: "container",
		props: { tag: "article" },
		styles: { padding: "24px", border: "1px solid #e5e7eb", "border-radius": "12px" },
		children: [
			{ label: "Heading", moduleId: "heading", props: { level: "h3", text: "Card title" } },
			{ label: "Text", moduleId: "text" },
		],
	},
	{
		label: "Hero",
		category: "Layout",
		moduleId: "container",
		props: { tag: "header" },
		styles: { padding: "96px 24px", "text-align": "center" },
		children: [
			{ label: "Heading", moduleId: "heading", props: { level: "h1", text: "A clear headline" } },
			{ label: "Text", moduleId: "text", props: { text: "One sentence on what this page offers." } },
			{ label: "Button", moduleId: "button", props: { text: "Get started", href: "/" } },
		],
	},
	{ label: "Spacer", category: "Layout", moduleId: "container", props: { tag: "div" }, styles: { height: "48px" } },
	{ label: "Heading", category: "Basic", moduleId: "heading" },
	{ label: "Text", category: "Basic", moduleId: "text" },
	{ label: "Button", category: "Basic", moduleId: "button" },
	{ label: "Link", category: "Basic", moduleId: "link" },
	{ label: "List", category: "Basic", moduleId: "list" },
	{ label: "Quote", category: "Basic", moduleId: "quote" },
	{ label: "Divider", category: "Basic", moduleId: "divider" },
	{ label: "Image", category: "Media", moduleId: "image" },
	{ label: "Video", category: "Media", moduleId: "video" },
	{ label: "Code", category: "Advanced", moduleId: "code" },
	{ label: "Markdown", category: "Advanced", moduleId: "markdown" },
	{ label: "Component", category: "Advanced", moduleId: "component" },
];

/** The name shown in Layers: the user's label, else the start of its text, else the module's name. */
export function nodeName(node: VNode): string {
	if (node.moduleId === "ref" && !node.label) return `◇ ${node.props.name ?? "Component"}`;
	const text = (node.props.text ?? node.props.name ?? node.props.source ?? "").trim().split("\n")[0] ?? "";
	return node.label ?? (text ? `${moduleOf(node).label}: ${text.slice(0, 24)}` : moduleOf(node).label);
}
