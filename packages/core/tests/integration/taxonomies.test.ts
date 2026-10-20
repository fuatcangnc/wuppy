import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { RealGit } from "@wuppy/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.ts";
import { CommentService } from "../../src/comments/index.ts";
import { collectionSchema } from "../../src/content-types/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { dataSchemas, taxonomySchema } from "../../src/data/schemas.ts";
import { MediaService } from "../../src/media/index.ts";
import { RedirectService } from "../../src/redirects/service.ts";
import { termTree } from "../../src/taxonomies/index.ts";

const H = { "X-Wuppy-Request": "1", "Content-Type": "application/json" };
let root: string;
let app: ReturnType<typeof createApp>;
let service: ContentService;
let json: JsonStore;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-tax-"));
	const git = await RealGit.init(root);
	json = new JsonStore(root, git);
	service = new ContentService(
		root,
		[
			collectionSchema.parse({
				name: "posts",
				dir: "content/posts",
				route: "/blog/{slug}",
				fields: { title: "string", tags: { type: "taxonomy", taxonomy: "tags", multiple: true } },
			}),
		],
		git,
	);
	await json.write(
		"taxonomies",
		[
			{
				name: "tags",
				label: "Tags",
				hierarchical: true,
				collections: ["posts"],
				terms: [
					{ slug: "js", name: "JS" },
					{ slug: "javascript", name: "JavaScript" },
					{ slug: "ts", name: "TS", parent: "js" },
				],
			},
		],
		"seed",
	);
	await service.put("posts", "a", { data: { title: "A", tags: ["js", "ts"] }, body: "" }, "a");
	await service.put("posts", "b", { data: { title: "B", tags: ["js", "javascript"], draft: true }, body: "" }, "b");
	app = createApp({
		service,
		media: new MediaService(root, git),
		json,
		comments: new CommentService(new DatabaseSync(":memory:")),
		redirects: new RedirectService(json, new DatabaseSync(":memory:"), []),
		userCount: () => 1,
		getUser: async () => ({
			id: "u",
			permissions: ["content:read", "content:write", "taxonomies:manage", "content-types:manage"],
		}),
	});
});
afterEach(() => rm(root, { recursive: true, force: true }));

const post = (path: string, body: unknown) =>
	app.request(path, { method: "POST", headers: H, body: JSON.stringify(body) });
const tagsOf = async (slug: string) => (await service.get("posts", slug))?.data.tags;

const base = { name: "t", label: "T", collections: [] };
const bad = (hierarchical: boolean, terms: object[]) =>
	taxonomySchema.safeParse({ ...base, hierarchical, terms }).success;

describe("taxonomy schema", () => {
	it("rejects unknown parents, parent loops and parents in flat taxonomies", () => {
		expect(bad(true, [{ slug: "a", name: "A", parent: "zzz" }])).toBe(false);
		expect(
			bad(true, [
				{ slug: "a", name: "A", parent: "b" },
				{ slug: "b", name: "B", parent: "a" },
			]),
		).toBe(false);
		expect(
			bad(false, [
				{ slug: "a", name: "A", parent: "b" },
				{ slug: "b", name: "B" },
			]),
		).toBe(false);
		expect(
			bad(true, [
				{ slug: "a", name: "A" },
				{ slug: "a", name: "A2" },
			]),
		).toBe(false);
		expect(
			bad(true, [
				{ slug: "a", name: "A" },
				{ slug: "b", name: "B", parent: "a" },
			]),
		).toBe(true);
	});

	it("builds a sorted tree", () => {
		const t = dataSchemas.taxonomies.parse([
			{
				...base,
				hierarchical: true,
				terms: [
					{ slug: "b", name: "B", order: 2 },
					{ slug: "a", name: "A", order: 1 },
					{ slug: "c", name: "C", parent: "a" },
				],
			},
		])[0]!;
		const tree = termTree(t);
		expect(tree.map((n) => n.slug)).toEqual(["a", "b"]);
		expect(tree[0]!.children.map((n) => n.slug)).toEqual(["c"]);
	});
});

