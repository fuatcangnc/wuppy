/**
 * The design framework (Framework panel): color tokens with shades, tints and transparent steps, fluid type
 * and spacing scales, font stacks, and the utility classes generated from them. The fluid-scale math is third-party
 * code (see THIRD-PARTY-NOTICES.md), byte-compatible with Core Framework.
 * Everything is emitted as CSS custom properties under a prefix so it never collides with the site theme's tokens.
 */
import { declarations, safeCssValue } from "./css.ts";

export interface Color {
	name: string;
	value: string;
	/** Value under the `.dark` class. */
	dark?: string;
	/** Darker (`-d-1…n`) and lighter (`-l-1…n`) steps. */
	shades: number;
	tints: number;
	/** `-10 … -90` alpha steps. */
	transparent: boolean;
	/** `.text-*`, `.bg-*`, `.border-*` classes. */
	utilities: boolean;
}

export interface Scale {
	/** Base size (px) and ratio at the narrowest screen… */
	minSize: number;
	minRatio: number;
	/** …and at the widest one. */
	maxSize: number;
	maxRatio: number;
	/** Step names, smallest first: `xs,s,m,l,xl`. */
	steps: string;
	/** Index of the base step in `steps`. */
	base: number;
	utilities: boolean;
}

export interface Font {
	name: string;
	/** `'Inter', system-ui, sans-serif` */
	stack: string;
	/** An https stylesheet that loads the font (Google Fonts, Bunny Fonts…). */
	href?: string;
}

export interface Framework {
	/** Prefix for every variable and class: `v-` gives `--v-primary` and `.v-bg-primary`. */
	prefix: string;
	rootFontSize: number;
	minWidth: number;
	maxWidth: number;
	colors: Color[];
	type: Scale;
	space: Scale;
	fonts: Font[];
}

/** √2 to three places (the augmented fourth). */
export const AUG_FOURTH = Math.round(Math.SQRT2 * 1000) / 1000;
export const TYPE_RATIOS = [1.067, 1.125, 1.2, 1.25, 1.333, AUG_FOURTH, 1.5, 1.6, 1.667, 1.778, 1.875, 2] as const;

export const defaultFramework = (): Framework => ({
	prefix: "v-",
	rootFontSize: 16,
	minWidth: 320,
	maxWidth: 1400,
	colors: [
		{ name: "primary", value: "#2563eb", shades: 3, tints: 3, transparent: false, utilities: true },
		{ name: "neutral", value: "#4b5563", shades: 3, tints: 3, transparent: false, utilities: true },
	],
	type: {
		minSize: 16,
		minRatio: 1.125,
		maxSize: 18,
		maxRatio: 1.333,
		steps: "xs,s,m,l,xl,2xl,3xl,4xl",
		base: 2,
		utilities: true,
	},
	space: {
		minSize: 16,
		minRatio: 1.25,
		maxSize: 28,
		maxRatio: AUG_FOURTH,
		steps: "4xs,3xs,2xs,xs,s,m,l,xl,2xl,3xl,4xl",
		base: 5,
		utilities: true,
	},
	fonts: [],
});

const NAME = /^[a-z][a-z0-9-]*$/;
const round = (n: number) => Number(n.toFixed(2));
const rem = (px: number, root: number) => `${round(px / root)}rem`;

/** `clamp(min, calc(slope + intercept), max)` per step. */
export function fluidScale(
	scale: Scale,
	fw: Pick<Framework, "rootFontSize" | "minWidth" | "maxWidth">,
): [string, string][] {
	const steps = scale.steps.split(",").filter((s) => NAME.test(s) || /^\d+[a-z]+$/.test(s));
	const span = Math.max(1, fw.maxWidth - fw.minWidth);
	const root = fw.rootFontSize > 0 ? fw.rootFontSize : 16;
	return steps.map((step, index) => {
		const i = index - scale.base;
		const min = scale.minSize * scale.minRatio ** i;
		const max = scale.maxSize * scale.maxRatio ** i;
		const slope = (max - min) / span;
		const intercept = min - slope * fw.minWidth;
		return [
			step,
			`clamp(${rem(round(min), root)}, calc(${round(slope * 100)}vw + ${rem(round(intercept), root)}), ${rem(round(max), root)})`,
		];
	});
}

interface Variable {
	name: string;
	value: string;
	color?: Color;
}

