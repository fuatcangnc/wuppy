import { ArrowDown, ArrowUp, Copy, Group, Pencil, Trash2, X } from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { frameworkTokens, overrideKey, STATES, type Styles } from "@wuppy/visual-editor";
import { useMemo, useState } from "react";
import { uploadImage } from "../../stores/content.ts";
import { Button, IconButton, Input, Select, Textarea, toast } from "../../ui/index.tsx";
import { Section } from "./Explorer.tsx";
import { safeCssValue } from "./mdx.ts";
import { moduleOf, nodeName, type Field } from "./modules.ts";
import {
	$context,
	$editingComponent,
	$selected,
	$state,
	$target,
	$tree,
	$visual,
	componentize,
	detachSelected,
	duplicateSelected,
	editComponent,
	ensureSelector,
	mutate,
	mutateVisual,
	nudgeSelected,
	removeSelected,
	setClasses,
	setStyle,
	wrapSelected,
} from "./store.ts";
import { updateNodeProps } from "./tree.ts";

const SELECTS: Record<string, readonly string[]> = {
	display: ["", "block", "flex", "grid", "inline-block", "inline", "contents", "none"],
	position: ["", "static", "relative", "absolute", "fixed", "sticky"],
	"flex-direction": ["", "row", "row-reverse", "column", "column-reverse"],
	"flex-wrap": ["", "nowrap", "wrap"],
	"justify-content": ["", "flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"],
	"align-items": ["", "stretch", "flex-start", "center", "flex-end", "baseline"],
	"text-align": ["", "left", "center", "right", "justify"],
	"text-transform": ["", "none", "uppercase", "lowercase", "capitalize"],
	"font-weight": ["", "300", "400", "500", "600", "700", "800", "900"],
	overflow: ["", "visible", "hidden", "auto", "scroll"],
	"object-fit": ["", "fill", "contain", "cover", "none"],
};
const STYLE_GROUPS: [string, string[]][] = [
	[
		"Layout",
		["display", "flex-direction", "flex-wrap", "justify-content", "align-items", "gap", "grid-template-columns"],
	],
	["Position", ["position", "top", "right", "bottom", "left", "z-index"]],
	["Spacing", ["margin", "padding"]],
	["Size", ["width", "max-width", "min-height", "height", "aspect-ratio", "object-fit", "overflow"]],
	[
		"Typography",
		[
			"font-family",
			"font-size",
			"font-weight",
			"line-height",
			"letter-spacing",
			"text-align",
			"text-transform",
			"color",
		],
	],
	["Background", ["background-color", "background-image"]],
	["Border", ["border", "border-radius", "box-shadow", "opacity"]],
	["Effects", ["transition", "transform"]],
];
const GROUPED = new Set(STYLE_GROUPS.flatMap(([, keys]) => keys));
const COLOR = /(^|-)color$/;
const SPACE = /^(margin|padding|gap|top|right|bottom|left)/;

/** Which framework tokens a property's input suggests (Instatic's token-aware inputs). */
const listFor = (prop: string): string | undefined =>
	COLOR.test(prop) || prop === "border"
		? "ve-colors"
		: prop === "font-size"
			? "ve-type"
			: prop === "font-family"
				? "ve-fonts"
				: SPACE.test(prop)
					? "ve-space"
					: undefined;

function StyleInput({ prop, value, inherited }: { prop: string; value: string; inherited?: string }) {
	const set = (v: string) => setStyle(prop, v);
	const bad = value !== "" && !safeCssValue(value);
	if (SELECTS[prop])
		return (
			<Select size="sm" label={prop} value={value} onChange={(e) => set(e.target.value)}>
				{SELECTS[prop].map((o) => (
					<option key={o} value={o}>
						{o || (inherited ? `— (${inherited})` : "—")}
					</option>
				))}
			</Select>
		);
	return (
		<div className="flex items-end gap-1">
			<Input
				label={prop}
				value={value}
				placeholder={inherited}
				list={listFor(prop)}
				onChange={(e) => set(e.target.value)}
				error={bad ? 'Not allowed (no ; { } < > " \\, url() only to https or /)' : null}
				className="h-8 text-xs"
			/>
			{COLOR.test(prop) && (
				<input
					type="color"
					aria-label={`${prop} picker`}
					value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
					onChange={(e) => set(e.target.value)}
					className="mb-0.5 h-8 w-8 shrink-0 rounded border border-border"
				/>
			)}
		</div>
	);
}

