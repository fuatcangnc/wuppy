import {
	AlignCenter,
	AlignCenterHorizontal,
	AlignCenterVertical,
	AlignEndHorizontal,
	AlignEndVertical,
	AlignHorizontalDistributeCenter,
	AlignHorizontalSpaceAround,
	AlignHorizontalSpaceBetween,
	AlignJustify,
	AlignLeft,
	AlignRight,
	AlignStartHorizontal,
	AlignStartVertical,
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	Baseline,
	Box,
	ChevronDown,
	ChevronsDown,
	Columns3,
	Component as ComponentIcon,
	Copy,
	EllipsisVertical,
	FileText,
	Group,
	Grid2x2,
	Heading,
	IconArrowAutofitHeight,
	IconArrowAutofitWidth,
	IconArrowsHorizontal,
	IconArrowsMaximize,
	IconArrowsMinimize,
	IconArrowsVertical,
	IconAspectRatio,
	IconOverline,
	Image,
	Layout,
	Link,
	Move,
	MoveVertical,
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
	Strikethrough,
	Tags,
	Trash2,
	Type,
	Underline,
	X,
} from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { frameworkTokens, overrideKey, STATES, type Styles } from "@wuppycms/visual-editor";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ColorPicker } from "./ColorPicker.tsx";
import { uploadImage } from "../../stores/content.ts";
import { Button, IconButton, Input, Select, Textarea, toast } from "../../ui/index.tsx";
import { $themeElement, codePath, editThemeElement, liveThemeEdit, type ThemeElement } from "./theme-element.ts";
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
	setStyles,
	wrapSelected,
} from "./store.ts";
import { updateNodeProps, type VNode } from "./tree.ts";

const COLOR = /(^|-)color$/;
const SPACE = /^(margin|padding|gap|top|right|bottom|left)/;
type Icon = typeof Square;

/** Which framework tokens a property's input suggests (token-aware inputs). */
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
			<EnumControl
				prop={prop}
				label={label}
				value={value}
				options={SELECTS[prop]}
				inherited={inherited}
				onChange={set}
			/>
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
				{COLOR.test(prop) && <ColorPicker label={label} value={value} onChange={set} />}
			</div>
			{bad && <p className="text-[10px] text-destructive">Not allowed</p>}
		</div>
	);
}

const SIDES = ["top", "right", "bottom", "left"] as const;
type Side = (typeof SIDES)[number];
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"] as const;
type Corner = (typeof CORNERS)[number];

const sideName = (side: Side) => side.charAt(0).toUpperCase() + side.slice(1);
const cornerName = (corner: Corner) =>
	corner
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");

/** A value field that writes on blur or Enter, so linked sides save in one change. */
function DraftInput({
	value,
	placeholder,
	ariaLabel,
	onCommit,
	list,
	suffix,
	className = "",
}: {
	value: string;
	placeholder?: string;
	ariaLabel: string;
	onCommit: (value: string) => void;
	list?: string;
	suffix?: string;
	className?: string;
}) {
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);
	const commit = () => {
		const next = draft.trim();
		if (next !== value) onCommit(next);
	};
	return (
		<div className={`relative min-w-0 ${className}`}>
			<input
				aria-label={ariaLabel}
				value={draft}
				placeholder={placeholder}
				list={list}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key !== "Enter") return;
					e.preventDefault();
					e.currentTarget.blur();
				}}
				className={`h-8 w-full min-w-0 rounded-md border border-[#34343a] bg-[#19191c] px-2 text-xs text-[#e4e4e7] outline-none placeholder:text-[#71717a] focus:border-[#6d5bd0] ${suffix ? "pr-5" : ""}`}
			/>
			{suffix && (
				<span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[9px] text-[#71717a]">
					{suffix}
				</span>
			)}
		</div>
	);
}

/** Compact label + control row. */
function ControlRow({ label, icon: RowIcon, children }: { label: string; icon?: Icon; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-2">
			<PropertyLabel>
				<span className="inline-flex items-center gap-1 whitespace-nowrap">
					{RowIcon && <RowIcon size={11} className="shrink-0 text-[#71717a]" aria-hidden="true" />}
					{label}
				</span>
			</PropertyLabel>
			<div className="min-w-0">{children}</div>
		</div>
	);
}

interface SegmentOption {
	value: string;
	label?: string;
	icon?: Icon;
	ariaLabel?: string;
	title?: string;
}

function IconSegmented({
	label,
	groupLabel,
	value,
	options,
	columns,
	onChange,
}: {
	label: string;
	groupLabel?: string;
	value: string;
	options: readonly SegmentOption[];
	columns?: number;
	onChange: (value: string) => void;
}) {
	return (
		<ControlRow label={label}>
			<div
				role="group"
				aria-label={groupLabel ?? label}
				className={`min-h-8 rounded-md border border-[#34343a] bg-[#19191c] p-0.5 ${columns ? "grid gap-0.5" : "flex items-stretch gap-1"}`}
				style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
			>
				{options.map((option) => {
					const SegmentIcon = option.icon;
					const selected = value === option.value;
					return (
						<button
							key={option.value}
							type="button"
							aria-pressed={selected}
							aria-label={option.ariaLabel}
							title={option.title ?? option.ariaLabel}
							onClick={() => onChange(option.value)}
							className={`flex h-6 min-w-0 flex-1 items-center justify-center gap-1 rounded px-0.5 text-[11px] font-medium transition-colors ${selected ? "bg-[#2c2c31] text-white" : "text-[#9b9ba3] hover:text-white"}`}
						>
							{SegmentIcon && <SegmentIcon size={13} className="shrink-0" aria-hidden="true" />}
							{option.label && <span className="truncate">{option.label}</span>}
						</button>
					);
				})}
			</div>
		</ControlRow>
	);
}

