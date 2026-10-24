import {
	ArrowDown,
	ArrowUp,
	Box,
	ChevronDown,
	ChevronsDown,
	Component as ComponentIcon,
	Copy,
	EllipsisVertical,
	FileText,
	Group,
	Grid2x2,
	Heading,
	Image,
	Layout,
	Link,
	Move,
	PaintBucket,
	Pencil,
	Pilcrow,
	Pointer,
	Proportions,
	Ruler,
	Rows3,
	Search,
	SlidersHorizontal,
	Sparkles,
	Square,
	Tags,
	Trash2,
	Type,
	X,
} from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { frameworkTokens, overrideKey, STATES, type Styles } from "@wuppy/visual-editor";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { uploadImage } from "../../stores/content.ts";
import { Button, IconButton, Input, Select, Textarea, toast } from "../../ui/index.tsx";
import { $themeElement, codePath, editThemeElement, type ThemeElement } from "./theme-element.ts";
import { safeCssValue } from "./markdown.ts";
import { GROUPED, SELECTS, STYLE_GROUPS } from "./style-props.ts";
import { classValue, parseStyle, printStyle, variantFor, withClassValue } from "./tailwind.ts";
import { MODULE_ICONS, moduleOf, nodeName, type Field } from "./modules.ts";
import {
	$codeFile,
	$componentNames,
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
import { updateNodeProps, type VNode } from "./tree.ts";

const COLOR = /(^|-)color$/;
const SPACE = /^(margin|padding|gap|top|right|bottom|left)/;
type Icon = typeof Square;

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

const setDisplay = (next: string) => setStyle("display", next);
const setPosition = (next: string) => setStyle("position", next);

const styleLabel = (prop: string): string => {
	const words = prop.split("-");
	return words.map((word, i) => (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join(" ");
};

const GROUP_META: Record<string, { id: string; icon: Icon }> = {
	Layout: { id: "layout", icon: Layout },
	Position: { id: "position", icon: Move },
	Size: { id: "size", icon: Proportions },
	Spacing: { id: "spacing", icon: Ruler },
	Typography: { id: "typography", icon: Type },
	Background: { id: "background", icon: PaintBucket },
	Border: { id: "border", icon: Box },
	Effects: { id: "effects", icon: Sparkles },
	Interaction: { id: "interaction", icon: Pointer },
};

const LAYOUT_KEYS = [
	"align-self",
	"justify-self",
	"flex",
	"grid-column",
	"grid-row",
	"overflow",
	"overflow-x",
	"overflow-y",
];
const POSITION_KEYS = ["z-index"];

function PropertyLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
	return (
		<label htmlFor={htmlFor} className="text-[11px] leading-none font-medium text-[#9b9ba3]">
			{children}
		</label>
	);
}

function StyleInput({ prop, value, inherited }: { prop: string; value: string; inherited?: string }) {
	const inputId = useId();
	const set = (v: string) => setStyle(prop, v);
	const bad = value !== "" && !safeCssValue(value);
	const label = styleLabel(prop);
	if (SELECTS[prop])
		return (
			<div className="grid gap-1">
				<PropertyLabel htmlFor={inputId}>{label}</PropertyLabel>
				<Select
					id={inputId}
					size="sm"
					value={value}
					aria-label={prop}
					onChange={(e) => set(e.target.value)}
					className="h-8 border-[#34343a] bg-[#19191c] text-xs"
				>
					{SELECTS[prop].map((o) => (
						<option key={o} value={o}>
							{o || inherited || "auto"}
						</option>
					))}
				</Select>
			</div>
		);
	return (
		<div className="grid gap-1">
			<PropertyLabel htmlFor={inputId}>{label}</PropertyLabel>
			<div className="flex items-center gap-1">
				<Input
					id={inputId}
					value={value}
					placeholder={inherited}
					list={listFor(prop)}
					onChange={(e) => set(e.target.value)}
					aria-label={prop}
					aria-invalid={bad || undefined}
					className="h-8 border-[#34343a] bg-[#19191c] text-xs"
				/>
				{COLOR.test(prop) && (
					<input
						type="color"
						aria-label={`${label} picker`}
						value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
						onChange={(e) => set(e.target.value)}
						className="h-8 w-8 shrink-0 rounded border border-[#34343a] bg-transparent"
					/>
				)}
			</div>
			{bad && <p className="text-[10px] text-destructive">Not allowed</p>}
		</div>
	);
}

function FieldInput({
	id,
	field,
	value,
	options,
	labels,
}: {
	id: string;
	field: Field;
	value: string;
	options?: readonly string[];
	labels?: Record<string, string>;
}) {
	const inputId = useId();
	const set = (v: string) => mutate((d) => updateNodeProps(d, id, { [field.key]: v }), `${id}:${field.key}`);
	if (field.type === "select") {
		return (
			<div className="grid gap-1">
				<PropertyLabel htmlFor={inputId}>{field.label}</PropertyLabel>
				<Select
					id={inputId}
					size="sm"
					value={value}
					aria-label={field.key}
					onChange={(e) => set(e.target.value)}
					className="h-8 border-[#34343a] bg-[#19191c] text-xs"
				>
					{(options ?? field.options ?? []).map((o) => (
						<option key={o} value={o}>
							{labels?.[o] ?? o}
						</option>
					))}
				</Select>
			</div>
		);
	}
	if (field.type === "textarea")
		return (
			<div className="grid gap-1">
				<PropertyLabel htmlFor={inputId}>{field.label}</PropertyLabel>
				<Textarea
					id={inputId}
					value={value}
					aria-label={field.key}
					rows={4}
					onChange={(e) => set(e.target.value)}
					className="min-h-[72px] border-[#34343a] bg-[#19191c] text-xs"
				/>
			</div>
		);
	return (
		<div className="grid gap-1">
			<PropertyLabel htmlFor={inputId}>{field.label}</PropertyLabel>
			<Input
				id={inputId}
				value={value}
				aria-label={field.key}
				type={field.type === "text" ? "text" : "url"}
				onChange={(e) => set(e.target.value)}
				className="h-8 border-[#34343a] bg-[#19191c] text-xs"
			/>
			{field.type === "image" && (
				<label className="cursor-pointer text-[11px] text-primary underline">
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

function PanelSection({
	id,
	title,
	icon: SectionIcon,
	children,
	defaultOpen = true,
	action,
	meta,
}: {
	id: string;
	title: string;
	icon?: Icon;
	children: ReactNode;
	defaultOpen?: boolean;
	action?: ReactNode;
	meta?: ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<section data-property-section={id} className="group scroll-mt-1 border-b border-[#242428]">
			<div className="mx-2 mt-1.5 flex items-center gap-0.5 rounded-lg bg-[#1b1b1f] pr-1">
				<button
					type="button"
					aria-expanded={open}
					onClick={() => setOpen((value) => !value)}
					className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
				>
					{SectionIcon && <SectionIcon size={14} className="shrink-0 text-[#a1a1aa]" aria-hidden="true" />}
					<span className="truncate text-xs font-semibold text-[#d4d4d8]">{title}</span>
					{meta && <span className="ml-auto truncate text-[10px] text-[#71717a]">{meta}</span>}
				</button>
				{action}
				<button
					type="button"
					aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
					onClick={() => setOpen((value) => !value)}
					className="grid size-6 shrink-0 place-items-center rounded text-[#71717a] hover:bg-white/5 hover:text-white"
				>
					<ChevronDown size={12} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
				</button>
			</div>
			{open && <div className="grid gap-2 px-3 py-2.5">{children}</div>}
		</section>
	);
}

function ClassPicker({ id, value, showComponentize }: { id: string; value: string; showComponentize: boolean }) {
	const visual = useStore($visual);
	const [draft, setDraft] = useState("");
	const classes = value.split(/\s+/).filter(Boolean);
	const add = () => {
		const names = draft.trim().replace(/^\./, "").split(/\s+/).filter(Boolean);
		if (names.length) setClasses(id, [...classes, ...names]);
		setDraft("");
	};
	return (
		<div className="grid gap-2">
			<div className="flex items-center gap-2">
				<div className="relative min-w-0 flex-1">
					<input
						aria-label="Add or create selector"
						placeholder="Add or create selector…"
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
						className="h-8 w-full rounded-md border border-[#34343a] bg-[#19191c] pr-7 pl-2.5 text-xs text-[#e4e4e7] outline-none placeholder:text-[#71717a] focus:border-[#6d5bd0]"
					/>
					<ChevronDown
						size={12}
						aria-hidden="true"
						className="pointer-events-none absolute top-2.5 right-2 text-[#71717a]"
					/>
				</div>
				{showComponentize && (
					<Button
						size="sm"
						variant="secondary"
						className="h-8 shrink-0 px-3 text-xs"
						onClick={() => {
							const name = prompt("Component name", "Component");
							if (name) componentize(name);
						}}
					>
						Componentize
					</Button>
				)}
			</div>
			{classes.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{classes.map((c) => (
						<span
							key={c}
							className="inline-flex h-6 items-center gap-1 rounded-md bg-[#3a2b1e] px-1.5 text-[11px] text-[#f0b37e]"
						>
							<FileText size={10} className="shrink-0 opacity-70" />
							<button
								type="button"
								title="Edit this class in the selector library"
								className="font-mono hover:underline"
								onClick={() => $target.set(ensureSelector(`.${c}`))}
							>
								.{c}
							</button>
							<button
								type="button"
								aria-label={`Remove ${c}`}
								className="text-[#b28a68] hover:text-white"
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
				</div>
			)}
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

function ContextBar() {
	const visual = useStore($visual);
	const context = useStore($context);
	const state = useStore($state);
	return (
		<div className="grid grid-cols-2 gap-2">
			<div className="grid gap-1">
				<PropertyLabel>Context</PropertyLabel>
				<Select
					size="sm"
					value={context}
					onChange={(e) => $context.set(e.target.value)}
					className="h-8 border-[#34343a] bg-[#19191c] text-xs"
				>
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
			</div>
			<div className="grid gap-1">
				<PropertyLabel>State</PropertyLabel>
				<Select
					size="sm"
					value={state}
					onChange={(e) => $state.set(e.target.value)}
					className="h-8 border-[#34343a] bg-[#19191c] text-xs"
				>
					<option value="">None</option>
					{STATES.map((s) => (
						<option key={s} value={s}>
							{s}
						</option>
					))}
				</Select>
			</div>
		</div>
	);
}

function DisplayToggle({ value }: { value: string }) {
	const isFlex = value === "flex" || value === "inline-flex";
	const isGrid = value === "grid" || value === "inline-grid";
	return (
		<div className="grid gap-1">
			<PropertyLabel>Display</PropertyLabel>
			<div className="grid grid-cols-2 gap-1 rounded-md border border-[#34343a] bg-[#19191c] p-1">
				<button
					type="button"
					aria-pressed={isFlex}
					onClick={() => setDisplay("flex")}
					className={`flex h-7 items-center justify-center gap-1.5 rounded text-[11px] font-medium ${isFlex ? "bg-[#2c2c31] text-white" : "text-[#9b9ba3] hover:text-white"}`}
				>
					<Rows3 size={12} /> Flex
				</button>
				<button
					type="button"
					aria-pressed={isGrid}
					onClick={() => setDisplay("grid")}
					className={`flex h-7 items-center justify-center gap-1.5 rounded text-[11px] font-medium ${isGrid ? "bg-[#2c2c31] text-white" : "text-[#9b9ba3] hover:text-white"}`}
				>
					<Grid2x2 size={12} /> Grid
				</button>
			</div>
		</div>
	);
}

function LayoutControls({
	styles,
	keys,
	query,
	inherit,
}: {
	styles: Styles;
	keys: readonly string[];
	query: string;
	inherit: (key: string) => string | undefined;
}) {
	const q = query.trim().toLowerCase();
	const matches = (key: string) =>
		!q || key.includes(q) || styleLabel(key).toLowerCase().includes(q) || "layout".includes(q);
	const extra = keys.filter((key) => key !== "display" && !LAYOUT_KEYS.includes(key) && matches(key));
	return (
		<>
			{(!q || "display".includes(q)) && <DisplayToggle value={styles.display ?? ""} />}
			{LAYOUT_KEYS.filter(matches)
				.filter((key) => keys.includes(key))
				.map((key) => (
					<StyleInput key={key} prop={key} value={styles[key] ?? ""} inherited={inherit(key)} />
				))}
			{extra.length > 0 && (
				<details className="text-[11px] text-[#8b8b93]">
					<summary className="cursor-pointer select-none py-1 hover:text-white">Advanced layout</summary>
					<div className="grid gap-2 pt-1">
						{keys.includes("display") && (
							<div className="grid gap-1">
								<PropertyLabel>Display</PropertyLabel>
								<Select
									size="sm"
									value={styles.display ?? ""}
									onChange={(e) => setStyle("display", e.target.value)}
									className="h-8 border-[#34343a] bg-[#19191c] text-xs"
								>
									{(SELECTS.display ?? []).map((option) => (
										<option key={option} value={option}>
											{option || "auto"}
										</option>
									))}
								</Select>
							</div>
						)}
						{extra.map((key) => (
							<StyleInput key={key} prop={key} value={styles[key] ?? ""} inherited={inherit(key)} />
						))}
					</div>
				</details>
			)}
		</>
	);
}

function PositionControls({
	styles,
	keys,
	query,
	inherit,
}: {
	styles: Styles;
	keys: readonly string[];
	query: string;
	inherit: (key: string) => string | undefined;
}) {
	const q = query.trim().toLowerCase();
	const matches = (key: string) =>
		!q || key.includes(q) || styleLabel(key).toLowerCase().includes(q) || "position".includes(q);
	const position = styles.position ?? "";
	const extra = keys.filter((key) => key !== "position" && !POSITION_KEYS.includes(key) && matches(key));
	return (
		<>
			{(!q || "position".includes(q)) && (
				<div className="grid gap-1">
					<PropertyLabel>Position</PropertyLabel>
					<div className="grid grid-cols-2 gap-1 rounded-md border border-[#34343a] bg-[#19191c] p-1">
						<button
							type="button"
							aria-pressed={position === "relative"}
							onClick={() => setPosition("relative")}
							className={`h-7 rounded text-[11px] font-medium ${position === "relative" ? "bg-[#2c2c31] text-white" : "text-[#9b9ba3] hover:text-white"}`}
						>
							Relative
						</button>
						<button
							type="button"
							aria-pressed={position === "absolute"}
							onClick={() => setPosition("absolute")}
							className={`h-7 rounded text-[11px] font-medium ${position === "absolute" ? "bg-[#2c2c31] text-white" : "text-[#9b9ba3] hover:text-white"}`}
						>
							Absolute
						</button>
					</div>
				</div>
			)}
			{POSITION_KEYS.filter(matches)
				.filter((key) => keys.includes(key))
				.map((key) => (
					<StyleInput key={key} prop={key} value={styles[key] ?? ""} inherited={inherit(key)} />
				))}
			{extra.length > 0 && (
				<details className="text-[11px] text-[#8b8b93]">
					<summary className="cursor-pointer select-none py-1 hover:text-white">Advanced position</summary>
					<div className="grid gap-2 pt-1">
						{keys.includes("position") && (
							<div className="grid gap-1">
								<PropertyLabel>Position</PropertyLabel>
								<Select
									size="sm"
									value={position}
									onChange={(e) => setPosition(e.target.value)}
									className="h-8 border-[#34343a] bg-[#19191c] text-xs"
								>
									{(SELECTS.position ?? []).map((option) => (
										<option key={option} value={option}>
											{option || "static"}
										</option>
									))}
								</Select>
							</div>
						)}
						{extra.map((key) => (
							<StyleInput key={key} prop={key} value={styles[key] ?? ""} inherited={inherit(key)} />
						))}
					</div>
				</details>
			)}
		</>
	);
}

function StyleEditor({
	styles,
	base,
	query = "",
	showContext = false,
}: {
	styles: Styles;
	base: Styles;
	query?: string;
	showContext?: boolean;
}) {
	const visual = useStore($visual);
	const context = useStore($context);
	const state = useStore($state);
	const [newProp, setNewProp] = useState("");
	const tokens = useMemo(() => frameworkTokens(visual.framework), [visual.framework]);
	const inherit = (k: string) => (context || state ? base[k] : undefined);
	const q = query.trim().toLowerCase();
	const matches = (key: string) => !q || key.includes(q) || styleLabel(key).toLowerCase().includes(q);
	const addProp = () => {
		const prop = newProp.trim().toLowerCase();
		if (/^-{0,2}[a-z][a-z0-9-]*$/.test(prop) && !(prop in styles)) setStyle(prop, "initial");
		setNewProp("");
	};
	const extra = [...new Set([...Object.keys(styles), ...Object.keys(context || state ? base : {})])].filter(
		(k) => !GROUPED.has(k) && matches(k),
	);
	const groups = STYLE_GROUPS.map(([group, keys]) => ({
		group,
		keys: keys.filter((key) => matches(key)),
		all: (!q || group.toLowerCase().includes(q) || keys.some((key) => matches(key))) && keys.length > 0,
	})).filter(({ all }) => all);
	return (
		<>
			{(showContext || context || state) && (
				<PanelSection id="context" title="Context & state" icon={SlidersHorizontal} defaultOpen>
					<ContextBar />
					{(context || state) && (
						<p className="text-[11px] text-muted-foreground">
							Overrides for {overrideKey(context, state).replace("|", " ")}; greyed values come from the base.
						</p>
					)}
				</PanelSection>
			)}
			{groups.map(({ group, keys }) => {
				const meta = GROUP_META[group];
				return (
					<PanelSection key={group} id={meta?.id ?? group.toLowerCase()} title={group} icon={meta?.icon}>
						{group === "Layout" ? (
							<LayoutControls
								styles={styles}
								keys={STYLE_GROUPS.find(([name]) => name === "Layout")?.[1] ?? []}
								query={q}
								inherit={inherit}
							/>
						) : group === "Position" ? (
							<PositionControls
								styles={styles}
								keys={STYLE_GROUPS.find(([name]) => name === "Position")?.[1] ?? []}
								query={q}
								inherit={inherit}
							/>
						) : (
							keys.map((key) => <StyleInput key={key} prop={key} value={styles[key] ?? ""} inherited={inherit(key)} />)
						)}
					</PanelSection>
				);
			})}
			{groups.length === 0 && q && <p className="px-3 py-6 text-center text-xs text-[#71717a]">No matching styles.</p>}
			<PanelSection id="other" title="Other styles" icon={EllipsisVertical} defaultOpen={false}>
				{extra.map((key) => (
					<StyleInput key={key} prop={key} value={styles[key] ?? ""} inherited={inherit(key)} />
				))}
				<div className="flex items-center gap-1">
					<Input
						aria-label="CSS property"
						placeholder="opacity"
						value={newProp}
						onChange={(e) => setNewProp(e.target.value)}
						onKeyDown={(e) => {
							if (e.key !== "Enter") return;
							e.preventDefault();
							addProp();
						}}
						className="h-8 border-[#34343a] bg-[#19191c] text-xs"
					/>
					<Button size="sm" variant="secondary" className="h-8" onClick={addProp}>
						Add
					</Button>
				</div>
			</PanelSection>
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
			<div className="flex items-center gap-2 border-b border-[#242428] bg-purple-500/10 p-3">
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

function NodeFields({ node, id, componentNames }: { node: VNode; id: string; componentNames: readonly string[] }) {
	const def = moduleOf(node);
	return (
		<>
			{def.text && (
				<div className="grid gap-1">
					<PropertyLabel>Text</PropertyLabel>
					<Textarea
						aria-label="Text"
						value={node.props[def.text] ?? ""}
						rows={3}
						onChange={(e) => mutate((d) => updateNodeProps(d, id, { [def.text!]: e.target.value }), `${id}:text`)}
						className="min-h-[72px] border-[#34343a] bg-[#19191c] text-xs"
					/>
				</div>
			)}
			{def.fields
				.filter((field) => field.key !== "class")
				.map((field) => (
					<FieldInput
						key={field.key}
						id={id}
						field={field}
						value={node.props[field.key] ?? ""}
						options={node.moduleId === "component" && field.key === "name" ? componentNames : undefined}
						labels={moduleOf(node).labels}
					/>
				))}
			{node.moduleId === "component" && (
				<p className="text-[11px] leading-4 text-muted-foreground">
					Astro component. Save, then rebuild the theme to see the real output on the site.
				</p>
			)}
		</>
	);
}

function NodeActions({ node }: { node: VNode }) {
	return (
		<div className="flex items-center gap-0.5 text-[#71717a] opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
			<IconButton label="Move up" size="icon-sm" onClick={() => nudgeSelected(-1)}>
				<ArrowUp size={13} />
			</IconButton>
			<IconButton label="Move down" size="icon-sm" onClick={() => nudgeSelected(1)}>
				<ArrowDown size={13} />
			</IconButton>
			<IconButton label="Duplicate (Ctrl+D)" size="icon-sm" onClick={duplicateSelected}>
				<Copy size={13} />
			</IconButton>
			{node.moduleId !== "markdown" && (
				<IconButton label="Wrap in a container" size="icon-sm" onClick={wrapSelected}>
					<Group size={13} />
				</IconButton>
			)}
			<IconButton label="Delete (Del)" size="icon-sm" onClick={removeSelected}>
				<Trash2 size={13} />
			</IconButton>
		</div>
	);
}

function StyleRail({
	moduleId,
	moduleIcon,
	styles,
	active,
	onSelect,
	showContext = true,
}: {
	moduleId?: string;
	moduleIcon?: Icon;
	styles: Styles;
	active: string;
	onSelect: (id: string) => void;
	showContext?: boolean;
}) {
	const ModuleIcon = moduleIcon ?? (moduleId ? MODULE_ICONS[moduleId] : undefined) ?? Box;
	const groups = STYLE_GROUPS.map(([group, keys]) => ({
		id: GROUP_META[group]?.id ?? group.toLowerCase(),
		label: group,
		icon: GROUP_META[group]?.icon ?? Box,
		hasValue: keys.some((key) => styles[key] !== undefined && styles[key] !== ""),
	}));
	return (
		<div
			role="toolbar"
			aria-label="Style categories"
			className="flex w-9 shrink-0 flex-col items-center gap-3 overflow-y-auto border-l border-[#242428] bg-[#0e0e10] py-3"
		>
			<button
				type="button"
				title="Element"
				aria-label="Element properties"
				aria-pressed={active === "module"}
				onClick={() => onSelect("module")}
				className={`relative grid size-7 place-items-center rounded-md ${active === "module" ? "bg-[#2a2a2f] text-white" : "text-[#71717a] hover:bg-[#1b1b1f] hover:text-[#d4d4d8]"}`}
			>
				<ModuleIcon size={14} />
			</button>
			{groups.map(({ id, label, icon: SectionIcon, hasValue }) => (
				<button
					key={id}
					type="button"
					title={label}
					aria-label={`Show ${label} styles`}
					aria-pressed={active === id}
					onClick={() => onSelect(id)}
					className={`relative grid size-7 place-items-center rounded-md ${active === id ? "bg-[#2a2a2f] text-white" : "text-[#71717a] hover:bg-[#1b1b1f] hover:text-[#d4d4d8]"}`}
				>
					<SectionIcon size={14} />
					{hasValue && <span className="absolute top-1 right-1 size-1 rounded-full bg-[#6ee7b7]" aria-hidden="true" />}
				</button>
			))}
			{showContext && (
				<button
					type="button"
					title="Context & state"
					aria-label="Context and state"
					aria-pressed={active === "context"}
					onClick={() => onSelect("context")}
					className={`grid size-7 place-items-center rounded-md ${active === "context" ? "bg-[#2a2a2f] text-white" : "text-[#71717a] hover:bg-[#1b1b1f] hover:text-[#d4d4d8]"}`}
				>
					<SlidersHorizontal size={13} />
				</button>
			)}
			<button
				type="button"
				title="Scroll to bottom"
				aria-label="Scroll to bottom"
				onClick={() => onSelect("end")}
				className="mt-auto grid size-7 place-items-center rounded-md text-[#71717a] hover:bg-[#1b1b1f] hover:text-white"
			>
				<ChevronsDown size={13} />
			</button>
		</div>
	);
}

function StyleSearch({
	value,
	onChange,
	classLabel,
	classPrefix = ".",
}: {
	value: string;
	onChange: (value: string) => void;
	classLabel?: string;
	classPrefix?: string;
}) {
	const target = classLabel ? `${classPrefix}${classLabel}` : "element";
	return (
		<div className="border-t border-[#242428] bg-[#111113] p-2">
			<div className="relative">
				<Search size={13} className="pointer-events-none absolute top-2.5 left-2.5 text-[#71717a]" />
				<input
					aria-label="Search styles"
					placeholder={`Search styles in ${target}...`}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="h-8 w-full rounded-md border border-[#34343a] bg-[#19191c] pr-2 pl-7 text-xs text-[#e4e4e7] outline-none placeholder:text-[#71717a] focus:border-[#6d5bd0]"
				/>
			</div>
		</div>
	);
}

function NodeInspector({
	node,
	component,
	componentNames,
	editing,
	onNavigate,
	activeSection,
	scrollRef,
}: {
	node: VNode;
	component?: { id: string };
	componentNames: readonly string[];
	editing: boolean;
	onNavigate: (id: string) => void;
	activeSection: string;
	scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
	const [view, setView] = useState<"styles" | "attributes">("styles");
	const [query, setQuery] = useState("");
	const [showContext, setShowContext] = useState(false);
	const context = useStore($context);
	const state = useStore($state);
	const id = node.id;
	const def = moduleOf(node);
	const key = overrideKey(context, state);
	const styles = key ? (node.overrides[key] ?? {}) : node.styles;
	const base = node.styles;
	const classLabel = (node.props.class ?? "").split(/\s+/).filter(Boolean)[0];
	const ModuleIcon = node.moduleId === "text" ? FileText : (MODULE_ICONS[node.moduleId] ?? Box);
	const canComponentize = !editing && node.moduleId !== "markdown" && node.moduleId !== "ref";
	useEffect(() => {
		setShowContext(false);
		setQuery("");
		setView("styles");
	}, [node.id]);
	const navigate = (section: string) => {
		if (section === "context") {
			setShowContext(true);
			requestAnimationFrame(() => onNavigate("context"));
			return;
		}
		onNavigate(section);
	};
	return (
		<div className="flex h-full min-h-0 bg-[#111113]">
			<div className="flex min-w-0 flex-1 flex-col">
				<div
					role="tablist"
					aria-label="Element options"
					className="flex gap-4 border-b border-[#242428] px-4 pt-3 pb-2"
				>
					<button
						type="button"
						role="tab"
						aria-selected={view === "styles"}
						className={`text-xs font-semibold ${view === "styles" ? "text-white" : "text-[#71717a] hover:text-[#d4d4d8]"}`}
						onClick={() => setView("styles")}
					>
						Styles
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={view === "attributes"}
						className={`text-xs font-semibold ${view === "attributes" ? "text-white" : "text-[#71717a] hover:text-[#d4d4d8]"}`}
						onClick={() => setView("attributes")}
					>
						Attributes
					</button>
				</div>
				{view === "styles" && (
					<div className="px-3 py-3">
						<ClassPicker id={id} value={node.props.class ?? ""} showComponentize={canComponentize} />
					</div>
				)}
				<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
					{view === "styles" ? (
						<>
							<PanelSection
								id="module"
								title={node.label ?? def.label}
								icon={ModuleIcon}
								action={<NodeActions node={node} />}
							>
								<NodeFields node={node} id={id} componentNames={componentNames} />
							</PanelSection>
							{node.moduleId === "ref" && (
								<PanelSection id="component" title="Component" icon={ComponentIcon}>
									{component ? (
										<>
											<ComponentParams id={component.id} node={node} />
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
								</PanelSection>
							)}
							<StyleEditor styles={styles} base={base} query={query} showContext={showContext} />
						</>
					) : (
						<div className="p-3">
							<PanelSection id="attributes" title={def.label} icon={ModuleIcon}>
								<NodeFields node={node} id={id} componentNames={componentNames} />
							</PanelSection>
							<PanelSection id="attributes-classes" title="Classes" icon={Layout}>
								<ClassPicker id={id} value={node.props.class ?? ""} showComponentize={false} />
							</PanelSection>
						</div>
					)}
				</div>
				{view === "styles" && <StyleSearch value={query} onChange={setQuery} classLabel={classLabel} />}
			</div>
			{view === "styles" && (
				<StyleRail moduleId={node.moduleId} styles={styles} active={activeSection} onSelect={navigate} />
			)}
		</div>
	);
}

function ComponentParams({ id, node }: { id: string; node: VNode }) {
	const visual = useStore($visual);
	const component = visual.components.find((c) => c.id === id);
	if (!component) return null;
	return (
		<>
			{component.params.map((p) => (
				<Input
					key={p.name}
					aria-label={p.name}
					value={node.props[`p.${p.name}`] ?? ""}
					placeholder={p.default}
					onChange={(e) =>
						mutate((d) => updateNodeProps(d, node.id, { [`p.${p.name}`]: e.target.value }), `${node.id}:p.${p.name}`)
					}
					className="h-8 border-[#34343a] bg-[#19191c] text-xs"
				/>
			))}
		</>
	);
}

/** The right-hand panel: what the selected element is, its content and its styles (Instatic's Properties). */
export function PropertiesPanel() {
	const tree = useStore($tree);
	const selected = useStore($selected);
	const target = useStore($target);
	const visual = useStore($visual);
	const editing = useStore($editingComponent);
	const componentNames = useStore($componentNames);
	const themeElement = useStore($themeElement);
	const [activeSection, setActiveSection] = useState("module");
	const scrollRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		setActiveSection("module");
	}, [selected]);
	useEffect(() => {
		const scroller = scrollRef.current;
		if (!scroller) return;
		const update = () => {
			const top = scroller.getBoundingClientRect().top + 48;
			let current = "module";
			for (const section of scroller.querySelectorAll<HTMLElement>("[data-property-section]")) {
				if (section.getBoundingClientRect().top <= top) current = section.dataset.propertySection ?? current;
			}
			setActiveSection(current);
		};
		update();
		scroller.addEventListener("scroll", update, { passive: true });
		return () => scroller.removeEventListener("scroll", update);
	}, [selected]);
	if (target) return <SelectorProperties id={target} />;
	const node = selected ? tree.nodes[selected] : undefined;
	if (!node && themeElement)
		return <ThemeElementProperties key={`${themeElement.file}:${themeElement.selection}`} el={themeElement} />;
	if (!node || selected === tree.rootNodeId)
		return (
			<p className="p-3 text-sm text-muted-foreground">
				Select something on the page or in Layers. Double-click text to edit it in place.
			</p>
		);
	if (node.locked)
		return (
			<PanelSection id="locked" title={nodeName(node)} icon={ModuleIconFor(node.moduleId)}>
				<p className="text-sm text-muted-foreground">Locked. Unlock it in Layers to edit.</p>
			</PanelSection>
		);
	const component = node.moduleId === "ref" ? visual.components.find((c) => c.id === node.props.ref) : undefined;
	const navigate = (section: string) => {
		if (section === "end") {
			scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
			return;
		}
		setActiveSection(section);
		scrollRef.current?.querySelector<HTMLElement>(`[data-property-section="${section}"]`)?.scrollIntoView({
			behavior: "smooth",
			block: "start",
		});
	};
	return (
		<NodeInspector
			node={node}
			component={component}
			componentNames={componentNames}
			editing={!!editing}
			onNavigate={navigate}
			activeSection={activeSection}
			scrollRef={scrollRef}
		/>
	);
}

function ModuleIconFor(moduleId: string): Icon {
	return MODULE_ICONS[moduleId] ?? Box;
}

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

const TAGS = [
	"div",
	"section",
	"article",
	"aside",
	"header",
	"footer",
	"main",
	"nav",
	"p",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"span",
	"a",
	"button",
	"ul",
	"ol",
	"li",
	"figure",
	"blockquote",
	"strong",
	"em",
	"small",
	"label",
];

const TAG_LABELS: Record<string, string> = {
	div: "Div",
	section: "Section",
	article: "Article",
	aside: "Aside",
	header: "Header",
	footer: "Footer",
	main: "Main",
	nav: "Nav",
	p: "Paragraph",
	span: "Span",
	a: "Link",
	button: "Button",
	ul: "Unordered list",
	ol: "Ordered list",
	li: "List item",
	figure: "Figure",
	blockquote: "Quote",
	strong: "Strong",
	em: "Emphasis",
	small: "Small",
	label: "Label",
};

const tagLabel = (tag: string): string =>
	/^h[1-6]$/.test(tag) ? `Heading ${tag.slice(1)}` : (TAG_LABELS[tag] ?? tag.charAt(0).toUpperCase() + tag.slice(1));

/** The module icon for a theme element, chosen from its HTML tag. */
function themeIcon(tag: string): Icon {
	if (/^h[1-6]$/.test(tag)) return Heading;
	if (tag === "img") return Image;
	if (tag === "a") return Link;
	if (tag === "button") return Pointer;
	if (tag === "ul" || tag === "ol" || tag === "li") return Rows3;
	if (tag === "p" || tag === "span" || tag === "strong" || tag === "em" || tag === "small" || tag === "label")
		return Pilcrow;
	return Box;
}

/** One style of a theme element; typed values are saved on blur or Enter (each save rewrites the theme file). */
function ThemeStyleInput({
	prop,
	value,
	placeholder,
	onCommit,
}: {
	prop: string;
	value: string;
	placeholder?: string;
	onCommit: (value: string) => void;
}) {
	const inputId = useId();
	const [draft, setDraft] = useState(value);
	const label = styleLabel(prop);
	useEffect(() => setDraft(value), [value]);
	const commit = (v: string) => v !== value && onCommit(v);
	if (SELECTS[prop])
		return (
			<div className="grid gap-1">
				<PropertyLabel htmlFor={inputId}>{label}</PropertyLabel>
				<Select
					id={inputId}
					size="sm"
					value={value}
					aria-label={prop}
					onChange={(e) => commit(e.target.value)}
					className="h-8 border-[#34343a] bg-[#19191c] text-xs"
				>
					{[...new Set([...SELECTS[prop], value])].map((o) => (
						<option key={o} value={o}>
							{o || (placeholder ? `— (${placeholder})` : "—")}
						</option>
					))}
				</Select>
			</div>
		);
	return (
		<div className="grid gap-1">
			<PropertyLabel htmlFor={inputId}>{label}</PropertyLabel>
			<div className="flex items-center gap-1">
				<Input
					id={inputId}
					value={draft}
					placeholder={placeholder}
					list={listFor(prop)}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={() => commit(draft)}
					onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
					aria-label={prop}
					className="h-8 border-[#34343a] bg-[#19191c] text-xs"
				/>
				{COLOR.test(prop) && (
					<input
						type="color"
						aria-label={`${label} picker`}
						value={/^#[0-9a-f]{6}$/i.test(draft) ? draft : "#000000"}
						onChange={(e) => {
							setDraft(e.target.value);
							commit(e.target.value);
						}}
						className="h-8 w-8 shrink-0 rounded border border-[#34343a] bg-transparent"
					/>
				)}
			</div>
		</div>
	);
}

function ThemeSegmented({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: readonly { value: string; label: ReactNode }[];
	onChange: (value: string) => void;
}) {
	return (
		<div className="grid gap-1">
			<PropertyLabel>{label}</PropertyLabel>
			<div className="grid grid-cols-2 gap-1 rounded-md border border-[#34343a] bg-[#19191c] p-1">
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						aria-pressed={value === option.value}
						onClick={() => onChange(option.value)}
						className={`flex h-7 items-center justify-center gap-1.5 rounded text-[11px] font-medium ${value === option.value ? "bg-[#2c2c31] text-white" : "text-[#9b9ba3] hover:text-white"}`}
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	);
}

/** Layout rows for a theme element: the same Flex/Grid switch as a page block, written as Tailwind classes. */
function ThemeLayoutControls({
	keys,
	query,
	valueOf,
	inherited,
	commit,
}: {
	keys: readonly string[];
	query: string;
	valueOf: (prop: string) => string;
	inherited: (prop: string) => string | undefined;
	commit: (prop: string, value: string) => void;
}) {
	const displayId = useId();
	const q = query.trim().toLowerCase();
	const visible = (key: string) =>
		!q || key.includes(q) || styleLabel(key).toLowerCase().includes(q) || "layout".includes(q);
	const showDisplay = keys.includes("display") && visible("display");
	return (
		<>
			{showDisplay && (
				<ThemeSegmented
					label="Display"
					value={valueOf("display")}
					options={[
						{
							value: "flex",
							label: (
								<>
									<Rows3 size={12} /> Flex
								</>
							),
						},
						{
							value: "grid",
							label: (
								<>
									<Grid2x2 size={12} /> Grid
								</>
							),
						},
					]}
					onChange={(v) => commit("display", v)}
				/>
			)}
			{keys
				.filter((key) => key !== "display" && visible(key))
				.map((key) => (
					<ThemeStyleInput
						key={`${key}:${valueOf(key)}`}
						prop={key}
						value={valueOf(key)}
						placeholder={inherited(key)}
						onCommit={(v) => commit(key, v)}
					/>
				))}
			{showDisplay && (
				<details className="text-[11px] text-[#8b8b93]">
					<summary className="cursor-pointer select-none py-1 hover:text-white">Advanced display</summary>
					<div className="grid gap-2 pt-1">
						<div className="grid gap-1">
							<PropertyLabel htmlFor={displayId}>Display</PropertyLabel>
							<Select
								id={displayId}
								size="sm"
								value={valueOf("display")}
								aria-label="Display"
								onChange={(e) => commit("display", e.target.value)}
								className="h-8 border-[#34343a] bg-[#19191c] text-xs"
							>
								{(SELECTS.display ?? []).map((option) => (
									<option key={option} value={option}>
										{option || "auto"}
									</option>
								))}
							</Select>
						</div>
					</div>
				</details>
			)}
		</>
	);
}

/** Position rows for a theme element, with the Relative/Absolute switch of the block inspector. */
function ThemePositionControls({
	keys,
	query,
	valueOf,
	inherited,
	commit,
}: {
	keys: readonly string[];
	query: string;
	valueOf: (prop: string) => string;
	inherited: (prop: string) => string | undefined;
	commit: (prop: string, value: string) => void;
}) {
	const positionId = useId();
	const q = query.trim().toLowerCase();
	const visible = (key: string) =>
		!q || key.includes(q) || styleLabel(key).toLowerCase().includes(q) || "position".includes(q);
	const showPosition = keys.includes("position") && visible("position");
	return (
		<>
			{showPosition && (
				<ThemeSegmented
					label="Position"
					value={valueOf("position")}
					options={[
						{ value: "relative", label: "Relative" },
						{ value: "absolute", label: "Absolute" },
					]}
					onChange={(v) => commit("position", v)}
				/>
			)}
			{keys
				.filter((key) => key !== "position" && visible(key))
				.map((key) => (
					<ThemeStyleInput
						key={`${key}:${valueOf(key)}`}
						prop={key}
						value={valueOf(key)}
						placeholder={inherited(key)}
						onCommit={(v) => commit(key, v)}
					/>
				))}
			{showPosition && (
				<details className="text-[11px] text-[#8b8b93]">
					<summary className="cursor-pointer select-none py-1 hover:text-white">Advanced position</summary>
					<div className="grid gap-2 pt-1">
						<div className="grid gap-1">
							<PropertyLabel htmlFor={positionId}>Position</PropertyLabel>
							<Select
								id={positionId}
								size="sm"
								value={valueOf("position")}
								aria-label="Position"
								onChange={(e) => commit("position", e.target.value)}
								className="h-8 border-[#34343a] bg-[#19191c] text-xs"
							>
								{(SELECTS.position ?? []).map((option) => (
									<option key={option} value={option}>
										{option || "static"}
									</option>
								))}
							</Select>
						</div>
					</div>
				</details>
			)}
		</>
	);
}

/** The theme element's Tailwind breakpoint and state, kept apart from the page block context. */
function ThemeContextBar({
	breakpoint,
	state,
	variant,
	onBreakpoint,
	onState,
}: {
	breakpoint: string;
	state: string;
	variant: string;
	onBreakpoint: (value: string) => void;
	onState: (value: string) => void;
}) {
	const visual = useStore($visual);
	const breakpointId = useId();
	const stateId = useId();
	return (
		<>
			<div className="grid grid-cols-2 gap-2">
				<div className="grid gap-1">
					<PropertyLabel htmlFor={breakpointId}>Breakpoint</PropertyLabel>
					<Select
						id={breakpointId}
						size="sm"
						value={breakpoint}
						onChange={(e) => onBreakpoint(e.target.value)}
						className="h-8 border-[#34343a] bg-[#19191c] text-xs"
					>
						<option value="">Base</option>
						{visual.breakpoints
							.toSorted((a, b) => b.width - a.width)
							.map((b) => (
								<option key={b.id} value={b.id}>
									{b.label} (≤{b.width}px)
								</option>
							))}
					</Select>
				</div>
				<div className="grid gap-1">
					<PropertyLabel htmlFor={stateId}>State</PropertyLabel>
					<Select
						id={stateId}
						size="sm"
						value={state}
						onChange={(e) => onState(e.target.value)}
						className="h-8 border-[#34343a] bg-[#19191c] text-xs"
					>
						<option value="">None</option>
						{STATES.map((s) => (
							<option key={s} value={s}>
								{s}
							</option>
						))}
					</Select>
				</div>
			</div>
			<p className="text-[11px] leading-4 text-muted-foreground">
				Saved as Tailwind 4 classes
				{variant && (
					<>
						{" "}
						under <code>{variant}</code>
					</>
				)}
				. Values are Tailwind values (<code>4</code>, <code>full</code>, <code>red-500</code>) or CSS (
				<code>320px</code>, <code>#fff</code>).
			</p>
		</>
	);
}

/** The theme element's classes as removable pills, mirroring the selector picker of a page block. */
function ThemeClassPicker({
	classes,
	tailwind,
	onCommit,
}: {
	classes: string[];
	tailwind: boolean;
	onCommit: (classes: string[]) => void;
}) {
	const visual = useStore($visual);
	const [draft, setDraft] = useState("");
	const items = [...new Set(classes)];
	const tokens = frameworkTokens(visual.framework).classes;
	const add = () => {
		const names = draft
			.trim()
			.replace(/^\./, "")
			.split(/[\s,]+/)
			.filter(Boolean);
		const next = [...new Set([...items, ...names])];
		if (next.length !== items.length) onCommit(next);
		setDraft("");
	};
	return (
		<div className="grid gap-2">
			<div className="relative">
				<input
					aria-label="Add class"
					placeholder="Add class…"
					list="ve-theme-classes"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " " || e.key === ",") {
							e.preventDefault();
							add();
						}
					}}
					onBlur={add}
					className="h-8 w-full rounded-md border border-[#34343a] bg-[#19191c] pr-7 pl-2.5 text-xs text-[#e4e4e7] outline-none placeholder:text-[#71717a] focus:border-[#6d5bd0]"
				/>
				<ChevronDown
					size={12}
					aria-hidden="true"
					className="pointer-events-none absolute top-2.5 right-2 text-[#71717a]"
				/>
			</div>
			{items.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{items.map((name) => (
						<span
							key={name}
							className="inline-flex h-6 items-center gap-1 rounded-md bg-[#3a2b1e] px-1.5 text-[11px] text-[#f0b37e]"
						>
							<FileText size={10} className="shrink-0 opacity-70" />
							<span className="font-mono">{tailwind ? name : `.${name}`}</span>
							<button
								type="button"
								aria-label={`Remove ${name}`}
								className="text-[#b28a68] hover:text-white"
								onClick={() => onCommit(items.filter((item) => item !== name))}
							>
								<X size={10} />
							</button>
						</span>
					))}
				</div>
			)}
			<datalist id="ve-theme-classes">
				{tokens.map((token) => (
					<option key={token} value={token} />
				))}
			</datalist>
		</div>
	);
}

/** Text, tag and inline style of a theme element, saved on blur. */
function ThemeElementFields({ el }: { el: ThemeElement }) {
	const [text, setText] = useState(el.text ?? "");
	const [inline, setInline] = useState(el.style);
	const textId = useId();
	const tagId = useId();
	const inlineId = useId();
	useEffect(() => setText(el.text ?? ""), [el.text]);
	useEffect(() => setInline(el.style), [el.style]);
	return (
		<>
			{el.text !== null && (
				<div className="grid gap-1">
					<PropertyLabel htmlFor={textId}>Text</PropertyLabel>
					<Textarea
						id={textId}
						aria-label="Text"
						value={text}
						rows={3}
						onChange={(e) => setText(e.target.value)}
						onBlur={() => text !== el.text && void editThemeElement({ action: "text", value: text })}
						className="min-h-[72px] border-[#34343a] bg-[#19191c] text-xs"
					/>
				</div>
			)}
			<div className="grid gap-1">
				<PropertyLabel htmlFor={tagId}>Tag</PropertyLabel>
				<Select
					id={tagId}
					size="sm"
					value={el.tag}
					aria-label="Tag"
					onChange={(e) => void editThemeElement({ action: "tag", name: e.target.value })}
					className="h-8 border-[#34343a] bg-[#19191c] text-xs"
				>
					{[...new Set([el.tag, ...TAGS])].map((tag) => (
						<option key={tag} value={tag}>
							{tagLabel(tag)}
						</option>
					))}
				</Select>
			</div>
			<div className="grid gap-1">
				<PropertyLabel htmlFor={inlineId}>Inline style</PropertyLabel>
				<Input
					id={inlineId}
					aria-label="Inline style"
					value={inline}
					placeholder="color: red; padding: 1rem"
					onChange={(e) => setInline(e.target.value)}
					onBlur={() =>
						inline !== el.style && void editThemeElement({ action: "attrs", attrs: { style: inline.trim() || null } })
					}
					onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
					className="h-8 border-[#34343a] bg-[#19191c] text-xs"
				/>
			</div>
		</>
	);
}

const setAttr = (attr: string, v: string | null) => void editThemeElement({ action: "attrs", attrs: { [attr]: v } });
const commitThemeClasses = (classes: string[]) =>
	void editThemeElement({ action: "attrs", attrs: { class: classes.join(" ") || null } });

function ThemeAttributeRow({ name, value }: { name: string; value: string }) {
	const inputId = useId();
	return (
		<div className="grid gap-1">
			<PropertyLabel htmlFor={inputId}>{name}</PropertyLabel>
			<div className="flex items-center gap-1">
				<Input
					id={inputId}
					aria-label={name}
					defaultValue={value}
					onBlur={(e) => e.target.value !== value && setAttr(name, e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
					className="h-8 border-[#34343a] bg-[#19191c] text-xs"
				/>
				<IconButton label={`Remove ${name}`} size="icon-sm" onClick={() => setAttr(name, null)}>
					<X size={12} />
				</IconButton>
			</div>
		</div>
	);
}

/** The element's HTML attributes (Instatic's Attributes tab); values made by code are left to Code view. */
function ThemeAttributes({ attrs }: { attrs: Record<string, string> }) {
	const [name, setName] = useState("");
	const [value, setValue] = useState("");
	const nameId = useId();
	const valueId = useId();
	return (
		<>
			{Object.entries(attrs).map(([key, attrValue]) => (
				<ThemeAttributeRow key={`${key}=${attrValue}`} name={key} value={attrValue} />
			))}
			<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-1">
				<div className="grid gap-1">
					<PropertyLabel htmlFor={nameId}>Name</PropertyLabel>
					<Input
						id={nameId}
						placeholder="aria-label"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="h-8 border-[#34343a] bg-[#19191c] text-xs"
					/>
				</div>
				<div className="grid gap-1">
					<PropertyLabel htmlFor={valueId}>Value</PropertyLabel>
					<Input
						id={valueId}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						className="h-8 border-[#34343a] bg-[#19191c] text-xs"
					/>
				</div>
				<Button
					size="sm"
					variant="secondary"
					className="h-8"
					disabled={!/^[a-zA-Z_@:][\w:.@-]*$/.test(name)}
					onClick={() => {
						setAttr(name, value);
						setName("");
						setValue("");
					}}
				>
					Add
				</Button>
			</div>
		</>
	);
}

/**
 * An element of the theme's own markup, with Instatic's inspector: its text and tag, every style group and its
 * attributes, written straight into the theme's `.astro` file. Styles are Tailwind 4 classes (under the chosen
 * breakpoint and state) when the theme uses Tailwind, inline style otherwise. Anything made by code (a `{...}`
 * expression) is left to Code view.
 */
function ThemeElementProperties({ el }: { el: ThemeElement }) {
	const visual = useStore($visual);
	const [view, setView] = useState<"styles" | "attributes">("styles");
	const [query, setQuery] = useState("");
	const [showContext, setShowContext] = useState(false);
	const [breakpoint, setBreakpoint] = useState("");
	const [state, setState] = useState("");
	const [newProp, setNewProp] = useState("");
	const [activeSection, setActiveSection] = useState("module");
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const path = codePath(el.file);
	const line = el.loc.split(":")[0];
	const classes = el.cls.split(/\s+/).filter(Boolean);
	const styles = parseStyle(el.style);
	const variant = variantFor(visual.breakpoints.find((b) => b.id === breakpoint)?.width, state);
	const valueOf = (prop: string) => (el.tailwind ? classValue(classes, prop, variant) : (styles[prop] ?? ""));
	const inherited = (prop: string) => {
		if (!variant) return el.computed[prop];
		const base = el.tailwind ? classValue(classes, prop, "") : styles[prop];
		return base || el.computed[prop];
	};
	const commit = (prop: string, v: string) =>
		void editThemeElement({
			action: "attrs",
			attrs: el.tailwind
				? { class: withClassValue(classes, prop, variant, v).join(" ") || null }
				: { style: printStyle({ ...styles, [prop]: v }) || null },
		});
	const q = query.trim().toLowerCase();
	const matches = (key: string) => !q || key.includes(q) || styleLabel(key).toLowerCase().includes(q);
	const groups = STYLE_GROUPS.map(([group, keys]) => {
		const groupHit = !q || group.toLowerCase().includes(q);
		const visibleKeys = groupHit ? keys : keys.filter(matches);
		return { group, keys: visibleKeys, show: !q || groupHit || visibleKeys.length > 0 };
	}).filter(({ show }) => show);
	const extra = el.tailwind ? [] : Object.keys(styles).filter((key) => !GROUPED.has(key) && matches(key));
	const classLabel = classes[0];
	const railStyles: Styles = {};
	for (const [, keys] of STYLE_GROUPS) {
		for (const key of keys) {
			const value = valueOf(key);
			if (value) railStyles[key] = value;
			else if (variant) {
				const base = el.tailwind ? classValue(classes, key, "") : styles[key];
				if (base) railStyles[key] = base;
			}
		}
	}
	useEffect(() => {
		if (view !== "styles") return;
		const scroller = scrollRef.current;
		if (!scroller) return;
		const update = () => {
			const top = scroller.getBoundingClientRect().top + 48;
			let current = "module";
			for (const section of scroller.querySelectorAll<HTMLElement>("[data-property-section]")) {
				if (section.getBoundingClientRect().top <= top) current = section.dataset.propertySection ?? current;
			}
			setActiveSection(current);
		};
		update();
		scroller.addEventListener("scroll", update, { passive: true });
		return () => scroller.removeEventListener("scroll", update);
	}, [view, query, el.file, el.loc]);
	const scrollTo = (section: string) => {
		const scroller = scrollRef.current;
		if (!scroller) return;
		if (section === "end") {
			scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
			return;
		}
		setActiveSection(section);
		scroller.querySelector<HTMLElement>(`[data-property-section="${section}"]`)?.scrollIntoView({
			behavior: "smooth",
			block: "start",
		});
	};
	const navigate = (section: string) => {
		if (section === "context") {
			setShowContext(true);
			requestAnimationFrame(() => requestAnimationFrame(() => scrollTo("context")));
			return;
		}
		scrollTo(section);
	};
	const addProp = () => {
		const prop = newProp.trim().toLowerCase();
		if (/^-{0,2}[a-z][a-z0-9-]*$/.test(prop)) commit(prop, "initial");
		setNewProp("");
	};
	const actions = (
		<div className="flex items-center gap-0.5 text-[#71717a] opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
			<IconButton label="Move up" size="icon-sm" onClick={() => void editThemeElement({ action: "move", by: -1 })}>
				<ArrowUp size={13} />
			</IconButton>
			<IconButton label="Move down" size="icon-sm" onClick={() => void editThemeElement({ action: "move", by: 1 })}>
				<ArrowDown size={13} />
			</IconButton>
			<IconButton label="Duplicate" size="icon-sm" onClick={() => void editThemeElement({ action: "duplicate" })}>
				<Copy size={13} />
			</IconButton>
			<IconButton label="Open in Code" size="icon-sm" onClick={() => $codeFile.set(path)}>
				<Pencil size={13} />
			</IconButton>
			<IconButton
				label="Delete"
				size="icon-sm"
				onClick={() => confirm(`Delete this <${el.tag}> from ${path}?`) && void editThemeElement({ action: "delete" })}
			>
				<Trash2 size={13} />
			</IconButton>
		</div>
	);
	const fields = <ThemeElementFields el={el} />;
	const classPicker = <ThemeClassPicker classes={classes} tailwind={el.tailwind} onCommit={commitThemeClasses} />;
	return (
		<div className="flex h-full min-h-0 bg-[#111113]">
			<div className="flex min-w-0 flex-1 flex-col">
				<div
					role="tablist"
					aria-label="Element options"
					className="flex gap-4 border-b border-[#242428] px-4 pt-3 pb-2"
				>
					<button
						type="button"
						role="tab"
						aria-selected={view === "styles"}
						className={`text-xs font-semibold ${view === "styles" ? "text-white" : "text-[#71717a] hover:text-[#d4d4d8]"}`}
						onClick={() => setView("styles")}
					>
						Styles
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={view === "attributes"}
						className={`text-xs font-semibold ${view === "attributes" ? "text-white" : "text-[#71717a] hover:text-[#d4d4d8]"}`}
						onClick={() => setView("attributes")}
					>
						Attributes
					</button>
				</div>
				{view === "styles" && <div className="px-3 py-3">{classPicker}</div>}
				<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
					{view === "styles" ? (
						<>
							<PanelSection id="module" title={`<${el.tag}>`} icon={themeIcon(el.tag)} action={actions}>
								<p className="text-[11px] leading-4 break-all text-muted-foreground">
									Theme code: {path}, line {line}. Changes are saved to this file.
								</p>
								{fields}
							</PanelSection>
							{el.tailwind && (showContext || breakpoint || state) && (
								<PanelSection id="context" title="Context & state" icon={SlidersHorizontal} defaultOpen>
									<ThemeContextBar
										breakpoint={breakpoint}
										state={state}
										variant={variant}
										onBreakpoint={setBreakpoint}
										onState={setState}
									/>
								</PanelSection>
							)}
							{groups.map(({ group, keys }) => {
								const meta = GROUP_META[group];
								return (
									<PanelSection key={group} id={meta?.id ?? group.toLowerCase()} title={group} icon={meta?.icon}>
										{group === "Layout" ? (
											<ThemeLayoutControls
												keys={keys}
												query={q}
												valueOf={valueOf}
												inherited={inherited}
												commit={commit}
											/>
										) : group === "Position" ? (
											<ThemePositionControls
												keys={keys}
												query={q}
												valueOf={valueOf}
												inherited={inherited}
												commit={commit}
											/>
										) : (
											keys.map((key) => (
												<ThemeStyleInput
													key={`${key}:${variant}:${valueOf(key)}`}
													prop={key}
													value={valueOf(key)}
													placeholder={inherited(key)}
													onCommit={(v) => commit(key, v)}
												/>
											))
										)}
									</PanelSection>
								);
							})}
							{groups.length === 0 && extra.length === 0 && q && (
								<p className="px-3 py-6 text-center text-xs text-[#71717a]">No matching styles.</p>
							)}
							<PanelSection id="other" title="Other styles" icon={EllipsisVertical} defaultOpen={false}>
								{extra.map((key) => (
									<ThemeStyleInput
										key={`${key}:${valueOf(key)}`}
										prop={key}
										value={valueOf(key)}
										placeholder={inherited(key)}
										onCommit={(v) => commit(key, v)}
									/>
								))}
								<div className="flex items-center gap-1">
									<Input
										aria-label="CSS property"
										placeholder="opacity"
										value={newProp}
										onChange={(e) => setNewProp(e.target.value)}
										onKeyDown={(e) => {
											if (e.key !== "Enter") return;
											e.preventDefault();
											addProp();
										}}
										className="h-8 border-[#34343a] bg-[#19191c] text-xs"
									/>
									<Button size="sm" variant="secondary" className="h-8" onClick={addProp}>
										Add
									</Button>
								</div>
							</PanelSection>
						</>
					) : (
						<div className="p-3">
							<PanelSection id="element" title="Element" icon={themeIcon(el.tag)}>
								<p className="text-[11px] leading-4 break-all text-muted-foreground">
									Theme code: {path}, line {line}. Changes are saved to this file.
								</p>
								{fields}
							</PanelSection>
							<PanelSection id="attributes" title="Attributes" icon={Tags}>
								<ThemeAttributes attrs={el.attrs} />
							</PanelSection>
							<PanelSection id="classes" title="Classes" icon={Layout}>
								{classPicker}
							</PanelSection>
						</div>
					)}
				</div>
				{view === "styles" && (
					<StyleSearch value={query} onChange={setQuery} classLabel={classLabel} classPrefix={el.tailwind ? "" : "."} />
				)}
			</div>
			{view === "styles" && (
				<StyleRail
					moduleIcon={themeIcon(el.tag)}
					styles={railStyles}
					active={activeSection}
					onSelect={navigate}
					showContext={el.tailwind}
				/>
			)}
		</div>
	);
}