function FieldInput({
	id,
	field,
	value,
	components,
}: {
	id: string;
	field: Field;
	value: string;
	components: string[];
}) {
	const set = (v: string) => mutate((d) => updateNodeProps(d, id, { [field.key]: v }), `${id}:${field.key}`);
	if (field.type === "select") {
		const options = field.key === "name" ? components : field.options!;
		return (
			<Select size="sm" label={field.label} value={value} onChange={(e) => set(e.target.value)}>
				{options.map((o) => (
					<option key={o} value={o}>
						{o}
					</option>
				))}
			</Select>
		);
	}
	if (field.type === "textarea")
		return <Textarea label={field.label} value={value} rows={5} onChange={(e) => set(e.target.value)} />;
	return (
		<div className="grid gap-1">
			<Input
				label={field.label}
				value={value}
				type={field.type === "text" ? "text" : "url"}
				onChange={(e) => set(e.target.value)}
				className="h-8 text-xs"
			/>
			{field.type === "image" && (
				<label className="cursor-pointer text-xs text-primary underline">
					Upload image…
					<input
						type="file"
						accept="image/*"
						className="sr-only"
						onChange={(e) => {
							const file = e.target.files?.[0];
							if (file)
								void uploadImage(file)
									.then((url) => mutate((d) => updateNodeProps(d, id, { src: url })))
									.catch((err: Error) => toast(err.message, "error"));
						}}
					/>
				</label>
			)}
		</div>
	);
}

/** Instatic's class picker: the node's classes as pills; a pill opens that class in the selector library. */
function TagPills({ id, value }: { id: string; value: string }) {
	const visual = useStore($visual);
	const [draft, setDraft] = useState("");
	const classes = value.split(/\s+/).filter(Boolean);
	const add = () => {
		const names = draft.trim().replace(/^\./, "").split(/\s+/).filter(Boolean);
		if (names.length) setClasses(id, [...classes, ...names]);
		setDraft("");
	};
	return (
		<div className="grid gap-1">
			<span className="text-xs font-medium">Classes</span>
			<div className="flex flex-wrap gap-1">
				{classes.map((c) => (
					<span key={c} className="inline-flex items-center rounded bg-primary/15 text-xs">
						<button
							type="button"
							title="Edit this class in the selector library"
							className="px-1.5 py-0.5 hover:underline"
							onClick={() => $target.set(ensureSelector(`.${c}`))}
						>
							.{c}
						</button>
						<button
							type="button"
							aria-label={`Remove ${c}`}
							className="px-0.5"
							onClick={() =>
								setClasses(
									id,
									classes.filter((x) => x !== c),
								)
							}
						>
							<X size={10} />
						</button>
					</span>
				))}
				<input
					aria-label="Add class"
					placeholder="+ class"
					list="ve-classes"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							add();
						}
					}}
					onBlur={add}
					className="w-24 rounded border border-border bg-background px-1 text-xs"
				/>
			</div>
			<datalist id="ve-classes">
				{visual.selectors
					.filter((s) => /^\.[\w-]+$/.test(s.selector))
					.map((s) => (
						<option key={s.id} value={s.selector.slice(1)} />
					))}
				{frameworkTokens(visual.framework).classes.map((c) => (
					<option key={c} value={c} />
				))}
			</datalist>
		</div>
	);
}

/** Which styles are edited (breakpoint or condition, and a :state), like Instatic's context bar. */
function ContextBar() {
	const visual = useStore($visual);
	const context = useStore($context);
	const state = useStore($state);
	return (
		<div className="grid grid-cols-2 gap-2">
			<Select size="sm" label="Context" value={context} onChange={(e) => $context.set(e.target.value)}>
				<option value="">Base ({visual.baseWidth}px)</option>
				{visual.breakpoints
					.toSorted((a, b) => b.width - a.width)
					.map((b) => (
						<option key={b.id} value={b.id}>
							{b.label} (≤{b.width}px)
						</option>
					))}
				{visual.conditions.map((c) => (
					<option key={c.id} value={c.id}>
						{c.label}
					</option>
				))}
			</Select>
			<Select size="sm" label="State" value={state} onChange={(e) => $state.set(e.target.value)}>
				<option value="">None</option>
				{STATES.map((s) => (
					<option key={s} value={s}>
						{s}
					</option>
				))}
			</Select>
		</div>
	);
}