/** An inline enum picker: no native dropdown, so every choice is visible and one click away. */
function EnumControl({
	prop,
	label,
	value,
	options,
	inherited,
	onChange,
}: {
	prop: string;
	label: string;
	value: string;
	options: readonly string[];
	inherited?: string;
	onChange: (value: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const list = [...new Set([...options, ...(value && !options.includes(value) ? [value] : [])])];
	const longest = Math.max(...list.map((option) => option.length));
	const icons = list.every((option) => !option || ENUM_ICONS[prop]?.[option]);
	// One row; the rest sit behind "…" (the chosen value always stays in view).
	const fit = icons ? 6 : longest > 6 ? 3 : 4;
	const more = list.length > fit;
	let shown = list;
	if (more && !open) {
		shown = list.slice(0, fit - 1);
		if (!shown.includes(value)) shown[shown.length - 1] = value;
	}
	const columns = open ? (longest > 4 ? 2 : Math.min(list.length, 4)) : shown.length + (more ? 1 : 0);
	const pick = (option: string) => {
		setOpen(false);
		onChange(option);
	};
	return (
		<ControlRow label={label}>
			<div
				role="group"
				aria-label={prop}
				className="grid gap-0.5 rounded-md border border-[#34343a] bg-[#19191c] p-0.5"
				style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
			>
				{shown.map((option, index) => {
					const selected = value === option;
					const OptionIcon = ENUM_ICONS[prop]?.[option];
					const text = option || "—";
					return (
						<button
							key={`${option}:${index}`}
							type="button"
							aria-label={`${label}: ${option || "Default"}`}
							aria-pressed={selected}
							title={option ? option : inherited ? `Default (${inherited})` : "Default"}
							onClick={() => pick(option)}
							className={`flex h-6 min-w-0 items-center justify-center gap-1 rounded px-1 text-[10px] font-medium transition-colors ${selected ? "bg-[#2c2c31] text-white" : "text-[#9b9ba3] hover:text-white"}`}
						>
							{OptionIcon ? (
								<OptionIcon size={12} className="shrink-0" aria-hidden="true" />
							) : (
								<span className="truncate">{text}</span>
							)}
						</button>
					);
				})}
				{more && (
					<button
						type="button"
						aria-expanded={open}
						aria-label={open ? `Fewer ${label} choices` : `More ${label} choices`}
						title={open ? "Fewer" : "More"}
						onClick={() => setOpen(!open)}
						className="flex h-6 min-w-0 items-center justify-center rounded px-1 text-[11px] font-medium text-[#9b9ba3] hover:text-white"
					>
						{open ? "‹" : "…"}
					</button>
				)}
			</div>
		</ControlRow>
	);
}

function BoxSidePicker({
	name,
	active,
	onSelect,
}: {
	name: string;
	active: "all" | Side;
	onSelect: (side: "all" | Side) => void;
}) {
	const lower = name.toLowerCase();
	const edges: { side: Side; hit: string; mark: string }[] = [
		{
			side: "top",
			hit: "top-0 left-1 right-1 h-[9px]",
			mark: "top-[3px] left-[3px] right-[3px] h-[5px] rounded-t-[2px] border-t-[1.5px] border-r-[1.5px] border-l-[1.5px]",
		},
		{
			side: "right",
			hit: "right-0 top-1 bottom-1 w-[9px]",
			mark: "right-[3px] top-[3px] bottom-[3px] w-[5px] rounded-r-[2px] border-t-[1.5px] border-r-[1.5px] border-b-[1.5px]",
		},
		{
			side: "bottom",
			hit: "bottom-0 left-1 right-1 h-[9px]",
			mark: "bottom-[3px] left-[3px] right-[3px] h-[5px] rounded-b-[2px] border-r-[1.5px] border-b-[1.5px] border-l-[1.5px]",
		},
		{
			side: "left",
			hit: "left-0 top-1 bottom-1 w-[9px]",
			mark: "left-[3px] top-[3px] bottom-[3px] w-[5px] rounded-l-[2px] border-t-[1.5px] border-b-[1.5px] border-l-[1.5px]",
		},
	];
	return (
		<div
			role="group"
			aria-label={`${name} sides`}
			className="relative size-9 shrink-0 rounded-md border border-[#34343a] bg-[#141416]"
		>
			{edges.map(({ side, hit, mark }) => {
				const selected = active === side;
				return (
					<button
						key={side}
						type="button"
						aria-label={`Edit ${side} ${lower}`}
						aria-pressed={selected}
						title={`Edit ${side} ${lower}`}
						onClick={() => onSelect(side)}
						className={`group absolute ${hit}`}
					>
						<span
							className={`pointer-events-none absolute border-[#71717a] transition-colors ${mark} ${selected ? "border-[#f4f4f5]" : "group-hover:border-[#a1a1aa]"}`}
						/>
					</button>
				);
			})}
			<button
				type="button"
				aria-label={`Edit all ${lower} sides`}
				aria-pressed={active === "all"}
				title={`Edit all ${lower} sides`}
				onClick={() => onSelect("all")}
				className={`absolute inset-[10px] grid place-items-center rounded-[3px] border-[1.5px] transition-colors ${active === "all" ? "border-[#f4f4f5] bg-[#2c2c31]" : "border-[#71717a] hover:border-[#a1a1aa]"}`}
			>
				<span
					className={`size-2 rounded-[1px] border transition-colors ${active === "all" ? "border-[#f4f4f5]" : "border-[#71717a]"}`}
				/>
			</button>
		</div>
	);
}

function BoxCornerPicker({
	name,
	active,
	onSelect,
}: {
	name: string;
	active: "all" | Corner;
	onSelect: (corner: "all" | Corner) => void;
}) {
	const lower = name.toLowerCase();
	const corners: { corner: Corner; hit: string; mark: string }[] = [
		{
			corner: "top-left",
			hit: "top-0 left-0",
			mark: "top-[3px] left-[3px] rounded-tl-[2px] border-t-[1.5px] border-l-[1.5px]",
		},
		{
			corner: "top-right",
			hit: "top-0 right-0",
			mark: "top-[3px] right-[3px] rounded-tr-[2px] border-t-[1.5px] border-r-[1.5px]",
		},
		{
			corner: "bottom-right",
			hit: "bottom-0 right-0",
			mark: "right-[3px] bottom-[3px] rounded-br-[2px] border-r-[1.5px] border-b-[1.5px]",
		},
		{
			corner: "bottom-left",
			hit: "bottom-0 left-0",
			mark: "bottom-[3px] left-[3px] rounded-bl-[2px] border-b-[1.5px] border-l-[1.5px]",
		},
	];
	return (
		<div
			role="group"
			aria-label={`${name} corners`}
			className="relative size-9 shrink-0 rounded-md border border-[#34343a] bg-[#141416]"
		>
			{corners.map(({ corner, hit, mark }) => {
				const selected = active === corner;
				return (
					<button
						key={corner}
						type="button"
						aria-label={`Edit ${cornerName(corner)} ${lower} corner`}
						aria-pressed={selected}
						title={`Edit ${cornerName(corner)} ${lower} corner`}
						onClick={() => onSelect(corner)}
						className={`group absolute size-3.5 ${hit}`}
					>
						<span
							className={`pointer-events-none absolute size-[7px] border-[#71717a] transition-colors ${mark} ${selected ? "border-[#f4f4f5]" : "group-hover:border-[#a1a1aa]"}`}
						/>
					</button>
				);
			})}
			<button
				type="button"
				aria-label={`Edit all ${lower} corners`}
				aria-pressed={active === "all"}
				title={`Edit all ${lower} corners`}
				onClick={() => onSelect("all")}
				className={`absolute inset-[10px] grid place-items-center rounded-[3px] border-[1.5px] transition-colors ${active === "all" ? "border-[#f4f4f5] bg-[#2c2c31]" : "border-[#71717a] hover:border-[#a1a1aa]"}`}
			>
				<span
					className={`size-2 rounded-[1px] border transition-colors ${active === "all" ? "border-[#f4f4f5]" : "border-[#71717a]"}`}
				/>
			</button>
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

interface StyleControlProps {
	keys: readonly string[];
	query: string;
	valueOf: (prop: string) => string;
	inherited: (prop: string) => string | undefined;
	commit: (patch: Record<string, string>) => void;
	renderInput: (prop: string) => ReactNode;
}

const ALIGN_OPTIONS: readonly SegmentOption[] = [
	{ value: "flex-start", icon: AlignStartVertical, ariaLabel: "Align start", title: "align-items: flex-start" },
	{ value: "center", icon: AlignCenterVertical, ariaLabel: "Align center", title: "align-items: center" },
	{ value: "flex-end", icon: AlignEndVertical, ariaLabel: "Align end", title: "align-items: flex-end" },
	{ value: "stretch", icon: MoveVertical, ariaLabel: "Align stretch", title: "align-items: stretch" },
	{ value: "baseline", icon: Baseline, ariaLabel: "Align baseline", title: "align-items: baseline" },
];

const JUSTIFY_OPTIONS: readonly SegmentOption[] = [
	{ value: "start", icon: AlignStartVertical, ariaLabel: "Justify start", title: "justify-items: start" },
	{ value: "center", icon: AlignCenterVertical, ariaLabel: "Justify center", title: "justify-items: center" },
	{ value: "end", icon: AlignEndVertical, ariaLabel: "Justify end", title: "justify-items: end" },
	{ value: "stretch", icon: MoveVertical, ariaLabel: "Justify stretch", title: "justify-items: stretch" },
];

const JUSTIFY_CONTENT_OPTIONS: readonly SegmentOption[] = [
	{
		value: "flex-start",
		icon: AlignStartHorizontal,
		ariaLabel: "Distribute start",
		title: "justify-content: flex-start",
	},
	{
		value: "center",
		icon: AlignCenterHorizontal,
		ariaLabel: "Distribute center",
		title: "justify-content: center",
	},
	{ value: "flex-end", icon: AlignEndHorizontal, ariaLabel: "Distribute end", title: "justify-content: flex-end" },
	{
		value: "space-between",
		icon: AlignHorizontalSpaceBetween,
		ariaLabel: "Space between",
		title: "justify-content: space-between",
	},
	{
		value: "space-around",
		icon: AlignHorizontalSpaceAround,
		ariaLabel: "Space around",
		title: "justify-content: space-around",
	},
	{
		value: "space-evenly",
		icon: AlignHorizontalDistributeCenter,
		ariaLabel: "Space evenly",
		title: "justify-content: space-evenly",
	},
];

const ENUM_ICONS: Record<string, Record<string, Icon>> = {
	"background-repeat": { repeat: Grid2x2, "repeat-x": Rows3, "repeat-y": Columns3, "no-repeat": X },
	"object-fit": {
		cover: IconArrowsMaximize,
		contain: IconArrowsMinimize,
		fill: Square,
		none: X,
		"scale-down": IconArrowsMinimize,
	},
	"pointer-events": { auto: Pointer, none: X },
	"scroll-behavior": { smooth: Move },
	appearance: { none: X },
	"font-style": { normal: X, italic: Type },
};

const DIRECTION_OPTIONS: readonly SegmentOption[] = [
	{ value: "row", icon: ArrowRight, ariaLabel: "Row", title: "flex-direction: row" },
	{ value: "column", icon: ArrowDown, ariaLabel: "Column", title: "flex-direction: column" },
	{ value: "row-reverse", icon: ArrowLeft, ariaLabel: "Row reverse", title: "flex-direction: row-reverse" },
	{ value: "column-reverse", icon: ArrowUp, ariaLabel: "Column reverse", title: "flex-direction: column-reverse" },
];

const WRAP_OPTIONS: readonly SegmentOption[] = [
	{ value: "nowrap", label: "No", ariaLabel: "No wrap", title: "flex-wrap: nowrap" },
	{ value: "wrap", label: "Yes", ariaLabel: "Wrap", title: "flex-wrap: wrap" },
	{ value: "wrap-reverse", label: "Rev", ariaLabel: "Wrap reverse", title: "flex-wrap: wrap-reverse" },
];

const TEXT_ALIGN_OPTIONS: readonly SegmentOption[] = [
	{ value: "left", icon: AlignLeft, ariaLabel: "Align text left", title: "text-align: left" },
	{ value: "center", icon: AlignCenter, ariaLabel: "Align text center", title: "text-align: center" },
	{ value: "right", icon: AlignRight, ariaLabel: "Align text right", title: "text-align: right" },
	{ value: "justify", icon: AlignJustify, ariaLabel: "Align text justify", title: "text-align: justify" },
];

const TEXT_DECORATION_OPTIONS: readonly SegmentOption[] = [
	{ value: "", icon: X, ariaLabel: "No decoration", title: "text-decoration: none" },
	{ value: "underline", icon: Underline, ariaLabel: "Underline", title: "text-decoration: underline" },
	{ value: "line-through", icon: Strikethrough, ariaLabel: "Strikethrough", title: "text-decoration: line-through" },
	{ value: "overline", icon: IconOverline, ariaLabel: "Overline", title: "text-decoration: overline" },
];

const TEXT_TRANSFORM_OPTIONS: readonly SegmentOption[] = [
	{ value: "", icon: X, ariaLabel: "No transform", title: "text-transform: none" },
	{ value: "uppercase", label: "AA", ariaLabel: "Uppercase", title: "text-transform: uppercase" },
	{ value: "capitalize", label: "Aa", ariaLabel: "Capitalize", title: "text-transform: capitalize" },
	{ value: "lowercase", label: "aa", ariaLabel: "Lowercase", title: "text-transform: lowercase" },
];

const SIZE_ICONS: Record<string, Icon> = {
	width: IconArrowAutofitWidth,
	height: IconArrowAutofitHeight,
	"min-width": IconArrowsHorizontal,
	"max-width": IconArrowsHorizontal,
	"min-height": IconArrowsVertical,
	"max-height": IconArrowsVertical,
	"aspect-ratio": IconAspectRatio,
};

const STYLE_ALIASES: Record<string, string> = {
	"text-align": "align left center right justify",
	"text-decoration": "decor decoration underline strike overline",
	"text-transform": "capitalize uppercase lowercase case",
	"box-sizing": "size box border content",
};

function matchesStyleKey(key: string, query: string): boolean {
	const q = query.trim().toLowerCase();
	return (
		!q || key.includes(q) || styleLabel(key).toLowerCase().includes(q) || (STYLE_ALIASES[key]?.includes(q) ?? false)
	);
}

function matchesStyle(key: string, query: string, group: string): boolean {
	const q = query.trim().toLowerCase();
	return !q || matchesStyleKey(key, q) || group.includes(q);
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function PositionOffsetBox({
	valueOf,
	inherited,
	onCommit,
}: {
	valueOf: (prop: string) => string;
	inherited: (prop: string) => string | undefined;
	onCommit: (patch: Record<string, string>) => void;
}) {
	const input = (side: Side, className: string) => (
		<DraftInput
			key={side}
			ariaLabel={`${sideName(side)} offset`}
			value={valueOf(side)}
			placeholder={inherited(side) || "auto"}
			suffix={side.charAt(0).toUpperCase()}
			onCommit={(value) => onCommit({ [side]: value })}
			className={className}
		/>
	);
	return (
		<div className="grid gap-1 py-0.5">
			<div className="flex justify-center">{input("top", "w-20")}</div>
			<div className="grid grid-cols-[1fr_40px_1fr] items-center gap-1">
				{input("left", "w-20 justify-self-end")}
				<div className="size-10 justify-self-center rounded-md border border-[#34343a] bg-[#1b1b1f]" />
				{input("right", "w-20 justify-self-start")}
			</div>
			<div className="flex justify-center">{input("bottom", "w-20")}</div>
		</div>
	);
}

function PositionEditor({ keys, query, valueOf, inherited, commit, renderInput }: StyleControlProps) {
	const position = valueOf("position");
	const showType = keys.includes("position") && matchesStyle("position", query, "position");
	const offsetsVisible = SIDES.some((side) => keys.includes(side) && matchesStyle(side, query, "position"));
	const positioned = ["relative", "absolute", "fixed", "sticky"].includes(position);
	const hasOffset = SIDES.some((side) => valueOf(side) !== "");
	const q = query.trim().toLowerCase();
	const showOffsets = offsetsVisible && (positioned || hasOffset || !!q);
	const showZ = keys.includes("z-index") && matchesStyle("z-index", query, "position");
	return (
		<>
			{showOffsets && <PositionOffsetBox valueOf={valueOf} inherited={inherited} onCommit={commit} />}
			{showType && (
				<IconSegmented
					label="Type"
					groupLabel="Position type"
					columns={4}
					value={position}
					options={(SELECTS.position ?? []).map((value) => ({
						value,
						label: value ? capitalize(value) : "Default",
						ariaLabel: value ? capitalize(value) : "Default",
						title: value ? `position: ${value}` : "position: static",
					}))}
					onChange={(value) => commit({ position: value })}
				/>
			)}
			{showZ && renderInput("z-index")}
		</>
	);
}

function SpacingRow({
	box,
	valueOf,
	inherited,
	onCommit,
}: {
	box: "padding" | "margin";
	valueOf: (prop: string) => string;
	inherited: (prop: string) => string | undefined;
	onCommit: (patch: Record<string, string>) => void;
}) {
	const [active, setActive] = useState<"all" | Side>("all");
	const name = capitalize(box);
	const keys = SIDES.map((side) => `${box}-${side}`);
	const values = keys.map(valueOf);
	const uniform = values.every((value) => value === values[0]);
	const index = active === "all" ? -1 : SIDES.indexOf(active);
	const value = active === "all" ? (uniform ? values[0]! : "") : values[index]!;
	const inheritedValues = keys.map((key) => inherited(key) ?? "");
	const inheritedUniform = inheritedValues.every((v) => v === inheritedValues[0]) ? inheritedValues[0] : "";
	const placeholder = active === "all" ? (uniform ? inheritedUniform || "0" : "Mixed") : inheritedValues[index] || "0";
	const commit = (next: string) => {
		if (active === "all") onCommit(Object.fromEntries(keys.map((key) => [key, next])));
		else onCommit({ [`${box}-${active}`]: next });
	};
	return (
		<ControlRow label={name}>
			<div className="flex items-center gap-1.5">
				<DraftInput
					ariaLabel={active === "all" ? `${name} all sides` : `${name} ${active}`}
					value={value}
					placeholder={placeholder}
					list="ve-space"
					onCommit={commit}
					className="flex-1"
				/>
				<BoxSidePicker name={name} active={active} onSelect={setActive} />
			</div>
		</ControlRow>
	);
}

function SpacingEditor({ keys, query, valueOf, inherited, commit }: StyleControlProps) {
	return (
		<>
			{(["padding", "margin"] as const).map((box) => {
				const visible = SIDES.some(
					(side) => keys.includes(`${box}-${side}`) && matchesStyle(`${box}-${side}`, query, "spacing"),
				);
				return visible ? (
					<SpacingRow key={box} box={box} valueOf={valueOf} inherited={inherited} onCommit={commit} />
				) : null;
			})}
		</>
	);
}

const SIZE_CONTROL_KEYS = new Set([...Object.keys(SIZE_ICONS), "box-sizing"]);

function SizeEditor({ keys, query, valueOf, inherited, commit, renderInput }: StyleControlProps) {
	const visible = (key: string) => keys.includes(key) && matchesStyle(key, query, "size");
	return (
		<>
			{Object.entries(SIZE_ICONS).map(([key, RowIcon]) =>
				visible(key) ? (
					<ControlRow key={key} label={styleLabel(key)} icon={RowIcon}>
						<DraftInput
							ariaLabel={key}
							value={valueOf(key)}
							placeholder={inherited(key) || "auto"}
							list={listFor(key)}
							onCommit={(value) => commit({ [key]: value })}
						/>
					</ControlRow>
				) : null,
			)}
			{visible("box-sizing") && (
				<IconSegmented
					label="Box sizing"
					groupLabel="Box sizing"
					value={valueOf("box-sizing")}
					options={[
						{ value: "", icon: X, ariaLabel: "Default box sizing", title: "Default box sizing" },
						{ value: "border-box", icon: Box, ariaLabel: "Border box", title: "box-sizing: border-box" },
						{ value: "content-box", icon: Square, ariaLabel: "Content box", title: "box-sizing: content-box" },
					]}
					onChange={(value) => commit({ "box-sizing": value })}
				/>
			)}
			{keys
				.filter((key) => !SIZE_CONTROL_KEYS.has(key) && matchesStyle(key, query, "size"))
				.map((key) => renderInput(key))}
		</>
	);
}

const TYPOGRAPHY_CONTROL_KEYS = new Set(["text-align", "text-decoration", "text-transform"]);

function TypographyEditor({ keys, query, valueOf, commit, renderInput }: StyleControlProps) {
	const visible = (key: string) => keys.includes(key) && matchesStyle(key, query, "typography");
	const align = valueOf("text-align");
	const alignValue = align === "start" ? "left" : align === "end" ? "right" : align || "left";
	const decoration = valueOf("text-decoration");
	const decorationValue = decoration === "none" ? "" : decoration;
	const transform = valueOf("text-transform");
	const transformValue = transform === "none" ? "" : transform;
	return (
		<>
			{visible("text-align") && (
				<IconSegmented
					label="Align"
					groupLabel="Text align"
					value={alignValue}
					options={TEXT_ALIGN_OPTIONS}
					onChange={(value) => commit({ "text-align": value })}
				/>
			)}
			{visible("text-decoration") && (
				<IconSegmented
					label="Decor"
					groupLabel="Text decoration"
					value={decorationValue}
					options={TEXT_DECORATION_OPTIONS}
					onChange={(value) => commit({ "text-decoration": value })}
				/>
			)}
			{visible("text-transform") && (
				<IconSegmented
					label="Capitalize"
					groupLabel="Text transform"
					value={transformValue}
					options={TEXT_TRANSFORM_OPTIONS}
					onChange={(value) => commit({ "text-transform": value })}
				/>
			)}
			{keys
				.filter((key) => !TYPOGRAPHY_CONTROL_KEYS.has(key) && matchesStyle(key, query, "typography"))
				.map((key) => renderInput(key))}
		</>
	);
}

const BACKGROUND_CONTROL_KEYS = new Set([
	"background-size",
	"background-position",
	"background-repeat",
	"background-attachment",
]);

const BACKGROUND_REPEAT_OPTIONS: readonly SegmentOption[] = [
	{ value: "repeat", icon: Grid2x2, ariaLabel: "Repeat both", title: "background-repeat: repeat" },
	{ value: "repeat-x", icon: Rows3, ariaLabel: "Repeat horizontally", title: "background-repeat: repeat-x" },
	{ value: "repeat-y", icon: Columns3, ariaLabel: "Repeat vertically", title: "background-repeat: repeat-y" },
	{ value: "no-repeat", icon: X, ariaLabel: "No repeat", title: "background-repeat: no-repeat" },
];

const BACKGROUND_SIZE_OPTIONS: readonly SegmentOption[] = [
	{ value: "custom", label: "Custom", ariaLabel: "Custom size", title: "Custom background size" },
	{ value: "cover", label: "Cover", ariaLabel: "Cover", title: "background-size: cover" },
	{ value: "contain", label: "Contain", ariaLabel: "Contain", title: "background-size: contain" },
];

const BACKGROUND_ATTACHMENT_OPTIONS: readonly SegmentOption[] = [
	{ value: "fixed", label: "Fixed", ariaLabel: "Fixed", title: "background-attachment: fixed" },
	{ value: "scroll", label: "Not fixed", ariaLabel: "Not fixed", title: "background-attachment: scroll" },
];

const POSITION_PERCENT: Record<string, string> = {
	left: "0%",
	right: "100%",
	top: "0%",
	bottom: "100%",
	center: "50%",
};

function parseBackgroundSize(value: string): { mode: string; width: string; height: string } {
	const clean = value.trim().toLowerCase();
	if (clean === "cover" || clean === "contain") return { mode: clean, width: "auto", height: "auto" };
	if (!clean) return { mode: "custom", width: "auto", height: "auto" };
	const [width = "auto", height = "auto"] = clean.split(/\s+/).filter(Boolean);
	return { mode: "custom", width, height };
}

function parseBackgroundPosition(value: string): { x: string; y: string } {
	const clean = value.trim().toLowerCase();
	if (!clean) return { x: "50%", y: "50%" };
	const parts = clean.split(/\s+/).filter(Boolean);
	if (parts.length === 1) {
		const part = POSITION_PERCENT[parts[0]!] ?? parts[0]!;
		return parts[0] === "top" || parts[0] === "bottom" ? { x: "50%", y: part } : { x: part, y: "50%" };
	}
	return { x: POSITION_PERCENT[parts[0]!] ?? parts[0]!, y: POSITION_PERCENT[parts[1]!] ?? parts[1]! };
}

function positionPercent(token: string): number | null {
	const clean = token.trim().toLowerCase();
	if (clean.endsWith("%")) {
		const n = Number.parseFloat(clean);
		return Number.isFinite(n) ? n : null;
	}
	const keyword = POSITION_PERCENT[clean];
	if (keyword?.endsWith("%")) return Number.parseFloat(keyword);
	return null;
}

function positionLabel(token: string): { value: string; suffix?: string } {
	const percent = positionPercent(token);
	if (percent === null) return { value: token };
	return { value: String(percent), suffix: "%" };
}

function positionValue(raw: string, fallback: string): string {
	const clean = raw.trim();
	if (!clean) return fallback;
	return /^-?\d+(?:\.\d+)?$/.test(clean) ? `${clean}%` : clean;
}

function BackgroundEditor({ keys, query, valueOf, commit, renderInput }: StyleControlProps) {
	const visible = (key: string) => keys.includes(key) && matchesStyle(key, query, "background");
	const repeat = valueOf("background-repeat") || "repeat";
	const size = parseBackgroundSize(valueOf("background-size"));
	const position = parseBackgroundPosition(valueOf("background-position"));
	const left = positionLabel(position.x);
	const top = positionLabel(position.y);
	const commitPosition = (x: string, y: string) => commit({ "background-position": `${x} ${y}` });
	return (
		<>
			{visible("background-size") && (
				<>
					<IconSegmented
						label="Size"
						groupLabel="Background size"
						value={size.mode}
						options={BACKGROUND_SIZE_OPTIONS}
						onChange={(value) => commit({ "background-size": value === "custom" ? "auto auto" : value })}
					/>
					{size.mode === "custom" && (
						<>
							<div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-2">
								<span aria-hidden="true" />
								<div className="grid grid-cols-2 gap-1">
									<DraftInput
										ariaLabel="Background width"
										value={size.width === "auto" ? "" : size.width}
										placeholder="auto"
										onCommit={(value) => {
											const width = value || "auto";
											commit({ "background-size": `${width} ${size.height || "auto"}` });
										}}
									/>
									<DraftInput
										ariaLabel="Background height"
										value={size.height === "auto" ? "" : size.height}
										placeholder="auto"
										onCommit={(value) => {
											const height = value || "auto";
											commit({ "background-size": `${size.width || "auto"} ${height}` });
										}}
									/>
								</div>
							</div>
							<div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2">
								<span aria-hidden="true" />
								<div className="grid grid-cols-2 gap-1 text-center text-[10px] text-[#71717a]">
									<span>Width</span>
									<span>Height</span>
								</div>
							</div>
						</>
					)}
				</>
			)}
			{visible("background-position") && (
				<ControlRow label="Position">
					<div className="flex items-center gap-2">
						<div
							role="group"
							aria-label="Background position"
							className="grid shrink-0 grid-cols-3 gap-0.5 rounded-md border border-[#34343a] bg-[#19191c] p-1"
						>
							{[0, 50, 100].map((y) =>
								[0, 50, 100].map((x) => {
									const selected = positionPercent(position.x) === x && positionPercent(position.y) === y;
									return (
										<button
											key={`${x}:${y}`}
											type="button"
											aria-label={`Background position ${x}% ${y}%`}
											aria-pressed={selected}
											title={`${x}% ${y}%`}
											onClick={() => commitPosition(`${x}%`, `${y}%`)}
											className={`grid size-5 place-items-center rounded-sm transition-colors ${selected ? "bg-[#2c2c31]" : "hover:bg-[#1f1f23]"}`}
										>
											<span
												className={`rounded-full transition-colors ${selected ? "size-1.5 bg-[#e4e4e7]" : "size-1 bg-[#52525b]"}`}
											/>
										</button>
									);
								}),
							)}
						</div>
						<div className="grid min-w-0 flex-1 gap-1">
							<div className="grid grid-cols-[30px_minmax(0,1fr)] items-center gap-1">
								<span className="text-[10px] text-[#9b9ba3]">Left</span>
								<DraftInput
									ariaLabel="Background position left"
									value={left.value}
									placeholder="50"
									suffix={left.suffix}
									onCommit={(value) => commitPosition(positionValue(value, "50%"), position.y)}
								/>
							</div>
							<div className="grid grid-cols-[30px_minmax(0,1fr)] items-center gap-1">
								<span className="text-[10px] text-[#9b9ba3]">Top</span>
								<DraftInput
									ariaLabel="Background position top"
									value={top.value}
									placeholder="50"
									suffix={top.suffix}
									onCommit={(value) => commitPosition(position.x, positionValue(value, "50%"))}
								/>
							</div>
						</div>
					</div>
				</ControlRow>
			)}
			{visible("background-repeat") && (
				<IconSegmented
					label="Tile"
					groupLabel="Background repeat"
					value={repeat}
					options={BACKGROUND_REPEAT_OPTIONS}
					onChange={(value) => commit({ "background-repeat": value })}
				/>
			)}
			{visible("background-attachment") && (
				<IconSegmented
					label="Fixed"
					groupLabel="Background attachment"
					value={valueOf("background-attachment") === "fixed" ? "fixed" : "scroll"}
					options={BACKGROUND_ATTACHMENT_OPTIONS}
					onChange={(value) => commit({ "background-attachment": value })}
				/>
			)}
			{keys
				.filter((key) => !BACKGROUND_CONTROL_KEYS.has(key) && matchesStyle(key, query, "background"))
				.map((key) => renderInput(key))}
		</>
	);
}

/** Tailwind's named radii are lengths; a corner edit must not leave `lg` inside a CSS shorthand. */
const RADIUS_TOKENS: Record<string, string> = {
	none: "0",
	xs: "0.125rem",
	sm: "0.25rem",
	md: "0.375rem",
	lg: "0.5rem",
	xl: "0.75rem",
	"2xl": "1rem",
	"3xl": "1.5rem",
	"4xl": "2rem",
	full: "9999px",
};

function parseRadius(value: string): [string, string, string, string] {
	const clean = value.trim();
	if (!clean) return ["", "", "", ""];
	if (clean.includes("/")) return [clean, clean, clean, clean];
	const parts = clean
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => RADIUS_TOKENS[part] ?? part);
	if (parts.length === 1) return [parts[0]!, parts[0]!, parts[0]!, parts[0]!];
	if (parts.length === 2) return [parts[0]!, parts[1]!, parts[0]!, parts[1]!];
	if (parts.length === 3) return [parts[0]!, parts[1]!, parts[2]!, parts[1]!];
	return [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
}

const printRadius = (values: readonly string[]): string =>
	values.every((value) => value === values[0]) ? values[0]! : values.join(" ");

function RadiusRow({
	value,
	placeholder,
	onCommit,
}: {
	value: string;
	placeholder?: string;
	onCommit: (patch: Record<string, string>) => void;
}) {
	const [active, setActive] = useState<"all" | Corner>("all");
	const corners = parseRadius(value);
	const inheritedCorners = parseRadius(placeholder ?? "");
	const uniform = corners.every((corner) => corner === corners[0]);
	const index = active === "all" ? -1 : CORNERS.indexOf(active);
	const current = active === "all" ? (uniform ? corners[0]! : "") : corners[index]!;
	const inheritedUniform = inheritedCorners.every((corner) => corner === inheritedCorners[0])
		? inheritedCorners[0]
		: "";
	const inheritedCurrent =
		active === "all" ? (uniform ? inheritedUniform || "0" : "Mixed") : inheritedCorners[index] || "0";
	const commit = (next: string) => {
		if (active === "all") {
			onCommit({ "border-radius": next });
			return;
		}
		const values = corners.map((corner, i) => (i === index ? next || "0" : corner || "0"));
		onCommit({ "border-radius": printRadius(values) });
	};
	return (
		<ControlRow label="Radius">
			<div className="flex items-center gap-1.5">
				<DraftInput
					ariaLabel={active === "all" ? "Border radius all corners" : `${cornerName(active)} border radius`}
					value={current}
					placeholder={inheritedCurrent}
					list="ve-space"
					onCommit={commit}
					className="flex-1"
				/>
				<BoxCornerPicker name="radius" active={active} onSelect={setActive} />
			</div>
		</ControlRow>
	);
}

function BorderEditor({ keys, query, valueOf, inherited, commit, renderInput }: StyleControlProps) {
	const showRadius = keys.includes("border-radius") && matchesStyle("border-radius", query, "border");
	const others = keys.filter((key) => key !== "border-radius" && matchesStyle(key, query, "border"));
	return (
		<>
			{showRadius && (
				<RadiusRow value={valueOf("border-radius")} placeholder={inherited("border-radius")} onCommit={commit} />
			)}
			{others.map((key) => renderInput(key))}
		</>
	);
}

function LayoutEditor({ keys, query, valueOf, inherited, commit, renderInput }: StyleControlProps) {
	const q = query.trim().toLowerCase();
	const display = valueOf("display");
	const isFlex = display === "flex" || display === "inline-flex";
	const isGrid = display === "grid" || display === "inline-grid";
	const flexControlKeys = ["display", "flex-direction", "flex-wrap", "align-items", "justify-content", "gap"];
	const gridControlKeys = ["display", "align-items", "justify-items", "gap"];
	const handled = new Set<string>();
	if (isFlex) for (const key of flexControlKeys) handled.add(key);
	if (isGrid) for (const key of gridControlKeys) handled.add(key);
	const typeVisible =
		keys.includes("display") &&
		(matchesStyle("display", query, "layout") ||
			(q !== "" && ("flex".includes(q) || "grid".includes(q) || q.includes("flex") || q.includes("grid"))));
	const directionVisible = isFlex && keys.includes("flex-direction") && matchesStyle("flex-direction", query, "layout");
	const distributeVisible =
		isFlex && keys.includes("justify-content") && matchesStyle("justify-content", query, "layout");
	const alignVisible =
		(isFlex || isGrid) && keys.includes("align-items") && matchesStyle("align-items", query, "layout");
	const justifyVisible = isGrid && keys.includes("justify-items") && matchesStyle("justify-items", query, "layout");
	const wrapVisible = isFlex && keys.includes("flex-wrap") && matchesStyle("flex-wrap", query, "layout");
	const gapVisible = (isFlex || isGrid) && keys.includes("gap") && matchesStyle("gap", query, "layout");
	const extra = keys.filter((key) => !handled.has(key) && matchesStyle(key, query, "layout"));
	return (
		<>
			{typeVisible && (
				<IconSegmented
					label="Type"
					value={isFlex ? "flex" : isGrid ? "grid" : ""}
					options={[
						{ value: "flex", label: "Flex", icon: Rows3, title: "Flex layout" },
						{ value: "grid", label: "Grid", icon: Grid2x2, title: "Grid layout" },
					]}
					onChange={(value) => commit({ display: value })}
				/>
			)}
			{directionVisible && (
				<IconSegmented
					label="Direction"
					value={valueOf("flex-direction")}
					options={DIRECTION_OPTIONS}
					onChange={(value) => commit({ "flex-direction": value })}
				/>
			)}
			{distributeVisible && (
				<IconSegmented
					label="Distribute"
					groupLabel="Justify content"
					value={valueOf("justify-content")}
					options={JUSTIFY_CONTENT_OPTIONS}
					onChange={(value) => commit({ "justify-content": value })}
				/>
			)}
			{alignVisible && (
				<IconSegmented
					label="Align"
					value={valueOf("align-items")}
					options={ALIGN_OPTIONS}
					onChange={(value) => commit({ "align-items": value })}
				/>
			)}
			{justifyVisible && (
				<IconSegmented
					label="Justify"
					value={valueOf("justify-items")}
					options={JUSTIFY_OPTIONS}
					onChange={(value) => commit({ "justify-items": value })}
				/>
			)}
			{wrapVisible && (
				<IconSegmented
					label="Wrap"
					value={valueOf("flex-wrap")}
					options={WRAP_OPTIONS}
					onChange={(value) => commit({ "flex-wrap": value })}
				/>
			)}
			{gapVisible && (
				<ControlRow label="Gap">
					<DraftInput
						ariaLabel="Gap"
						value={valueOf("gap")}
						placeholder={inherited("gap") || "0"}
						list="ve-space"
						onCommit={(value) => commit({ gap: value })}
					/>
				</ControlRow>
			)}
			{extra.length > 0 && (
				<details open={q !== ""} className="text-[11px] text-[#8b8b93]">
					<summary className="cursor-pointer select-none py-1 hover:text-white">Advanced layout</summary>
					<div className="grid gap-2 pt-1">{extra.map((key) => renderInput(key))}</div>
				</details>
			)}
		</>
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
	return (
		<LayoutEditor
			keys={keys}
			query={query}
			valueOf={(key) => styles[key] ?? ""}
			inherited={inherit}
			commit={(patch) => setStyles(patch)}
			renderInput={(key) => <StyleInput key={key} prop={key} value={styles[key] ?? ""} inherited={inherit(key)} />}
		/>
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
	return (
		<PositionEditor
			keys={keys}
			query={query}
			valueOf={(key) => styles[key] ?? ""}
			inherited={inherit}
			commit={(patch) => setStyles(patch)}
			renderInput={(key) => <StyleInput key={key} prop={key} value={styles[key] ?? ""} inherited={inherit(key)} />}
		/>
	);
}

function SpacingControls({
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
	return (
		<SpacingEditor
			keys={keys}
			query={query}
			valueOf={(key) => styles[key] ?? ""}
			inherited={inherit}
			commit={(patch) => setStyles(patch)}
			renderInput={() => null}
		/>
	);
}

function SizeControls({
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
	return (
		<SizeEditor
			keys={keys}
			query={query}
			valueOf={(key) => styles[key] ?? ""}
			inherited={inherit}
			commit={(patch) => setStyles(patch)}
			renderInput={(key) => <StyleInput key={key} prop={key} value={styles[key] ?? ""} inherited={inherit(key)} />}
		/>
	);
}

function TypographyControls({
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
	return (
		<TypographyEditor
			keys={keys}
			query={query}
			valueOf={(key) => styles[key] ?? ""}
			inherited={inherit}
			commit={(patch) => setStyles(patch)}
			renderInput={(key) => <StyleInput key={key} prop={key} value={styles[key] ?? ""} inherited={inherit(key)} />}
		/>
	);
}

function BackgroundControls({
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
	return (
		<BackgroundEditor
			keys={keys}
			query={query}
			valueOf={(key) => styles[key] ?? ""}
			inherited={inherit}
			commit={(patch) => setStyles(patch)}
			renderInput={(key) => <StyleInput key={key} prop={key} value={styles[key] ?? ""} inherited={inherit(key)} />}
		/>
	);
}

function BorderControls({
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
	return (
		<BorderEditor
			keys={keys}
			query={query}
			valueOf={(key) => styles[key] ?? ""}
			inherited={inherit}
			commit={(patch) => setStyles(patch)}
			renderInput={(key) => <StyleInput key={key} prop={key} value={styles[key] ?? ""} inherited={inherit(key)} />}
		/>
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
	const matches = (key: string) => matchesStyleKey(key, q);
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
						) : group === "Spacing" ? (
							<SpacingControls
								styles={styles}
								keys={STYLE_GROUPS.find(([name]) => name === "Spacing")?.[1] ?? []}
								query={q}
								inherit={inherit}
							/>
						) : group === "Size" ? (
							<SizeControls
								styles={styles}
								keys={STYLE_GROUPS.find(([name]) => name === "Size")?.[1] ?? []}
								query={q}
								inherit={inherit}
							/>
						) : group === "Typography" ? (
							<TypographyControls
								styles={styles}
								keys={STYLE_GROUPS.find(([name]) => name === "Typography")?.[1] ?? []}
								query={q}
								inherit={inherit}
							/>
						) : group === "Background" ? (
							<BackgroundControls
								styles={styles}
								keys={STYLE_GROUPS.find(([name]) => name === "Background")?.[1] ?? []}
								query={q}
								inherit={inherit}
							/>
						) : group === "Border" ? (
							<BorderControls
								styles={styles}
								keys={STYLE_GROUPS.find(([name]) => name === "Border")?.[1] ?? []}
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

/** The right-hand panel: what the selected element is, its content and its styles. */
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

/** One style of a theme element; shown as it is typed and written to the theme file after a short pause. */
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
			<EnumControl
				prop={prop}
				label={label}
				value={value}
				options={SELECTS[prop]}
				inherited={placeholder}
				onChange={commit}
			/>
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
					onChange={(e) => {
						setDraft(e.target.value);
						commit(e.target.value);
					}}
					aria-label={prop}
					className="h-8 border-[#34343a] bg-[#19191c] text-xs"
				/>
				{COLOR.test(prop) && (
					<ColorPicker
						label={label}
						value={draft}
						onChange={(v) => {
							setDraft(v);
							commit(v);
						}}
					/>
				)}
			</div>
		</div>
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

/** Text, tag and inline style of a theme element, shown as they are typed. */
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
						onChange={(e) => {
							setText(e.target.value);
							liveThemeEdit({ action: "text", value: e.target.value });
						}}
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
					onChange={(e) => {
						setInline(e.target.value);
						liveThemeEdit({ action: "attrs", attrs: { style: e.target.value.trim() || null } });
					}}
					className="h-8 border-[#34343a] bg-[#19191c] text-xs"
				/>
			</div>
		</>
	);
}

const setAttr = (attr: string, v: string | null) => liveThemeEdit({ action: "attrs", attrs: { [attr]: v } });
const commitThemeClasses = (classes: string[]) =>
	liveThemeEdit({ action: "attrs", attrs: { class: classes.join(" ") || null } });

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
					onChange={(e) => setAttr(name, e.target.value)}
					className="h-8 border-[#34343a] bg-[#19191c] text-xs"
				/>
				<IconButton label={`Remove ${name}`} size="icon-sm" onClick={() => setAttr(name, null)}>
					<X size={12} />
				</IconButton>
			</div>
		</div>
	);
}

/** The element's HTML attributes (Attributes tab); values made by code are left to Code view. */
function ThemeAttributes({ attrs }: { attrs: Record<string, string> }) {
	const [name, setName] = useState("");
	const [value, setValue] = useState("");
	const nameId = useId();
	const valueId = useId();
	return (
		<>
			{Object.entries(attrs).map(([key, attrValue]) => (
				<ThemeAttributeRow key={key} name={key} value={attrValue} />
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
 * An element of the theme's own markup, with the full inspector: its text and tag, every style group and its
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
	const commitMany = (patch: Record<string, string>) => {
		if (el.tailwind) {
			let next = classes;
			for (const [prop, value] of Object.entries(patch)) next = withClassValue(next, prop, variant, value);
			liveThemeEdit({ action: "attrs", attrs: { class: next.join(" ") || null } });
			return;
		}
		const next = { ...styles };
		for (const [prop, value] of Object.entries(patch)) {
			if (value.trim()) next[prop] = value;
			else delete next[prop];
		}
		liveThemeEdit({ action: "attrs", attrs: { style: printStyle(next) || null } });
	};
	const commit = (prop: string, v: string) => commitMany({ [prop]: v });
	const q = query.trim().toLowerCase();
	const matches = (key: string) => matchesStyleKey(key, q);
	const groups = STYLE_GROUPS.map(([group, keys]) => {
		const groupHit = !q || group.toLowerCase().includes(q);
		const visibleKeys = groupHit ? keys : keys.filter(matches);
		return { group, keys: visibleKeys, allKeys: keys, show: !q || groupHit || visibleKeys.length > 0 };
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
							{groups.map(({ group, keys, allKeys }) => {
								const meta = GROUP_META[group];
								const renderInput = (key: string) => (
									<ThemeStyleInput
										key={`${key}:${variant}`}
										prop={key}
										value={valueOf(key)}
										placeholder={inherited(key)}
										onCommit={(v) => commit(key, v)}
									/>
								);
								return (
									<PanelSection key={group} id={meta?.id ?? group.toLowerCase()} title={group} icon={meta?.icon}>
										{group === "Layout" ? (
											<LayoutEditor
												keys={allKeys}
												query={q}
												valueOf={valueOf}
												inherited={inherited}
												commit={commitMany}
												renderInput={renderInput}
											/>
										) : group === "Position" ? (
											<PositionEditor
												keys={allKeys}
												query={q}
												valueOf={valueOf}
												inherited={inherited}
												commit={commitMany}
												renderInput={renderInput}
											/>
										) : group === "Spacing" ? (
											<SpacingEditor
												keys={allKeys}
												query={q}
												valueOf={valueOf}
												inherited={inherited}
												commit={commitMany}
												renderInput={renderInput}
											/>
										) : group === "Size" ? (
											<SizeEditor
												keys={allKeys}
												query={q}
												valueOf={valueOf}
												inherited={inherited}
												commit={commitMany}
												renderInput={renderInput}
											/>
										) : group === "Typography" ? (
											<TypographyEditor
												keys={allKeys}
												query={q}
												valueOf={valueOf}
												inherited={inherited}
												commit={commitMany}
												renderInput={renderInput}
											/>
										) : group === "Background" ? (
											<BackgroundEditor
												keys={allKeys}
												query={q}
												valueOf={valueOf}
												inherited={inherited}
												commit={commitMany}
												renderInput={renderInput}
											/>
										) : group === "Border" ? (
											<BorderEditor
												keys={allKeys}
												query={q}
												valueOf={valueOf}
												inherited={inherited}
												commit={commitMany}
												renderInput={renderInput}
											/>
										) : (
											keys.map(renderInput)
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
										key={key}
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
