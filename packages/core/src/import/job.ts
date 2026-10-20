import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ContentService } from "../content/service.ts";
import { dataSchemas, taxonomyTermSchema, type Byline, type Menu, type Taxonomy } from "../data/schemas.ts";
import type { JsonStore } from "../data/store.ts";
import type { MediaService } from "../media/index.ts";
import type { RedirectService } from "../redirects/service.ts";
import { fetchPublic } from "../security/ssrf.ts";
import { htmlToMarkdown, imageUrls, parseWxr, slugify, type Wxr } from "./wxr.ts";

export const importOptionsSchema = z.object({
	collection: z.string().min(1),
	/** Where WordPress pages go; pages are left out when empty. */
	pageCollection: z.string().min(1).optional(),
	onConflict: z.enum(["skip", "rename"]).default("skip"),
	downloadMedia: z.boolean().default(false),
});
export type ImportOptions = z.infer<typeof importOptionsSchema>;

export interface Analysis {
	posts: number;
	pages: number;
	drafts: number;
	attachments: number;
	images: number;
	authors: number;
	categories: number;
	tags: number;
	menus: number;
	/** Slugs that already exist in the target collection. */
	conflicts: string[];
	/** Items without a title or slug; they cannot be imported. */
	unusable: number;
}

export interface JobState {
	id: string;
	status: "ready" | "running" | "done" | "rolled-back";
	options: ImportOptions;
	total: number;
	cursor: number;
	analysis: Analysis;
	created: Array<{ collection: string; slug: string }>;
	media: string[];
	redirects: number;
	skipped: string[];
	errors: string[];
}

/** Data files an import may change; their previous content is kept for rollback. */
const TOUCHED = ["bylines", "taxonomies", "menus", "redirects"] as const;
type Before = Partial<Record<(typeof TOUCHED)[number], unknown>>;

export interface ImportDeps {
	root: string;
	service: ContentService;
	media: MediaService;
	json: JsonStore;
	redirects: RedirectService;
	fetchMedia?: (url: string) => Promise<{ bytes: Uint8Array; contentType: string }>;
}

