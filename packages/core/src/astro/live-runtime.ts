import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { loadConfig } from "../config/index.ts";
import { parseDocument } from "../content/parsers/frontmatter.ts";
import { isPublished } from "../publishing/index.ts";
import { markdownContent, mdxContent, type MarkdownHeading, type MarkdownSettings } from "../markdown/render.ts";
import { loadSiteConfig, pagesDir, renameFields, routedEntry } from "../themes/site.ts";

/**
 * Runtime half of live content. The site's pages keep calling `getCollection()` / `getEntry()` from `astro:content`;
 * for Wuppy collections these read the files on disk, so a save in the admin shows on the next request, no rebuild.
 * Astro's own helpers (frontmatter parser, Markdown renderer, digest) are passed in by the generated module.
 */

export interface AstroEntry {
	id: string;
	collection: string;
	data: Record<string, unknown>;
	body?: string;
	filePath?: string;
	digest?: string;
	rendered?: { html: string; metadata?: Record<string, unknown> };
	deferredRender?: boolean;
}

interface SchemaLike {
	safeParseAsync(data: unknown): Promise<{ success: boolean; data?: unknown; error?: { message: string } }>;
}

/** `dir` is relative to the root or absolute (a theme reading the site's entries); `rename` is site -> theme field. */
type LiveCollection = { name: string; dir: string; rename?: Record<string, string> };

/** The collections in wuppy.config; a theme run for a site (WUPPY_BASE_ROOT) reads them from the site's folders. */
async function configured(root: string): Promise<LiveCollection[]> {
	const site = process.env.WUPPY_BASE_ROOT;
	if (!site || resolve(site) === resolve(root)) return (await loadConfig(root)).collections;
	const { links } = await loadSiteConfig(site, root);
	return links.map((l) => ({ name: l.name, dir: join(site, l.dir), rename: l.rename }));
}

export interface LiveDeps {
	root: string;
	/** Defaults to the collections in the site's wuppy.config, read once at runtime. */
	collections?: LiveCollection[];
	/** The build-time collection: entries whose file did not change are returned from it as they are. */
	built(name: string): Promise<AstroEntry[]>;
	schema(name: string): SchemaLike | undefined;
	parseFrontmatter(source: string): { frontmatter: Record<string, unknown>; content: string };
	digest(source: string): Promise<string>;
	renderMarkdown(body: string, frontmatter: Record<string, unknown>, filePath: string): Promise<AstroEntry["rendered"]>;
}

export { markdownRenderer, mdxContent } from "../markdown/render.ts";

let pages: Promise<string | undefined> | undefined;

type PageBody = { data: Record<string, unknown>; headings: MarkdownHeading[]; html?: string; Content?: unknown };

/** The site's Pages entry files for a theme page `rel`, `.mdx` first. */
async function entryFiles(rel: string): Promise<string[]> {
	const site = process.env.WUPPY_BASE_ROOT || process.cwd();
	pages ??= loadSiteConfig(site, process.cwd()).then((c) => pagesDir(c.collections));
	const dir = await pages;
	return dir ? [".mdx", ".md"].map((ext) => join(site, dir, rel + ext)) : [];
}

async function renderBody(file: string, source: string, markdown?: MarkdownSettings): Promise<PageBody> {
	const { data, body } = parseDocument(source);
	const { layout: _layout, ...rest } = data;
	if (file.endsWith(".md")) return { data: rest, ...(await markdownContent(body, { root: process.cwd(), markdown })) };
	return { data: rest, ...(await mdxContent(body, { markdown })) };
}

/**
 * A theme's Markdown page body (`rel` like `about`), read on each request from the site's Pages entry, or from the theme
 * file itself when the site has none. `.mdx` compiles to a component (theme components allowed); `.md` to HTML.
 */
export async function themePage(rel: string, themeFile: string, markdown?: MarkdownSettings): Promise<PageBody> {
	for (const file of [...(await entryFiles(rel)), themeFile]) {
		const source = await readFile(file, "utf8").catch(() => null);
		if (source !== null) return renderBody(file, source, markdown);
	}
	throw new Error(`[wuppy] ${themeFile} is gone`);
}

/**
 * The blocks added in the admin to a theme `.astro` page: the body of the site's Pages entry that names the page as its
 * `template`, or undefined when there is none.
 */