function colorVariables(fw: Framework, dark: boolean): Variable[] {
	const out: Variable[] = [];
	for (const c of fw.colors) {
		const value = dark ? c.dark : c.value;
		if (!NAME.test(c.name) || !value || !safeCssValue(value)) continue;
		const v = `--${fw.prefix}${c.name}`;
		out.push({ name: v, value, color: c });
		if (dark) continue; // the steps below are relative to the variable, so they follow the dark value by themselves
		const shades = Math.min(Math.max(0, Math.round(c.shades)), 9);
		const tints = Math.min(Math.max(0, Math.round(c.tints)), 9);
		for (let i = 1; i <= shades; i++)
			out.push({
				name: `${v}-d-${i}`,
				color: c,
				value: `color-mix(in oklab, var(${v}), black ${Math.round((80 * i) / (shades + 1))}%)`,
			});
		for (let i = 1; i <= tints; i++)
			out.push({
				name: `${v}-l-${i}`,
				color: c,
				value: `color-mix(in oklab, var(${v}), white ${Math.round((80 * i) / (tints + 1))}%)`,
			});
		if (c.transparent)
			for (let a = 10; a <= 90; a += 10)
				out.push({ name: `${v}-${a}`, color: c, value: `color-mix(in srgb, var(${v}) ${a}%, transparent)` });
	}
	return out;
}

/** Every token a control can offer, as `var(--…)` references, plus the utility class names. */
export function frameworkTokens(fw: Framework): {
	colors: string[];
	type: string[];
	space: string[];
	fonts: string[];
	classes: string[];
} {
	const p = fw.prefix;
	const colors = colorVariables(fw, false).map((v) => `var(${v.name})`);
	const type = fluidScale(fw.type, fw).map(([s]) => `var(--${p}text-${s})`);
	const space = fluidScale(fw.space, fw).map(([s]) => `var(--${p}space-${s})`);
	const fonts = fw.fonts.filter((f) => NAME.test(f.name)).map((f) => `var(--${p}font-${f.name})`);
	return { colors, type, space, fonts, classes: utilities(fw).map(([cls]) => cls) };
}

const SPACING_UTILITIES: [string, string][] = [
	["p", "padding"],
	["px", "padding-inline"],
	["py", "padding-block"],
	["m", "margin"],
	["mx", "margin-inline"],
	["my", "margin-block"],
	["gap", "gap"],
];

/** `[class name, declarations]` for every generated utility class. */
function utilities(fw: Framework): [string, string][] {
	const p = fw.prefix;
	const out: [string, string][] = [];
	for (const v of colorVariables(fw, false)) {
		if (!v.color?.utilities) continue;
		const token = v.name.slice(2 + p.length);
		out.push([`${p}text-${token}`, `color: var(${v.name})`]);
		out.push([`${p}bg-${token}`, `background-color: var(${v.name})`]);
		out.push([`${p}border-${token}`, `border-color: var(${v.name})`]);
	}
	if (fw.type.utilities)
		for (const [s] of fluidScale(fw.type, fw)) out.push([`${p}text-${s}`, `font-size: var(--${p}text-${s})`]);
	if (fw.space.utilities)
		for (const [s] of fluidScale(fw.space, fw))
			for (const [short, prop] of SPACING_UTILITIES) out.push([`${p}${short}-${s}`, `${prop}: var(--${p}space-${s})`]);
	for (const f of fw.fonts)
		if (NAME.test(f.name)) out.push([`${p}font-${f.name}`, `font-family: var(--${p}font-${f.name})`]);
	return out;
}

/** https stylesheets the fonts need, for `<link>` tags. */
export const fontLinks = (fw: Framework): string[] =>
	fw.fonts.map((f) => f.href ?? "").filter((h) => /^https:\/\/[^\s"'<>]+$/.test(h));

export function frameworkCss(fw: Framework): string {
	if (!/^([a-z][a-z0-9-]*)?$/.test(fw.prefix)) return "";
	const p = fw.prefix;
	const vars: Variable[] = [
		...colorVariables(fw, false),
		...fluidScale(fw.type, fw).map(([s, value]) => ({ name: `--${p}text-${s}`, value })),
		...fluidScale(fw.space, fw).map(([s, value]) => ({ name: `--${p}space-${s}`, value })),
		...fw.fonts
			.filter((f) => NAME.test(f.name) && safeCssValue(f.stack))
			.map((f) => ({ name: `--${p}font-${f.name}`, value: f.stack })),
	];
	const block = (selector: string, list: Variable[]) =>
		list.length ? `${selector} { ${declarations(Object.fromEntries(list.map((v) => [v.name, v.value])))} }` : "";
	return [
		block(":root", vars),
		block(".dark", colorVariables(fw, true)),
		...utilities(fw).map(([cls, decl]) => `.${cls} { ${decl} }`),
	]
		.filter(Boolean)
		.join("\n");
}
