import { createRequire } from "node:module";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ElementEdit } from "./astro-edit.ts";

/**
 * Theme element edits on a production server show at once. The running server is a build of the theme, so it keeps
 * rendering the old markup until the theme is built again; until then each edit is also kept here and applied to the
 * rendered HTML, found by the build's element marks (`data-wuppy-file`/`loc`). `shadows` are the edited files with each
 * element's build location on it (`data-wuppy-o`), so later edits, made on the page of the old build, still find
 * their element in the changed file. A finished build has every edit, and the overlay is cleared.
 */
export interface OverlayOp {
	file: string;
	loc: string;
	tag?: string;
	/** Only the copy that is this use of its component (see instance-edit.ts). */
	host?: { file: string; loc: string; slot: number };
	edit: ElementEdit;
}
export interface Overlay {
	ops: OverlayOp[];
	shadows: Record<string, string>;
}

const overlayFile = (site: string) => join(site, ".wuppy", "themes", "overlay.json");
const empty = (): Overlay => ({ ops: [], shadows: {} });

export async function readOverlay(site: string): Promise<Overlay> {
	const raw = await readFile(overlayFile(site), "utf8").catch(() => "");
	// A missing or broken file is no overlay: the page shows the build as it is.
	const parsed = (() => {
		try {
			return raw ? (JSON.parse(raw) as Overlay) : empty();
		} catch {
			return empty();
		}
	})();
	return Array.isArray(parsed.ops) && parsed.shadows && typeof parsed.shadows === "object" ? parsed : empty();
}

export async function writeOverlay(site: string, overlay: Overlay): Promise<void> {
	const file = overlayFile(site);
	await mkdir(dirname(file), { recursive: true });
	await writeFile(`${file}.tmp`, JSON.stringify(overlay));
	await rename(`${file}.tmp`, file);
}

export const clearOverlay = (site: string) => writeOverlay(site, empty());

/** Changes when the overlay does: part of the page cache's version. */
export const overlayStamp = async (site: string): Promise<string> =>
	String((await stat(overlayFile(site)).catch(() => null))?.mtimeMs ?? "");

let cached: { stamp: string; overlay: Overlay } | undefined;
/** The overlay for rendering, re-read when the file changes. */
export async function currentOverlay(site: string): Promise<Overlay> {
	const stamp = await overlayStamp(site);
	if (cached?.stamp !== stamp) cached = { stamp, overlay: stamp ? await readOverlay(site) : empty() };
	return cached.overlay;
}

/** The marks put on shadow files, and the file without them. */
export const shadowMark = (loc: string) => ` data-wuppy-o="${loc}"`;
export const unshadow = (source: string) => source.replace(/ data-wuppy-o="[^"]*"/g, "");

/**
 * The shadow marks moved onto the file as it is now, after a change made outside the visual editor (Code view, an AI
 * undo). Marks before and after the changed part keep their place; those inside it are dropped (their elements can
 * be edited again after the next build).
 */
export function rebaseShadow(shadow: string, source: string): string {
	const plain = unshadow(shadow);
	let pre = 0;
	while (pre < plain.length && pre < source.length && plain[pre] === source[pre]) pre++;
	let suf = 0;
	while (
		suf < plain.length - pre &&
		suf < source.length - pre &&
		plain[plain.length - 1 - suf] === source[source.length - 1 - suf]
	)
		suf++;
	let out = "";
	let from = 0;
	let removed = 0;
	for (const m of shadow.matchAll(/ data-wuppy-o="[^"]*"/g)) {
		const at = m.index - removed;
		removed += m[0].length;
		// After the tag name it follows; the name must be in the unchanged part too.
		const to = at <= pre ? at : at > plain.length - suf ? at + source.length - plain.length : -1;
		if (to === -1) continue;
		out += source.slice(from, to) + m[0];
		from = to;
	}
	return out + source.slice(from);
}

// ---- Rendered HTML ----