function StyleEditor({ styles, base }: { styles: Styles; base: Styles }) {
	const visual = useStore($visual);
	const context = useStore($context);
	const state = useStore($state);
	const [newProp, setNewProp] = useState("");
	const tokens = useMemo(() => frameworkTokens(visual.framework), [visual.framework]);
	const inherit = (k: string) => (context || state ? base[k] : undefined);
	const addProp = () => {
		const prop = newProp.trim().toLowerCase();
		if (/^-{0,2}[a-z][a-z0-9-]*$/.test(prop) && !(prop in styles)) setStyle(prop, "initial");
		setNewProp("");
	};
	const extra = [...new Set([...Object.keys(styles), ...Object.keys(context || state ? base : {})])].filter(
		(k) => !GROUPED.has(k),
	);
	return (
		<>
			<Section title="Styles">
				<ContextBar />
				{(context || state) && (
					<p className="text-[11px] text-muted-foreground">
						Overrides for {overrideKey(context, state).replace("|", " ")}; greyed values come from the base.
					</p>
				)}
			</Section>
			{STYLE_GROUPS.map(([group, keys]) => (
				<Section key={group} title={group}>
					{keys.map((k) => (
						<StyleInput key={k} prop={k} value={styles[k] ?? ""} inherited={inherit(k)} />
					))}
				</Section>
			))}
			<Section title="Other styles">
				{extra.map((k) => (
					<StyleInput key={k} prop={k} value={styles[k] ?? ""} inherited={inherit(k)} />
				))}
				<div className="flex items-end gap-1">
					<Input
						label="CSS property"
						placeholder="opacity"
						value={newProp}
						onChange={(e) => setNewProp(e.target.value)}
						onKeyDown={(e) => {
							if (e.key !== "Enter") return;
							e.preventDefault();
							addProp();
						}}
						className="h-8 text-xs"
					/>
					<Button size="sm" variant="secondary" onClick={addProp}>
						Add
					</Button>
				</div>
			</Section>
			<datalist id="ve-colors">
				{tokens.colors.map((v) => (
					<option key={v} value={v} />
				))}
			</datalist>
			<datalist id="ve-type">
				{tokens.type.map((v) => (
					<option key={v} value={v} />
				))}
			</datalist>
			<datalist id="ve-space">
				{tokens.space.map((v) => (
					<option key={v} value={v} />
				))}
			</datalist>
			<datalist id="ve-fonts">
				{tokens.fonts.map((v) => (
					<option key={v} value={v} />
				))}
			</datalist>
		</>
	);
}

function SelectorProperties({ id }: { id: string }) {
	const visual = useStore($visual);
	const context = useStore($context);
	const state = useStore($state);
	const selector = visual.selectors.find((s) => s.id === id);
	if (!selector) return null;
	const key = overrideKey(context, state);
	return (
		<div>
			<div className="flex items-center gap-2 border-b border-border bg-purple-500/10 p-3">
				<span className="min-w-0 flex-1 truncate font-mono text-sm">{selector.selector}</span>
				<Button size="sm" variant="ghost" onClick={() => $target.set(null)}>
					Back to element
				</Button>
			</div>
			<p className="px-3 pt-2 text-[11px] text-muted-foreground">
				Changes apply to every element that matches, on every page.
			</p>
			<StyleEditor styles={key ? (selector.overrides[key] ?? {}) : selector.styles} base={selector.styles} />
		</div>
	);
}

