/**
 * CSS properties as Tailwind 4 classes, for styling a theme's own markup from the Properties panel: `align-self: center`
 * is `self-center`, `width: 320px` is `w-[320px]`, and anything without a utility is an arbitrary property
 * (`[filter:blur(4px)]`). A class is read back to the property it sets, so the panel shows and replaces it.
 */

interface Rule {
	prop: string;
	prefix: string;
	/** CSS value → class suffix; other values become an arbitrary property. */
	values?: Record<string, string>;
	/** The CSS value of the prefix alone (`border` is a 1px border). */
	bare?: string;
	/** Takes `-` in front for negative values (`-mt-4`). */
	neg?: boolean;
	/** Tells this property's suffixes from another's on the same prefix (`text-lg` size, `text-red-500` color). */
	when?: (suffix: string) => boolean;
}

const keep = (...v: string[]) => Object.fromEntries(v.map((x) => [x, x]));
const START_END = { "flex-start": "start", "flex-end": "end" };
const OVERFLOW = keep("visible", "hidden", "clip", "scroll", "auto");
const SIZES = new Set(["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl"]);
const LENGTH = /^\[(?:-?[\d.]|calc|clamp|min\(|max\()/;
const SIDES = /^[trblxyse](?:-|$)/;
const free = (prop: string, prefix: string, more: Partial<Rule> = {}): Rule => ({ prop, prefix, ...more });

// Exact choices first, then free values from the most specific prefix to the most general: the first rule that matches
// a class names the property it sets.
const RULES: Rule[] = [
	{
		prop: "display",
		prefix: "",
		values: {
			...keep("block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "contents"),
			none: "hidden",
		},
	},
	{ prop: "position", prefix: "", values: keep("static", "relative", "absolute", "fixed", "sticky") },
	{
		prop: "flex-direction",
		prefix: "flex-",
		values: { row: "row", "row-reverse": "row-reverse", column: "col", "column-reverse": "col-reverse" },
	},
	{ prop: "flex-wrap", prefix: "flex-", values: keep("nowrap", "wrap", "wrap-reverse") },
	{ prop: "align-items", prefix: "items-", values: { ...START_END, ...keep("center", "stretch", "baseline") } },
	{
		prop: "justify-content",
		prefix: "justify-",
		values: {
			...START_END,
			center: "center",
			"space-between": "between",
			"space-around": "around",
			"space-evenly": "evenly",
		},
	},
	{ prop: "justify-items", prefix: "justify-items-", values: keep("start", "end", "center", "stretch") },
	{ prop: "align-self", prefix: "self-", values: { ...START_END, ...keep("auto", "center", "stretch", "baseline") } },
	{ prop: "justify-self", prefix: "justify-self-", values: { ...START_END, ...keep("auto", "center", "stretch") } },
	{ prop: "overflow-x", prefix: "overflow-x-", values: OVERFLOW },
	{ prop: "overflow-y", prefix: "overflow-y-", values: OVERFLOW },
	{ prop: "overflow", prefix: "overflow-", values: OVERFLOW },
	{ prop: "box-sizing", prefix: "box-", values: { "border-box": "border", "content-box": "content" } },
	{
		prop: "font-weight",
		prefix: "font-",
		values: {
			100: "thin",
			200: "extralight",
			300: "light",
			400: "normal",
			500: "medium",
			600: "semibold",
			700: "bold",
			800: "extrabold",
			900: "black",
		},
	},
	{ prop: "font-style", prefix: "", values: { italic: "italic", normal: "not-italic" } },
	{ prop: "text-align", prefix: "text-", values: keep("left", "center", "right", "justify", "start", "end") },
	{
		prop: "text-decoration",
		prefix: "",
		values: { ...keep("underline", "line-through", "overline"), none: "no-underline" },
	},
	{
		prop: "text-transform",
		prefix: "",
		values: { ...keep("uppercase", "lowercase", "capitalize"), none: "normal-case" },
	},
	{
		prop: "white-space",
		prefix: "whitespace-",
		values: keep("normal", "nowrap", "pre", "pre-line", "pre-wrap", "break-spaces"),
	},
	{
		prop: "background-repeat",
		prefix: "bg-",
		values: keep("repeat", "no-repeat", "repeat-x", "repeat-y", "round", "space"),
	},
	{ prop: "background-size", prefix: "bg-", values: keep("auto", "cover", "contain") },
	{ prop: "background-attachment", prefix: "bg-", values: keep("fixed", "local", "scroll") },
	{
		prop: "background-position",
		prefix: "bg-",
		values: {
			...keep("center", "top", "bottom", "left", "right"),
			"left top": "top-left",
			"right top": "top-right",
			"left bottom": "bottom-left",
			"right bottom": "bottom-right",
		},
	},
	{ prop: "object-fit", prefix: "object-", values: keep("contain", "cover", "fill", "none", "scale-down") },
	{ prop: "border-style", prefix: "border-", values: keep("solid", "dashed", "dotted", "double", "hidden", "none") },
	{ prop: "pointer-events", prefix: "pointer-events-", values: keep("auto", "none") },
	{ prop: "user-select", prefix: "select-", values: keep("auto", "none", "text", "all") },
	{ prop: "scroll-behavior", prefix: "scroll-", values: keep("auto", "smooth") },
	{ prop: "appearance", prefix: "appearance-", values: keep("auto", "none") },
	free("cursor", "cursor-"),
	free("column-gap", "gap-x-"),
	free("row-gap", "gap-y-"),
	free("gap", "gap-"),
	free("flex", "flex-"),
	free("grid-template-columns", "grid-cols-"),
	free("grid-template-rows", "grid-rows-"),
	free("grid-column", "col-"),
	free("grid-row", "row-"),
	...["top", "right", "bottom", "left"].map((p) => free(p, `${p}-`, { neg: true })),
	free("z-index", "z-", { neg: true }),
	free("width", "w-"),
	free("height", "h-"),
	free("min-width", "min-w-"),
	free("max-width", "max-w-"),
	free("min-height", "min-h-"),
	free("max-height", "max-h-"),
	free("aspect-ratio", "aspect-"),
	...(["top", "right", "bottom", "left"] as const).flatMap((side) => [
		free(`padding-${side}`, `p${side[0]}-`),
		free(`margin-${side}`, `m${side[0]}-`, { neg: true }),
	]),
	free("font-family", "font-", { when: (s) => ["sans", "serif", "mono"].includes(s) }),
	free("line-height", "leading-"),
	free("letter-spacing", "tracking-", { neg: true }),
	free("text-shadow", "text-shadow-"),
	free("font-size", "text-", { when: (s) => SIZES.has(s) || LENGTH.test(s) }),
	free("color", "text-"),
	free("background-image", "bg-", { when: (s) => s === "none" || /^\[url\(|^(linear|radial|conic)-/.test(s) }),
	free("background-color", "bg-"),
	free("object-position", "object-"),
	free("border-width", "border-", { bare: "1px", when: (s) => /^\d+$/.test(s) || LENGTH.test(s) }),
	free("border-color", "border-", { when: (s) => !SIDES.test(s) }),
	free("border-radius", "rounded-", { bare: "0.25rem", when: (s) => !SIDES.test(s) }),
	free("outline-offset", "outline-offset-"),
	free("outline", "outline-", { bare: "1px" }),
	free("opacity", "opacity-"),
	free("box-shadow", "shadow-"),
	free("transform-origin", "origin-"),
	free("animation", "animate-"),
];

const TOKEN = /^[a-z0-9][\w./-]*$/i;
const UNIT = /^[\d.]+[a-z%]+$/i;
const encode = (v: string) => (TOKEN.test(v) && !UNIT.test(v) ? v : `[${v.replace(/ /g, "_")}]`);
const decode = (s: string) => (s.startsWith("[") && s.endsWith("]") ? s.slice(1, -1).replace(/_/g, " ") : s);

/** The variant a class is under (`md:hover:`), and the utility. */
function split(cls: string): [string, string] {
	let depth = 0;
	let at = -1;
	for (let i = 0; i < cls.length; i++) {
		if (cls[i] === "[") depth++;
		else if (cls[i] === "]") depth--;
		else if (cls[i] === ":" && depth === 0) at = i;
	}
	return [cls.slice(0, at + 1), cls.slice(at + 1)];
}

/** The property and CSS value a utility sets, if it is one the panel edits. */
export function readUtility(util: string): { prop: string; value: string } | undefined {
	const arbitrary = /^\[([a-z-]+):(.+)\]$/.exec(util);
	if (arbitrary) return { prop: arbitrary[1]!, value: decode(`[${arbitrary[2]}]`) };
	for (const rule of RULES) {
		const neg = rule.neg === true && util.startsWith("-");
		const u = neg ? util.slice(1) : util;
		if (rule.values) {
			const hit = Object.entries(rule.values).find(([, s]) => rule.prefix + s === u);
			if (hit) return { prop: rule.prop, value: hit[0] };
			continue;
		}
		if (rule.bare !== undefined && u === rule.prefix.slice(0, -1)) return { prop: rule.prop, value: rule.bare };
		if (!u.startsWith(rule.prefix) || u.length === rule.prefix.length) continue;
		const s = u.slice(rule.prefix.length);
		if (rule.when && !rule.when(s)) continue;
		return { prop: rule.prop, value: (neg ? "-" : "") + decode(s) };
	}
	return undefined;
}

/** The utility that sets `prop: value`. */
export function utilityFor(prop: string, value: string): string {
	const rule = RULES.find((r) => r.prop === prop);
	const arbitrary = `[${prop}:${value.replace(/ /g, "_")}]`;
	if (!rule) return arbitrary;
	if (rule.values) return rule.values[value] === undefined ? arbitrary : rule.prefix + rule.values[value];
	if (rule.bare === value) return rule.prefix.slice(0, -1);
	const neg = rule.neg === true && value.startsWith("-") && TOKEN.test(value.slice(1));
	const s = encode(neg ? value.slice(1) : value);
	if (rule.when && !rule.when(s)) return arbitrary;
	return (neg ? "-" : "") + rule.prefix + s;
}

/** Tailwind's variant for a max-width breakpoint and a state of the Properties panel (`max-[768px]:hover:`). */
export function variantFor(width: number | undefined, state: string): string {
	const s = state
		.replace(/^:+/, "")
		.replace("first-child", "first")
		.replace("last-child", "last")
		.replace(/^nth-child\((odd|even)\)$/, "$1");
	return (width ? `max-[${width}px]:` : "") + (s ? `${s}:` : "");
}

/** The value the classes give `prop` under `variant` ("" when none does). */
export function classValue(classes: string[], prop: string, variant: string): string {
	let value = "";
	for (const c of classes) {
		const [v, util] = split(c);
		const hit = v === variant ? readUtility(util) : undefined;
		if (hit?.prop === prop) value = hit.value;
	}
	return value;
}

/** The classes with `prop` under `variant` set to `value` (removed when empty); other classes are kept as they are. */
export function withClassValue(classes: string[], prop: string, variant: string, value: string): string[] {
	const rest = classes.filter((c) => {
		const [v, util] = split(c);
		return v !== variant || readUtility(util)?.prop !== prop;
	});
	return value.trim() ? [...rest, variant + utilityFor(prop, value.trim())] : rest;
}

/** `color: red; padding: 1rem` as a map, for themes without Tailwind. */
export const parseStyle = (style: string): Record<string, string> =>
	Object.fromEntries(
		style
			.split(";")
			.filter((d) => d.includes(":"))
			.map((d) => [d.slice(0, d.indexOf(":")).trim().toLowerCase(), d.slice(d.indexOf(":") + 1).trim()])
			.filter(([k, v]) => k && v),
	);

export const printStyle = (styles: Record<string, string>): string =>
	Object.entries(styles)
		.filter(([, v]) => v.trim())
		.map(([k, v]) => `${k}: ${v.trim()}`)
		.join("; ");