interface HtmlEl {
	name: string;
	start: number;
	openEnd: number;
	closeStart: number;
	end: number;
	parent: number;
}
const VOID = new Set("area base br col embed hr img input link meta source track wbr".split(" "));
const RAW = new Set(["script", "style", "textarea", "title"]);
const TOKEN = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w:.-]*)\s*>|<([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;

/**
 * The elements of server-rendered HTML with their ranges. Astro and React write well-formed markup, so a tokenizer is
 * enough: an end tag closes the nearest open element of its name, and void, self-closed and raw-text ones are handled.
 */
export function htmlElements(html: string): HtmlEl[] {
	const out: HtmlEl[] = [];
	const open: number[] = [];
	const lower = html.toLowerCase();
	const re = new RegExp(TOKEN.source, "g");
	for (let m = re.exec(html); m; m = re.exec(html)) {
		if (m[1]) {
			const name = m[1].toLowerCase();
			const at = open.findLastIndex((i) => out[i]!.name === name);
			if (at === -1) continue;
			const [el, ...inner] = open.splice(at);
			// Elements left open inside it end where it ends.
			for (const i of inner) Object.assign(out[i]!, { closeStart: m.index, end: m.index });
			Object.assign(out[el!]!, { closeStart: m.index, end: re.lastIndex });
		} else if (m[2]) {
			const name = m[2].toLowerCase();
			const el: HtmlEl = {
				name,
				start: m.index,
				openEnd: re.lastIndex,
				closeStart: re.lastIndex,
				end: re.lastIndex,
				parent: open.at(-1) ?? -1,
			};
			out.push(el);
			if (VOID.has(name) || m[3]!.trimEnd().endsWith("/")) continue;
			if (RAW.has(name)) {
				const close = lower.indexOf(`</${name}`, re.lastIndex);
				if (close === -1) continue;
				el.closeStart = close;
				el.end = lower.indexOf(">", close) + 1;
				re.lastIndex = el.end;
			} else open.push(out.length - 1);
		}
	}
	return out;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const decode = (s: string) =>
	s
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
		.replace(/&amp;/g, "&");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A copy of rendered markup without the editor's marks (of one file): it has no place in that file until the build. */
const unmarked = (s: string, file?: string) =>
	file === undefined
		? s.replace(/ data-wuppy-(file|loc)="[^"]*"/g, "")
		: s.replace(new RegExp(` data-wuppy-file="${escapeRe(escapeAttr(file))}" data-wuppy-loc="[^"]*"`, "g"), "");
const fileOf = (html: string, el: HtmlEl) => /\sdata-wuppy-file="([^"]*)"/.exec(html.slice(el.start, el.openEnd))?.[1];

/** Whether the element is the use of its component that `host` names (see instance-edit.ts). */
function isUse(html: string, els: HtmlEl[], i: number, host: NonNullable<OverlayOp["host"]>): boolean {
	const own = fileOf(html, els[i]!);
	let child = i;
	let p = els[i]!.parent;
	while (p !== -1 && (fileOf(html, els[p]!) ?? own) === own) [child, p] = [p, els[p]!.parent];
	if (p === -1 || !isMark(html, els[p]!, host.file, host.loc)) return false;
	const hostFile = fileOf(html, els[p]!);
	const uses = els.flatMap((e, j) => (e.parent === p && fileOf(html, e) && fileOf(html, e) !== hostFile ? [j] : []));
	return uses.indexOf(child) === host.slot;
}

/** The class list `from` → `to` changed the same way on a copy that has other classes (from code) too. */
function classDiff(current: string, from: string, to: string): string {
	const [was, now] = [from, to].map((s) => s.split(/\s+/).filter(Boolean));
	const list = current.split(/\s+/).filter((c) => c && (now!.includes(c) || !was!.includes(c)));
	return [...list, ...now!.filter((c) => !list.includes(c))].join(" ");
}

const isMark = (html: string, el: HtmlEl, file: string, loc: string, tag?: string) => {
	const open = html.slice(el.start, el.openEnd);
	return (
		open.includes(` data-wuppy-file="${escapeAttr(file)}"`) &&
		open.includes(` data-wuppy-loc="${loc}"`) &&
		(!tag || el.name === tag.toLowerCase())
	);
};

const splice = (s: string, start: number, end: number, insert = "") => s.slice(0, start) + insert + s.slice(end);

function setAttrs(open: string, attrs: Record<string, string | null>): string {
	let out = open;
	for (const [name, value] of Object.entries(attrs)) {
		const text = value === null ? "" : value === "" ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`;
		const re = new RegExp(`\\s${escapeRe(name)}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'>]+))?(?=[\\s/>])`);
		if (re.test(out)) out = out.replace(re, text);
		else if (text) out = out.replace(/^<[^\s/>]+/, (tag) => tag + text);
	}
	return out;
}

/** One edit on one rendered copy of the element. */
function applyOne(html: string, els: HtmlEl[], i: number, op: OverlayOp): string {
	const el = els[i]!;
	const { edit } = op;
	switch (edit.action) {
		case "text": {
			const inner = html.slice(el.openEnd, el.closeStart);
			// Text from a variable: only where it showed the old text (a shared heading component shows others too).
			if (inner.includes("<") || (edit.from !== undefined && decode(inner).trim() !== edit.from.trim())) return html;
			return splice(html, el.openEnd, el.closeStart, escapeHtml(edit.value));
		}
		case "attrs": {
			const open = html.slice(el.start, el.openEnd);
			const from = edit.from?.class;
			const to = edit.attrs.class;
			const attrs =
				from !== undefined && typeof to === "string"
					? { ...edit.attrs, class: classDiff(decode(/\sclass="([^"]*)"/.exec(open)?.[1] ?? ""), from, to) }
					: edit.attrs;
			return splice(html, el.start, el.openEnd, setAttrs(open, attrs));
		}
		case "tag": {
			const closed = el.closeStart < el.end ? splice(html, el.closeStart, el.end, `</${edit.name}>`) : html;
			return splice(closed, el.start + 1, el.start + 1 + el.name.length, edit.name);
		}
		case "delete":
			return splice(html, el.start, el.end);
		case "duplicate":
			// A copied use of a component is a component call too: only the marks of the file it is in go.
			return splice(html, el.end, el.end, unmarked(html.slice(el.start, el.end), op.host?.file));
		case "insert":
			return splice(html, el.end, el.end, edit.html.trim());
		case "move": {
			const siblings = els.flatMap((e, j) => (e.parent === el.parent ? [j] : []));
			const other = siblings[siblings.indexOf(i) + edit.by];
			if (other === undefined) return html;
			const [a, b] = edit.by < 0 ? [els[other]!, el] : [el, els[other]!];
			const text = (e: HtmlEl) => html.slice(e.start, e.end);
			return html.slice(0, a.start) + text(b) + html.slice(a.end, b.start) + text(a) + html.slice(b.end);
		}
		case "moveTo": {
			const target = els.find((e) => isMark(html, e, op.file, edit.loc, edit.tag));
			if (!target || (target.start >= el.start && target.end <= el.end)) return html;
			const at = edit.position === "before" ? target.start : edit.position === "after" ? target.end : target.closeStart;
			const text = html.slice(el.start, el.end);
			return at <= el.start
				? splice(splice(html, el.start, el.end), at, at, text)
				: splice(splice(html, at, at, text), el.start, el.end);
		}
	}
}

/** The page as the edited theme files render it, before the theme is built again. */
export function applyOverlay(html: string, ops: OverlayOp[]): string {
	let out = html;
	for (const op of ops) {
		const els = htmlElements(out);
		const hits = els.flatMap((e, i) =>
			isMark(out, e, op.file, op.loc, op.tag) && (!op.host || isUse(out, els, i, op.host)) ? [i] : [],
		);
		// Every copy changes like the file does (a list item renders many); a move goes by the first one.
		const picked = op.edit.action === "move" || op.edit.action === "moveTo" ? hits.slice(0, 1) : hits;
		// From the end, so earlier copies keep their offsets.
		for (const i of picked.toReversed()) out = applyOne(out, els, i, op);
	}
	return out;
}

// ---- Tailwind classes the build has no CSS for ----

interface TailwindNode {
	compile(
		css: string,
		o: { base: string; onDependency: (path: string) => void },
	): Promise<{ build(c: string[]): string }>;
}
const classesOf = (ops: OverlayOp[]) =>
	ops.flatMap(({ edit }) =>
		(edit.action === "attrs"
			? (edit.attrs.class ?? "")
			: edit.action === "insert"
				? [...edit.html.matchAll(/ class="([^"]*)"/g)].map((m) => m[1]).join(" ")
				: ""
		)
			.split(/\s+/)
			.filter(Boolean),
	);

/** `@layer <name> { … }` blocks of a stylesheet. */
const layers = (css: string, names: string[]) =>
	names
		.map((name) => {
			const start = css.indexOf(`@layer ${name} {`);
			if (start === -1) return "";
			let depth = 0;
			for (let i = css.indexOf("{", start); i < css.length; i++) {
				if (css[i] === "{") depth++;
				else if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
			}
			return "";
		})
		.join("\n");

async function tailwindEntry(theme: string): Promise<string | undefined> {
	const names = await readdir(join(theme, "src"), { recursive: true }).catch(() => [] as string[]);
	for (const name of names.filter((n) => n.endsWith(".css")).toSorted()) {
		const path = join(theme, "src", name);
		if (/@import\s+["']tailwindcss/.test(await readFile(path, "utf8").catch(() => ""))) return path;
	}
	return undefined;
}

/**
 * The classes a built stylesheet has no rule for. Only those get overlay CSS: a rule made again comes after the
 * build's own, so `.flex` would beat `sm:grid` on every element that has both.
 */
export function missingClasses(css: string, classes: string[]): string[] {
	return classes.filter(
		(c) => !new RegExp(`\\.${escapeRe(c.replace(/[^\w-]/g, (ch) => `\\${ch}`))}(?![\\w\\\\-])`).test(css),
	);
}

const builtCss = async (theme: string) => {
	const dir = join(theme, "dist", "client");
	const names = await readdir(dir, { recursive: true }).catch(() => [] as string[]);
	const sheets = names.filter((n) => n.endsWith(".css")).map((n) => readFile(join(dir, n), "utf8").catch(() => ""));
	return (await Promise.all(sheets)).join("\n");
};

/** The theme's own Tailwind (a theme dependency, not Wuppy's). */
const THEME_TAILWIND = "@tailwindcss/node";
const cssCache = new Map<string, Promise<string>>();
/**
 * CSS for the Tailwind classes the edits use, made with the theme's own Tailwind and stylesheet: the build only has
 * the classes it saw. Only the theme variables and utilities are kept; the build already has the base styles.
 */
export function overlayCss(theme: string, ops: OverlayOp[]): Promise<string> {
	const classes = [...new Set(classesOf(ops))].toSorted();
	if (!classes.length) return Promise.resolve("");
	const key = `${theme}\n${classes.join(" ")}`;
	let job = cssCache.get(key);
	if (!job) {
		job = (async () => {
			const entry = await tailwindEntry(theme);
			if (!entry) return "";
			const require = createRequire(join(theme, "package.json"));
			const path = (() => {
				try {
					return require.resolve(THEME_TAILWIND);
				} catch {
					// Not a Tailwind theme after all: the classes get their CSS from the next build.
					return undefined;
				}
			})();
			if (!path) return "";
			const tw = (await import(/* @vite-ignore */ pathToFileURL(path).href)) as TailwindNode;
			const compiler = await tw.compile(await readFile(entry, "utf8"), {
				base: dirname(entry),
				onDependency: () => undefined,
			});
			const missing = missingClasses(await builtCss(theme), classes);
			return missing.length ? layers(compiler.build(missing), ["theme", "utilities"]) : "";
		})().catch(() => "");
		cssCache.clear();
		cssCache.set(key, job);
	}
	return job;
}
