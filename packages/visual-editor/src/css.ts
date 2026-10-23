/**
 * CSS of the visual editor (wuppy-visual-editor), shared by the admin canvas and the site so both render the same
 * thing. Adapted from Instatic's publisher (`publisher/classCss.ts`, `css-sanitize`) — MIT, © 2026 David Babinec.
 * Every property, value, selector and query passes a gate here: stored data can never leave its declaration, open a
 * new rule, close the `<style>` element or load code.
 */

export type Styles = Record<string, string>;
/** Per-context style overrides, keyed `"<context>"`, `"<context>|<state>"` or `"|<state>"` (see `overrideKey`). */
export type Overrides = Record<string, Styles>;

export interface Breakpoint {
	id: string;
	label: string;
	/** Frame width on the canvas; the rule applies at `max-width: <width>px` (desktop first, as in Instatic). */
	width: number;
}

export interface Condition {
	id: string;
	label: string;
	/** `@media …`, `@container …` or `@supports …`. */
	query: string;
}

export interface Contexts {
	breakpoints: Breakpoint[];
	conditions: Condition[];
}

/** Pseudo-classes and pseudo-elements a style can target (Instatic's state picker). */
export const STATES = [
	":hover",
	":focus",
	":focus-visible",
	":focus-within",
	":active",
	":visited",
	":disabled",
	":first-child",
	":last-child",
	":nth-child(odd)",
	":nth-child(even)",
	"::before",
	"::after",
	"::placeholder",
	"::marker",
] as const;