/** The right-hand panel: what the selected element is, its content and its styles (Instatic's Properties). */
export function PropertiesPanel({ components }: { components: string[] }) {
	const tree = useStore($tree);
	const selected = useStore($selected);
	const target = useStore($target);
	const visual = useStore($visual);
	const context = useStore($context);
	const state = useStore($state);
	const editing = useStore($editingComponent);
	if (target) return <SelectorProperties id={target} />;
	const node = selected ? tree.nodes[selected] : undefined;
	if (!node || selected === tree.rootNodeId)
		return (
			<p className="p-3 text-sm text-muted-foreground">
				Select something on the page or in Layers. Double-click text to edit it in place.
			</p>
		);
	const def = moduleOf(node);
	const id = node.id;
	if (node.locked)
		return (
			<Section title={nodeName(node)}>
				<p className="text-sm text-muted-foreground">Locked. Unlock it in Layers to edit.</p>
			</Section>
		);
	const key = overrideKey(context, state);
	const component = node.moduleId === "ref" ? visual.components.find((c) => c.id === node.props.ref) : undefined;
	return (
		<div>
			<Section title={nodeName(node)}>
				<div className="flex flex-wrap gap-0.5">
					<IconButton label="Move up" size="icon-sm" onClick={() => nudgeSelected(-1)}>
						<ArrowUp size={14} />
					</IconButton>
					<IconButton label="Move down" size="icon-sm" onClick={() => nudgeSelected(1)}>
						<ArrowDown size={14} />
					</IconButton>
					<IconButton label="Duplicate (Ctrl+D)" size="icon-sm" onClick={duplicateSelected}>
						<Copy size={14} />
					</IconButton>
					{node.moduleId !== "markdown" && (
						<IconButton label="Wrap in a container" size="icon-sm" onClick={wrapSelected}>
							<Group size={14} />
						</IconButton>
					)}
					{!editing && node.moduleId !== "markdown" && node.moduleId !== "ref" && (
						<Button
							size="sm"
							variant="secondary"
							className="h-8"
							onClick={() => {
								const name = prompt("Component name", moduleOf(node).label);
								if (name) componentize(name);
							}}
						>
							Componentize
						</Button>
					)}
					<IconButton label="Delete (Del)" size="icon-sm" onClick={removeSelected}>
						<Trash2 size={14} />
					</IconButton>
				</div>
				{def.text && (
					<Textarea
						label="Text"
						value={node.props[def.text] ?? ""}
						rows={3}
						onChange={(e) => mutate((d) => updateNodeProps(d, id, { [def.text!]: e.target.value }), `${id}:text`)}
					/>
				)}
				{def.fields
					.filter((f) => f.key !== "class")
					.map((f) => (
						<FieldInput key={f.key} id={id} field={f} value={node.props[f.key] ?? ""} components={components} />
					))}
				{def.fields.some((f) => f.key === "class") && <TagPills id={id} value={node.props.class ?? ""} />}
			</Section>
			{node.moduleId === "ref" && (
				<Section title="Component">
					{component ? (
						<>
							{component.params.map((p) => (
								<Input
									key={p.name}
									label={p.name}
									value={node.props[`p.${p.name}`] ?? ""}
									placeholder={p.default}
									onChange={(e) =>
										mutate((d) => updateNodeProps(d, id, { [`p.${p.name}`]: e.target.value }), `${id}:p.${p.name}`)
									}
									className="h-8 text-xs"
								/>
							))}
							<div className="flex gap-1">
								<Button size="sm" variant="secondary" onClick={() => editComponent(component.id)}>
									<Pencil size={12} /> Edit component
								</Button>
								<Button size="sm" variant="ghost" onClick={detachSelected}>
									Detach
								</Button>
							</div>
							<ParamsEditor id={component.id} />
						</>
					) : (
						<p className="text-xs text-destructive">
							This component no longer exists. Detach is not possible; delete the instance.
						</p>
					)}
				</Section>
			)}
			{node.moduleId !== "markdown" && node.moduleId !== "ref" && (
				<StyleEditor styles={key ? (node.overrides[key] ?? {}) : node.styles} base={node.styles} />
			)}
		</div>
	);
}

/** Component parameters: `{{name}}` in the component's text and attributes, set per instance. */
function ParamsEditor({ id }: { id: string }) {
	const visual = useStore($visual);
	const [name, setName] = useState("");
	const component = visual.components.find((c) => c.id === id);
	if (!component) return null;
	const update = (fn: (params: { name: string; default: string }[]) => void) =>
		mutateVisual((v) => {
			const c = v.components.find((x) => x.id === id);
			if (c) fn(c.params);
		}, `params:${id}`);
	return (
		<details className="text-xs">
			<summary className="cursor-pointer text-muted-foreground">Parameters ({component.params.length})</summary>
			<div className="mt-2 grid gap-1">
				{component.params.map((p, i) => (
					<div key={p.name} className="flex items-center gap-1">
						<code className="min-w-0 flex-1 truncate">{`{{${p.name}}}`}</code>
						<input
							aria-label={`${p.name} default`}
							value={p.default}
							placeholder="default"
							onChange={(e) => update((ps) => void (ps[i]!.default = e.target.value))}
							className="w-24 rounded border border-border bg-background px-1"
						/>
						<button type="button" aria-label={`Remove ${p.name}`} onClick={() => update((ps) => void ps.splice(i, 1))}>
							<X size={10} />
						</button>
					</div>
				))}
				<div className="flex gap-1">
					<input
						aria-label="New parameter"
						placeholder="title"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="min-w-0 flex-1 rounded border border-border bg-background px-1"
					/>
					<Button
						size="sm"
						variant="ghost"
						disabled={!/^[a-z][a-zA-Z0-9]{0,29}$/.test(name) || component.params.some((p) => p.name === name)}
						onClick={() => {
							update((ps) => void ps.push({ name, default: "" }));
							setName("");
						}}
					>
						Add
					</Button>
				</div>
				<p className="text-muted-foreground">
					Write {"{{name}}"} in the component's text or links, then set it per page.
				</p>
			</div>
		</details>
	);
}
