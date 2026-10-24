import { z } from "zod";
import {
	NODE_KEY,
	ruleCss,
	safeCssValue,
	safeProperty,
	safeQuery,
	safeSelector,
	safeStylesheet,
	type Overrides,
	type Styles,
} from "./css.ts";
import { defaultFramework, frameworkCss } from "./framework.ts";

/**
 * Site-wide visual editor data (`.wuppy/data/visual.json`): breakpoints and conditions, the selector library, the
 * design framework, Visual Components, saved layouts and the user stylesheet. WuppyCMS keeps them next to the
 * content, in Git, while the pages themselves stay MDX.
 */

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const slug = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);
const label = z.string().trim().min(1).max(60);
const value = z.string().max(500);
const styles = z.record(z.string().refine(safeProperty, "Invalid CSS property"), value);
const overrides = z.record(z.string().max(80), styles);

export const breakpointSchema = z.object({ id: slug, label, width: z.number().int().min(200).max(3000) });
export const conditionSchema = z.object({
	id: slug,
	label,
	query: z.string().refine(safeQuery, "Expected @media, @container or @supports followed by a condition"),
});

export const selectorSchema = z.object({
	id,
	/** `.card`, `h2`, `.hero > p`… Class selectors (`.name`) are offered in the class picker. */
	selector: z.string().refine(safeSelector, "Not a valid selector"),
	styles: styles.default({}),
	overrides: overrides.default({}),
});

const colorValue = z.string().max(100).refine(safeCssValue, "Not a valid color");
export const frameworkSchema = z.object({
	prefix: z.string().regex(/^([a-z][a-z0-9]{0,7}-)?$/),
	rootFontSize: z.number().min(8).max(32),
	minWidth: z.number().int().min(200).max(1000),
	maxWidth: z.number().int().min(600).max(4000),
	colors: z
		.array(
			z.object({
				name: slug,
				value: colorValue,
				dark: colorValue.optional(),
				shades: z.number().int().min(0).max(9).default(0),
				tints: z.number().int().min(0).max(9).default(0),
				transparent: z.boolean().default(false),
				utilities: z.boolean().default(true),
			}),
		)
		.max(100),
	type: z.object({
		minSize: z.number().min(1).max(200),
		minRatio: z.number().min(1).max(3),
		maxSize: z.number().min(1).max(200),
		maxRatio: z.number().min(1).max(3),
		steps: z.string().regex(/^[a-z0-9]+(,[a-z0-9]+){0,24}$/),
		base: z.number().int().min(0).max(24),
		utilities: z.boolean(),
	}),
	space: z.object({
		minSize: z.number().min(1).max(200),
		minRatio: z.number().min(1).max(3),
		maxSize: z.number().min(1).max(200),
		maxRatio: z.number().min(1).max(3),
		steps: z.string().regex(/^[a-z0-9]+(,[a-z0-9]+){0,24}$/),
		base: z.number().int().min(0).max(24),
		utilities: z.boolean(),
	}),
	fonts: z
		.array(
			z.object({
				name: slug,
				stack: z.string().max(200).refine(safeCssValue, "Not a valid font stack (use single quotes)"),
				href: z
					.string()
					.regex(/^https:\/\/[^\s"'<>]+$/)
					.optional(),
			}),
		)
		.max(30),
});

/** A node of a Visual Component or saved layout (the editor's tree, without ids). */
export interface NodeJson {
	moduleId: string;
	props: Record<string, string>;
	styles: Styles;
	overrides?: Overrides;
	/** Class key of the node's overrides (set on expanded component nodes; the editor makes new ones on insert). */
	key?: string;
	label?: string;
	hidden?: boolean;
	locked?: boolean;
	children: NodeJson[];
}
export const nodeJsonSchema: z.ZodType<NodeJson> = z.lazy(() =>
	z.object({
		moduleId: z.string().regex(/^[a-z]{1,20}$/),
		props: z.record(z.string().max(40), z.string().max(20_000)),
		styles,
		overrides: overrides.optional(),
		key: z.string().regex(NODE_KEY).optional(),
		label: z.string().max(60).optional(),
		hidden: z.boolean().optional(),
		locked: z.boolean().optional(),
		children: z.array(nodeJsonSchema).max(200),
	}),
);

export const componentSchema = z.object({
	id,
	name: z.string().regex(/^[A-Za-z][\w -]{0,39}$/),
	/** Props a page sets on each instance; `{{name}}` in the component's text and attributes is replaced. */
	params: z
		.array(z.object({ name: z.string().regex(/^[a-z][a-zA-Z0-9]{0,29}$/), default: z.string().max(2000).default("") }))
		.max(20)
		.default([]),
	nodes: z.array(nodeJsonSchema).max(50),
});

export const layoutSchema = z.object({ id, name: label, nodes: z.array(nodeJsonSchema).max(50) });

export const visualDataSchema = z.object({
	/** Width of the base (desktop) frame; the breakpoints below override it. */
	baseWidth: z.number().int().min(600).max(3000).default(1440),
	breakpoints: z
		.array(breakpointSchema)
		.max(8)
		.default([
			{ id: "tablet", label: "Tablet", width: 768 },
			{ id: "mobile", label: "Mobile", width: 375 },
		]),
	conditions: z.array(conditionSchema).max(20).default([]),
	selectors: z.array(selectorSchema).max(500).default([]),
	framework: frameworkSchema.default(defaultFramework),
	components: z.array(componentSchema).max(200).default([]),
	layouts: z.array(layoutSchema).max(200).default([]),
	stylesheet: z
		.string()
		.refine(safeStylesheet, "The stylesheet may not import, load code or close the style element")
		.default(""),
});
export type VisualData = z.infer<typeof visualDataSchema>;
export type VisualComponent = z.infer<typeof componentSchema>;
export type VisualLayout = z.infer<typeof layoutSchema>;
export type Selector = z.infer<typeof selectorSchema>;

export const defaultVisualData = (): VisualData => visualDataSchema.parse({});

/** The site-wide stylesheet: framework tokens and utilities, the selector library, then the user's own CSS. */
export function visualCss(data: VisualData): string {
	return [
		frameworkCss(data.framework),
		...data.selectors.map((s) => ruleCss(s.selector, s.styles, s.overrides, data)),
		safeStylesheet(data.stylesheet) ? data.stylesheet.trim() : "",
	]
		.filter(Boolean)
		.join("\n");
}
