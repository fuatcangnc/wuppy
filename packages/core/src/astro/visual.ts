import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { applyOverlay, currentOverlay, overlayCss } from "../themes/overlay.ts";
import { fontLinks, pageCss, visualCss, visualDataSchema, type VisualData } from "@wuppycms/visual-editor";

const SKIP_PATH = /^\/(admin|api|uploads|_astro)(\/|$)/;

interface Loaded {
	mtime: number;
	data: VisualData;
	/** Short hash of the site-wide CSS, empty when there is none. */
	version: string;
}
let loaded: Loaded | undefined;
const defaults = visualDataSchema.parse({});

/** The visual editor's site data, re-read when the file changes. Null before the editor ever saved any. */
async function visualData(root: string): Promise<Loaded | null> {
	const path = join(root, ".wuppy", "data", "visual.json");
	const info = await stat(path).catch(() => null);
	if (!info) return null;
	if (loaded?.mtime === info.mtimeMs) return loaded;
	// A broken file must not take the site down; the editor shows the parse error when it loads the data.
	const raw: unknown = await readFile(path, "utf8")
		.then(JSON.parse)
		.catch(() => null);
	const parsed = visualDataSchema.safeParse(raw);
	if (!parsed.success) return null;
	const css = visualCss(parsed.data);
	loaded = {
		mtime: info.mtimeMs,
		data: parsed.data,
		version: css ? createHash("sha1").update(css).digest("hex").slice(0, 10) : "",
	};
	return loaded;
}

/**
 * Adds the visual editor's CSS to every HTML page: a link to the site-wide sheet (framework, selectors, user CSS),
 * the font stylesheets, and a `<style>` with the responsive/state styles of the visual nodes on this page.
 */
/**
 * Astro's dev server marks each element with the `.astro` file and spot it comes from, and its dev toolbar removes the
 * marks once the page loads. The visual editor edits theme markup by them, so it gets a copy the toolbar leaves alone.
 */
export const withSourceCopy = (html: string, editor = true): string => {
	const out = html.includes("data-astro-source-file")
		? html.replace(/ data-astro-source-(file|loc)="([^"]*)"/g, ' data-astro-source-$1="$2" data-wuppy-$1="$2"')
		: html;
	// Only the editor's canvas (`?wuppy-visual`) needs them; a production theme build puts them on every element.
	return editor ? out : out.replace(/ data-wuppy-(file|loc)="[^"]*"/g, "");
};

export function createVisualMiddleware(root: string) {
	return async (ctx: { request: Request; url: URL }, next: () => Promise<Response>): Promise<Response> => {
		if (ctx.request.method !== "GET" || SKIP_PATH.test(ctx.url.pathname)) return next();
		const res = await next();
		if (res.status !== 200 || !(res.headers.get("content-type") ?? "").includes("text/html")) return res;
		// Theme element edits not built yet (production), applied by the marks before they are stripped.
		const overlay = await currentOverlay(root);
		const rendered = await res.text();
		const html = withSourceCopy(
			overlay.ops.length ? applyOverlay(rendered, overlay.ops) : rendered,
			ctx.url.searchParams.has("wuppy-visual") || ctx.url.pathname.startsWith("/_wuppy/"),
		);
		const visual = await visualData(root);
		const tags: string[] = [];
		const css = overlay.ops.length ? await overlayCss(process.cwd(), overlay.ops) : "";
		if (css) tags.push(`<style data-wuppy-overlay>${css}</style>`);
		if (visual?.version) tags.push(`<link rel="stylesheet" href="/api/public/visual.css?v=${visual.version}">`);
		for (const href of visual ? fontLinks(visual.data.framework) : [])
			tags.push(`<link rel="stylesheet" href="${href.replace(/&/g, "&amp;")}">`);
		// Without saved data the site still gets the default breakpoints the editor shows.
		const page = pageCss(html, visual?.data ?? defaults);
		if (page) tags.push(`<style data-wuppy-visual>${page}</style>`);
		const headers = new Headers(res.headers);
		headers.delete("content-length");
		if (!tags.length) return new Response(html, { status: res.status, headers });
		const at = html.search(/<\/head>/i);
		const out = at === -1 ? tags.join("") + html : html.slice(0, at) + tags.join("") + html.slice(at);
		return new Response(out, { status: res.status, headers });
	};
}