const termSlug = (s: string) => {
	let decoded = s;
	try {
		decoded = decodeURIComponent(s);
	} catch {
		// keep the raw value
	}
	return slugify(decoded);
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const hostOf = (url: string) => {
	try {
		return new URL(url).host;
	} catch {
		return "";
	}
};

/**
 * A WordPress import that runs in batches: upload once, call `step` until `done`, or `rollback` to undo it.
 * The XML is kept on disk (`.wuppy/imports/<id>/source.xml`), so a paused import survives a restart.
 * shortcut: the whole file is parsed in memory (the API caps it at 50 MB); stream it if exports get bigger.
 */
export class ImportJobs {
	constructor(private readonly deps: ImportDeps) {}

	private dir(id: string): string {
		if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid import id");
		return join(this.deps.root, ".wuppy", "imports", id);
	}

	private async save(state: JobState): Promise<void> {
		await writeFile(join(this.dir(state.id), "job.json"), JSON.stringify(state));
	}

	async get(id: string): Promise<JobState | null> {
		try {
			return JSON.parse(await readFile(join(this.dir(id), "job.json"), "utf8")) as JobState;
		} catch {
			return null;
		}
	}

	private async wxr(id: string): Promise<Wxr> {
		return parseWxr(await readFile(join(this.dir(id), "source.xml"), "utf8"));
	}

	async analyze(wxr: Wxr, options: ImportOptions): Promise<Analysis> {
		const posts = wxr.posts.filter((p) => p.type === "post");
		const pages = wxr.posts.filter((p) => p.type === "page");
		const conflicts: string[] = [];
		for (const p of wxr.posts) {
			const collection = p.type === "page" ? options.pageCollection : options.collection;
			if (collection && (await this.deps.service.get(collection, p.slug))) conflicts.push(`${collection}/${p.slug}`);
		}
		return {
			posts: posts.length,
			pages: pages.length,
			drafts: wxr.posts.filter((p) => !p.published).length,
			attachments: wxr.attachments.length,
			images: new Set(wxr.posts.flatMap((p) => imageUrls(p.html))).size,
			authors: wxr.authors.length,
			categories: wxr.terms.filter((t) => t.taxonomy === "category").length,
			tags: wxr.terms.filter((t) => t.taxonomy === "tag").length,
			menus: wxr.menus.length,
			conflicts,
			unusable: wxr.skipped,
		};
	}

	/** Parses and analyzes the file and stores the job; nothing is written to the site yet. */
	async create(xml: string, options: ImportOptions): Promise<JobState> {
		if (!this.deps.service.collections.some((c) => c.name === options.collection))
			throw new Error(`Unknown collection: ${options.collection}`);
		if (options.pageCollection && !this.deps.service.collections.some((c) => c.name === options.pageCollection))
			throw new Error(`Unknown collection: ${options.pageCollection}`);
		const wxr = parseWxr(xml);
		if (wxr.posts.length === 0) throw new Error("No posts or pages found. Is this a WordPress export (WXR) file?");
		const id = randomUUID();
		const state: JobState = {
			id,
			status: "ready",
			options,
			total: wxr.posts.length,
			cursor: 0,
			analysis: await this.analyze(wxr, options),
			created: [],
			media: [],
			redirects: 0,
			skipped: [],
			errors: [],
		};
		await mkdir(this.dir(id), { recursive: true });
		await writeFile(join(this.dir(id), "source.xml"), xml);
		await this.save(state);
		return state;
	}

	/** Imports the next `batch` posts. The first call also brings in authors, categories and tags; the last one menus and redirects. */
	async step(id: string, batch = 25): Promise<JobState> {
		const state = await this.get(id);
		if (!state) throw new Error("Import not found");
		if (state.status === "done" || state.status === "rolled-back") return state;
		const wxr = await this.wxr(id);
		const { service, json } = this.deps;
		const opts = state.options;
		const before: Before = JSON.parse(await readFile(join(this.dir(id), "before.json"), "utf8").catch(() => "{}"));
		const remember = async (name: (typeof TOUCHED)[number]) => {
			if (name in before) return;
			before[name] = await json.read(name, []);
			await writeFile(join(this.dir(id), "before.json"), JSON.stringify(before));
		};

		state.status = "running";
		if (state.cursor === 0) await this.prepare(wxr, opts, remember);

		const mediaMap = new Map<string, string>();
		const siteHost = hostOf(wxr.siteUrl);
		const attachmentUrls = new Set(wxr.attachments.map((a) => a.url));
		const pendingRedirects: Array<{ from: string; to: string }> = [];
		const authorSlugs = new Set(wxr.authors.map((a) => slugify(a.login)));

		for (const post of wxr.posts.slice(state.cursor, state.cursor + batch)) {
			state.cursor++;
			const collection = post.type === "page" ? opts.pageCollection : opts.collection;
			if (!collection) {
				state.skipped.push(`${post.slug}: pages are not being imported`);
				continue;
			}
			try {
				let slug = post.slug;
				if (await service.get(collection, slug)) {
					if (opts.onConflict === "skip") {
						state.skipped.push(`${collection}/${slug}: already exists`);
						continue;
					}
					let n = 2;
					while (await service.get(collection, `${slug}-${n}`)) n++;
					slug = `${slug}-${n}`;
				}
				let body = htmlToMarkdown(post.html);
				if (opts.downloadMedia) {
					for (const url of imageUrls(post.html)) {
						if (url.startsWith("data:") || (hostOf(url) !== siteHost && !attachmentUrls.has(url))) continue;
						let local = mediaMap.get(url);
						if (!local) {
							try {
								const file = await (this.deps.fetchMedia ?? fetchPublic)(url);
								local = (await this.deps.media.upload(file.bytes)).url;
								mediaMap.set(url, local);
								state.media.push(local);
							} catch (e) {
								state.errors.push(`${url}: ${(e as Error).message}`);
								continue;
							}
						}
						body = body.replaceAll(url, local);
					}
				}
				// Page links to the old site become site-relative, so redirects and a new domain keep working. Images stay absolute unless downloaded.
				if (wxr.siteUrl)
					body = body.replace(
						new RegExp(`(?<!!)(\\[[^\\]]*\\]\\()${escapeRe(wxr.siteUrl.replace(/\/$/, ""))}(?=/)`, "g"),
						"$1",
					);
				const author = slugify(post.author);
				await service.create(
					collection,
					slug,
					{
						data: {
							title: post.title,
							date: post.date,
							...(post.published ? {} : { draft: true }),
							...(authorSlugs.has(author) ? { author } : {}),
							...(post.categories.length ? { categories: post.categories.map(termSlug).filter(Boolean) } : {}),
							...(post.tags.length ? { tags: post.tags.map(termSlug).filter(Boolean) } : {}),
						},
						body,
					},
					`import[${id.slice(0, 8)}]: ${collection}/${slug}`,
				);
				state.created.push({ collection, slug });
				const route = service.collections.find((c) => c.name === collection)?.route ?? `/${collection}/{slug}`;
				const to = route.replace("{slug}", slug);
				if (post.oldPath && post.oldPath !== "/" && post.oldPath.replace(/\/$/, "") !== to) {
					pendingRedirects.push({ from: post.oldPath.replace(/\/$/, ""), to });
				}
			} catch (e) {
				state.errors.push(`${post.slug}: ${(e as Error).message}`);
			}
		}

		if (pendingRedirects.length) await this.addRedirects(state, pendingRedirects, remember);
		if (state.cursor >= state.total) {
			await this.finish(wxr, remember);
			state.status = "done";
		}
		await this.save(state);
		return state;
	}

	private async prepare(wxr: Wxr, opts: ImportOptions, remember: (n: (typeof TOUCHED)[number]) => Promise<void>) {
		const { json } = this.deps;
		if (wxr.authors.length) {
			await remember("bylines");
			const have = dataSchemas.bylines.parse(await json.read("bylines", []));
			const fresh = wxr.authors
				.map((a) => ({ slug: slugify(a.login), name: a.name, email: a.email }))
				.filter((a) => a.slug && !have.some((b) => b.slug === a.slug));
			const next: Byline[] = [...have, ...fresh.map((a) => dataSchemas.bylines.element.parse(a))];
			await json.write("bylines", next, "import: authors");
		}
		if (wxr.terms.length) {
			await remember("taxonomies");
			const have = dataSchemas.taxonomies.parse(await json.read("taxonomies", []));
			const next: Taxonomy[] = have.slice();
			for (const [name, kind, label, hierarchical] of [
				["categories", "category", "Categories", true],
				["tags", "tag", "Tags", false],
			] as const) {
				const terms = wxr.terms.filter((t) => t.taxonomy === kind);
				if (!terms.length) continue;
				const at = next.findIndex((t) => t.name === name);
				const taxonomy: Taxonomy =
					at === -1
						? { name, label, hierarchical, collections: [opts.collection], terms: [] }
						: structuredClone(next[at]!);
				if (!taxonomy.collections.includes(opts.collection)) taxonomy.collections.push(opts.collection);
				for (const t of terms) {
					const slug = termSlug(t.slug);
					if (!slug || taxonomy.terms.some((x) => x.slug === slug)) continue;
					const parent = t.parent ? termSlug(t.parent) : "";
					taxonomy.terms.push(
						taxonomyTermSchema.parse({ slug, name: t.name, ...(parent && hierarchical ? { parent } : {}) }),
					);
				}
				// A parent that was not exported is dropped rather than failing the whole import.
				taxonomy.terms = taxonomy.terms.map((t) =>
					t.parent && !taxonomy.terms.some((x) => x.slug === t.parent) ? { ...t, parent: undefined } : t,
				);
				if (at === -1) next.push(taxonomy);
				else next[at] = taxonomy;
			}
			await json.write("taxonomies", dataSchemas.taxonomies.parse(next), "import: categories and tags");
		}
	}

	private async addRedirects(
		state: JobState,
		rules: Array<{ from: string; to: string }>,
		remember: (n: (typeof TOUCHED)[number]) => Promise<void>,
	) {
		await remember("redirects");
		const have = await this.deps.redirects.listStored();
		const fresh = rules.filter((r) => !have.some((h) => h.match === "exact" && h.from === r.from));
		if (!fresh.length) return;
		await this.deps.redirects.save([...have, ...fresh.map((r) => ({ ...r, status: 301 as const }))]);
		state.redirects += fresh.length;
	}

	private async finish(wxr: Wxr, remember: (n: (typeof TOUCHED)[number]) => Promise<void>) {
		if (!wxr.menus.length) return;
		const { json } = this.deps;
		await remember("menus");
		const have = dataSchemas.menus.parse(await json.read("menus", []));
		const href = (url: string) => {
			const path = (() => {
				try {
					const u = new URL(url, wxr.siteUrl || "http://x");
					return !wxr.siteUrl || u.host === hostOf(wxr.siteUrl) ? u.pathname + u.search : url;
				} catch {
					return "";
				}
			})();
			return path.startsWith("/") && !path.startsWith("//") ? path : /^https?:\/\//i.test(path) ? path : "";
		};
		const fresh: Menu[] = [];
		for (const m of wxr.menus) {
			const name = slugify(m.slug);
			if (!name || have.some((h) => h.name === name && !h.locale)) continue;
			const items = m.items.toSorted((a, b) => a.order - b.order).filter((i) => href(i.url));
			const top = items.filter((i) => i.parent === "0" || !items.some((p) => p.id === i.parent));
			// Menus here have two levels: anything deeper is attached to its top-level ancestor.
			const rootOf = (i: (typeof items)[number]): string => {
				const parent = items.find((p) => p.id === i.parent);
				return parent && parent.parent !== "0" && items.some((x) => x.id === parent.parent) ? rootOf(parent) : i.parent;
			};
			fresh.push({
				name,
				label: m.name,
				location: "header",
				items: top.map((t) => ({
					label: t.label,
					href: href(t.url),
					children: items
						.filter((c) => c !== t && rootOf(c) === t.id)
						.map((c) => ({ label: c.label, href: href(c.url) })),
				})),
			});
		}
		if (fresh.length) await json.write("menus", dataSchemas.menus.parse([...have, ...fresh]), "import: menus");
	}

	/** Undoes an import: created entries go to the trash, uploaded media is removed, data files return to how they were. */
	async rollback(id: string): Promise<JobState> {
		const state = await this.get(id);
		if (!state) throw new Error("Import not found");
		if (state.status === "rolled-back") return state;
		for (const { collection, slug } of state.created) await this.deps.service.delete(collection, slug);
		for (const url of state.media) await this.deps.media.delete(url).catch(() => undefined);
		const before: Before = JSON.parse(await readFile(join(this.dir(id), "before.json"), "utf8").catch(() => "{}"));
		for (const name of TOUCHED)
			if (name in before) await this.deps.json.write(name, before[name], `import rollback: ${name}`);
		state.status = "rolled-back";
		await this.save(state);
		return state;
	}
}