const PROPERTY = /^-{0,2}[a-z][a-z0-9-]*$/;
const DENIED_PROPERTIES = new Set(["behavior", "-moz-binding", "-ms-behavior"]);
const SAFE_URL = /url\(\s*(?:https:\/\/|\/(?!\/))[^\s'"()]*\s*\)/gi;
const CODE = /url\s*\(|expression\s*\(|javascript:|@import|-moz-binding|behavior\s*:/i;

export const safeProperty = (property: string): boolean => PROPERTY.test(property) && !DENIED_PROPERTIES.has(property);

/** A value that cannot leave its declaration or load code: no `;{}<>"\`, and `url()` only to https or this site. */
export function safeCssValue(value: string): boolean {
	const v = value.replace(SAFE_URL, "");
	return !/[;{}<>"\\]/.test(v) && !CODE.test(v);
}

/** A selector that stays a selector: no braces, `;`, `<`, `@`, backslash or comment. */
export const safeSelector = (selector: string): boolean =>
	/^[^{};<@\\]{1,300}$/.test(selector.trim()) && !selector.includes("/*");

export const safeQuery = (query: string): boolean =>
	/^@(media|container|supports)\s[^{};<\\]{1,300}$/.test(query.trim()) && !query.includes("/*");

/** A user stylesheet: whole rules are allowed, but nothing that loads code or closes the `<style>` element. */
export function safeStylesheet(css: string): boolean {
	return css.length <= 100_000 && !/<\/|<!--|@charset|@namespace/i.test(css) && !CODE.test(css.replace(SAFE_URL, ""));
}

export function declarations(styles: Styles, important = false): string {
	return Object.entries(styles)
		.filter(([k, v]) => safeProperty(k) && typeof v === "string" && v.trim() && safeCssValue(v))
		.map(([k, v]) => `${k}: ${v.trim()}${important ? " !important" : ""}`)
		.join("; ");
}

export const overrideKey = (context: string, state: string): string => (state ? `${context}|${state}` : context);
export function splitKey(key: string): { context: string; state: string } {
	const [context = "", state = ""] = key.split("|");
	return { context, state };
}

/** The at-rule a context wraps its rules in: "" for the base context, null when the context does not exist. */
export function contextAtRule(context: string, contexts: Contexts): string | null {
	if (!context) return "";
	const bp = contexts.breakpoints.find((b) => b.id === context);
	if (bp) return `@media (max-width: ${Math.round(bp.width)}px)`;
	const condition = contexts.conditions.find((c) => c.id === context);
	return condition && safeQuery(condition.query) ? condition.query.trim() : null;
}

/** Cascade order: base first, then breakpoints from widest to narrowest, then conditions in list order. */
function rank(context: string, contexts: Contexts): number {
	if (!context) return 0;
	const widths = contexts.breakpoints.toSorted((a, b) => b.width - a.width).map((b) => b.id);
	const bp = widths.indexOf(context);
	return bp >= 0 ? 1 + bp : 1000 + contexts.conditions.findIndex((c) => c.id === context);
}

// shortcut: splits selector lists on every comma, so `:is(a, b)` gets the state twice; fine for authored lists.
const withState = (selector: string, state: string) =>
	state
		? selector
				.split(",")
				.map((s) => `${s.trim()}${state}`)
				.join(", ")
		: selector;

/** One selector with its base styles and per-context/per-state overrides, as CSS text. */
export function ruleCss(
	selector: string,
	styles: Styles,
	overrides: Overrides,
	contexts: Contexts,
	important = false,
): string {
	if (!safeSelector(selector)) return "";
	const out: string[] = [];
	const base = declarations(styles, important);
	if (base) out.push(`${selector.trim()} { ${base} }`);
	const keys = Object.keys(overrides).toSorted(
		(a, b) => rank(splitKey(a).context, contexts) - rank(splitKey(b).context, contexts),
	);
	for (const key of keys) {
		const { context, state } = splitKey(key);
		if (state && !(STATES as readonly string[]).includes(state)) continue;
		const at = contextAtRule(context, contexts);
		const body = overrides[key] && typeof overrides[key] === "object" ? declarations(overrides[key], important) : "";
		if (at === null || !body) continue;
		const rule = `${withState(selector.trim(), state)} { ${body} }`;
		out.push(at ? `${at} { ${rule} }` : rule);
	}
	return out.join("\n");
}

export const NODE_KEY = /^[a-z0-9]{1,16}$/;
export const nodeClass = (key: string): string => `ve-${key}`;

/** A node's own responsive/state styles. `!important` so they beat the node's inline base styles. */
export const nodeCss = (key: string, overrides: Overrides, contexts: Contexts): string =>
	NODE_KEY.test(key) ? ruleCss(`.${nodeClass(key)}`, {}, overrides, contexts, true) : "";

const NAMED: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
const decodeEntities = (s: string) =>
	s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]+);/gi, (m, e: string) => {
		if (e[0] !== "#") return NAMED[e.toLowerCase()] ?? m;
		const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
		return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
	});

/** The `data-ve-r` attribute value as overrides, or null when it is not a `{key: {property: value}}` object. */
export function parseOverrides(raw: string): Overrides | null {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const out: Overrides = {};
	for (const [key, styles] of Object.entries(value as Record<string, unknown>)) {
		if (!styles || typeof styles !== "object" || Array.isArray(styles)) continue;
		out[key] = Object.fromEntries(
			Object.entries(styles as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"),
		);
	}
	return out;
}

const OPEN_TAG = /<[a-z][a-z0-9-]*\s[^>]*?\bdata-ve-r=(?:"([^"]*)"|'([^']*)')[^>]*>/gi;
const KEY_CLASS = /\bclass=(?:"|')(?:[^"']*\s)?ve-([a-z0-9]{1,16})(?=[\s"'])/i;

/**
 * The CSS for every visual node on a rendered page: each element with `data-ve-r` and a `ve-<key>` class gets its
 * overrides as rules on that class. Reads only attributes the site's renderer already escaped.
 */
export function pageCss(html: string, contexts: Contexts): string {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const m of html.matchAll(OPEN_TAG)) {
		const key = KEY_CLASS.exec(m[0])?.[1];
		if (!key || seen.has(key)) continue;
		seen.add(key);
		const overrides = parseOverrides(decodeEntities(m[1] ?? m[2] ?? ""));
		const css = overrides ? nodeCss(key, overrides, contexts) : "";
		if (css) out.push(css);
	}
	return out.join("\n");
}