export async function themeBody(rel: string, markdown?: MarkdownSettings): Promise<PageBody | undefined> {
	for (const file of await entryFiles(rel)) {
		const source = await readFile(file, "utf8").catch(() => null);
		if (source === null) continue;
		if (typeof parseDocument(source).data.template !== "string") return undefined;
		return renderBody(file, source, markdown);
	}
	return undefined;
}

/**
 * An entry the theme has no page for (a page or a content type's entry added in the admin), by its URL path
 * (`about`, `projects/one`), for the site page route (see sitePageSource). Undefined when there is none, it is not
 * published, or it is a Pages entry that stands for a theme page (`template`).
 */
export async function sitePage(path: string, markdown?: MarkdownSettings): Promise<PageBody | undefined> {
	const found = await routedEntry(process.env.WUPPY_BASE_ROOT || process.cwd(), process.cwd(), path);
	if (!found) return undefined;
	const { data } = parseDocument(found.source);
	// shortcut: a draft 404s here, on the editor's canvas too; let signed-in editors see it if drafts need a canvas.
	if ((found.kind === "pages" && typeof data.template === "string") || !isPublished(data)) return undefined;
	return renderBody(found.file, found.source, markdown);
}

async function files(dir: string): Promise<string[]> {
	const names = await readdir(dir, { recursive: true }).catch(() => [] as string[]);
	// Astro's glob loader skips files and folders that start with "_". A collection may hold both .md and .mdx.
	return names
		.filter((n) => /\.mdx?$/.test(n) && !n.split(/[\\/]/).some((part) => part.startsWith("_")))
		.toSorted()
		.map((n) => join(dir, n));
}

/** Astro's default entry id: path without extension, each segment slugged like github-slugger. */
export function defaultId(path: string): string {
	return path
		.replace(/\.[^./]+$/, "")
		.split("/")
		.map((s) =>
			s
				.toLowerCase()
				.replace(/[^\p{L}\p{M}\p{N}\p{Pc}\s-]/gu, "")
				.replace(/\s/g, "-"),
		)
		.join("/")
		.replace(/\/index$/, "");
}

export function createLive(deps: LiveDeps) {
	let collections: Promise<Map<string, LiveCollection>> | undefined;
	const named = () =>
		(collections ??= (deps.collections ? Promise.resolve(deps.collections) : configured(deps.root)).then(
			(list) => new Map(list.map((c) => [c.name, c])),
			(e: Error) => {
				console.error(`[wuppy] live content is off: ${e.message}`);
				return new Map();
			},
		));
	// MDX entries changed since the build: no compiled module, so `render()` compiles them on request (see mdxContent).
	const runtimeMdx = new WeakSet<AstroEntry>();
	// One parsed entry per file, reused until the file's mtime or size changes.
	const cache = new Map<string, { mtimeMs: number; size: number; entry: AstroEntry | null }>();

	async function build(name: string, filePath: string, source: string, built?: AstroEntry): Promise<AstroEntry | null> {
		const digest = await deps.digest(source);
		if (built?.digest === digest) return built;
		const collection = (await named()).get(name)!;
		const doc = deps.parseFrontmatter(source);
		const frontmatter = renameFields(doc.frontmatter, collection.rename ?? {});
		const content = doc.content;
		const body = content.trim();
		const slug = typeof frontmatter.slug === "string" ? frontmatter.slug : undefined;
		const id =
			slug ??
			built?.id ??
			defaultId(relative(resolve(deps.root, collection.dir), resolve(deps.root, filePath)).split(sep).join("/"));
		let data: Record<string, unknown> = frontmatter;
		const schema = deps.schema(name);
		if (schema) {
			const parsed = await schema.safeParseAsync(frontmatter);
			if (!parsed.success) {
				// Keep serving the last good version rather than dropping the page.
				console.error(`[wuppy] ${filePath} does not match the collection schema: ${parsed.error?.message}`);
				return built ?? null;
			}
			data = parsed.data as Record<string, unknown>;
		}
		const entry: AstroEntry = { id, collection: name, data, body, filePath, digest };
		if (filePath.endsWith(".md")) entry.rendered = await deps.renderMarkdown(body, frontmatter, filePath);
		else runtimeMdx.add(entry);
		return entry;
	}

	async function load(name: string): Promise<AstroEntry[]> {
		const collection = (await named()).get(name)!;
		const built = new Map((await deps.built(name).catch(() => [])).map((e) => [e.filePath, e]));
		const out: AstroEntry[] = [];
		for (const abs of await files(resolve(deps.root, collection.dir))) {
			const info = await stat(abs).catch(() => null);
			if (!info) continue;
			let hit = cache.get(abs);
			if (!hit || hit.mtimeMs !== info.mtimeMs || hit.size !== info.size) {
				const filePath = relative(deps.root, abs).split(sep).join("/");
				const source = await readFile(abs, "utf8").catch(() => null);
				if (source === null) continue;
				hit = {
					mtimeMs: info.mtimeMs,
					size: info.size,
					entry: await build(name, filePath, source, built.get(filePath)),
				};
				cache.set(abs, hit);
			}
			if (hit.entry) out.push(hit.entry);
		}
		return out;
	}

	return {
		isLive: async (name: string) => (await named()).has(name),
		/** Whether `render(entry)` must compile the body now instead of using Astro's built module. */
		rendersAtRuntime: (entry: unknown) =>
			typeof entry === "object" && entry !== null && runtimeMdx.has(entry as AstroEntry),
		async getCollection(name: string, filter?: (entry: AstroEntry) => unknown) {
			const all = await load(name);
			return filter ? all.filter((e) => filter(e)) : all;
		},
		async getEntry(name: string, id: string) {
			return (await load(name)).find((e) => e.id === id);
		},
	};
}