describe("taxonomy API", () => {
	it("counts entries per term, split by published", async () => {
		const res = await app.request("/api/taxonomies/counts");
		const { data } = (await res.json()) as {
			data: Record<string, Record<string, { total: number; published: number }>>;
		};
		expect(data.tags).toEqual({
			js: { total: 2, published: 1 },
			javascript: { total: 1, published: 0 },
			ts: { total: 1, published: 1 },
		});
	});

	it("merges a term into another, retagging entries and moving children up", async () => {
		const res = await post("/api/taxonomies/tags/terms/js/merge", { into: "javascript" });
		expect(res.status).toBe(200);
		expect(await tagsOf("a")).toEqual(["javascript", "ts"]);
		expect(await tagsOf("b")).toEqual(["javascript"]); // already had it, no duplicate
		const [tax] = dataSchemas.taxonomies.parse(await json.read("taxonomies", []));
		expect(tax!.terms.map((t) => [t.slug, t.parent])).toEqual([
			["javascript", undefined],
			["ts", "javascript"],
		]);
	});

	it("renames a slug everywhere and refuses a taken one", async () => {
		expect((await post("/api/taxonomies/tags/terms/js/rename", { to: "javascript" })).status).toBe(409);
		expect((await post("/api/taxonomies/tags/terms/js/rename", { to: "es" })).status).toBe(200);
		expect(await tagsOf("a")).toEqual(["es", "ts"]);
		const [tax] = dataSchemas.taxonomies.parse(await json.read("taxonomies", []));
		expect(tax!.terms.find((t) => t.slug === "ts")?.parent).toBe("es");
	});

	it("404s unknown terms and rejects merging into itself", async () => {
		expect((await post("/api/taxonomies/tags/terms/nope/merge", { into: "js" })).status).toBe(404);
		expect((await post("/api/taxonomies/tags/terms/js/merge", { into: "js" })).status).toBe(400);
	});
});

describe("section usage", () => {
	it("lists the entries that pick each section and validates the field", async () => {
		const git = await RealGit.ensure(root);
		const pages = collectionSchema.parse({ name: "pages", dir: "content/pages", fields: { blocks: "section" } });
		const svc = new ContentService(root, [pages], git);
		await svc.put("pages", "home", { data: { blocks: ["hero", "cta"] }, body: "" }, "x");
		await svc.put("pages", "about", { data: { blocks: ["hero"] }, body: "" }, "x");
		const sectionApp = createApp({
			service: svc,
			media: new MediaService(root, git),
			json,
			comments: new CommentService(new DatabaseSync(":memory:")),
			redirects: new RedirectService(json, new DatabaseSync(":memory:"), []),
			userCount: () => 1,
			getUser: async () => ({ id: "u", permissions: ["content:read", "sections:manage"] }),
		});
		const res = await sectionApp.request("/api/sections/usage");
		const { data } = (await res.json()) as { data: Record<string, { slug: string }[]> };
		expect(data.hero?.map((e) => e.slug).toSorted()).toEqual(["about", "home"]);
		expect(data.cta?.map((e) => e.slug)).toEqual(["home"]);
		await expect(svc.put("pages", "bad", { data: { blocks: "hero" }, body: "" }, "x")).rejects.toThrow();
	});
});

describe("content type impact", () => {
	it("reports entries that stop validating and fields that lose data", async () => {
		const res = await post("/api/content-types/impact", {
			name: "posts",
			dir: "content/posts",
			fields: { title: "number" },
		});
		const { data } = (await res.json()) as {
			data: { invalid: { slug: string }[]; removedFields: { field: string; entries: number }[]; types: string };
		};
		expect(data.invalid.map((i) => i.slug).toSorted()).toEqual(["a", "b"]);
		expect(data.removedFields).toEqual([{ field: "tags", entries: 2 }]);
		expect(data.types).toContain('"title"?: number');
	});
});