type Params = Record<string, string | number | undefined>;
type Factory = ((result: { params?: Params }, props: Record<string, unknown>, slots: unknown) => unknown) &
	Record<string, unknown>;
type StaticPath = { params: Params; props?: Record<string, unknown> };

const same = (a: Params, b: Params) =>
	[...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => String(a[k] ?? "") === String(b[k] ?? ""));

/** Astro's `paginate()` for a page rendered on request: same shape, URLs built from the route pattern (no `base`). */
export function paginator(pattern: string) {
	const rest = pattern.includes("[...page]");
	const url = (params: Params) =>
		pattern
			.replace(/\[(?:\.\.\.)?(\w+)\]/g, (_, k: string) => (params[k] === undefined ? "" : String(params[k])))
			.replace(/\/{2,}/g, "/")
			.replace(/(.)\/$/, "$1");
	const page = (n: number) => (rest && n === 1 ? undefined : n);
	return (data: unknown[], args: { pageSize?: number; params?: Params; props?: Record<string, unknown> } = {}) => {
		const size = args.pageSize || 10;
		const last = Math.max(1, Math.ceil(data.length / size));
		const at = (n: number | undefined) => ({ ...args.params, page: n === undefined ? undefined : String(n) });
		return Array.from({ length: last }, (_, i) => {
			const n = i + 1;
			const start = (n - 1) * size;
			return {
				params: at(page(n)),
				props: {
					...args.props,
					page: {
						data: data.slice(start, start + size),
						start,
						end: Math.min(start + size, data.length) - 1,
						size,
						total: data.length,
						currentPage: n,
						lastPage: last,
						url: {
							current: url(at(page(n))),
							next: n === last ? undefined : url(at(n + 1)),
							prev: n === 1 ? undefined : url(at(page(n - 1))),
							first: n === 1 ? undefined : url(at(page(1))),
							last: n === last ? undefined : url(at(last)),
						},
					},
				},
			};
		});
	};
}

/**
 * A page that used to be prerendered gets its props from `getStaticPaths()`. Rendered on request, Astro no longer
 * calls it, so this wrapper does: it finds the path matching the request and passes its props, or answers 404.
 */
export function livePage(
	factory: Factory,
	getStaticPaths: (opts: { paginate: ReturnType<typeof paginator>; routePattern: string }) => Promise<StaticPath[]>,
	pattern: string,
): Factory {
	const wrapped = (async (result, props, slots) => {
		const paths = await getStaticPaths({ paginate: paginator(pattern), routePattern: pattern });
		const match = paths.flat().find((p) => same(p.params, result.params ?? {}));
		// A bare 404 makes Astro render the site's own 404 page.
		if (!match) return new Response(null, { status: 404 });
		return factory(result, { ...match.props, ...props }, slots);
	}) as Factory;
	return Object.assign(wrapped, factory);
}
