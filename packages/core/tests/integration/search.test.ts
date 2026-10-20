import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NoopGit } from "@wuppy/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectionSchema } from "../../src/content-types/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { SearchIndex } from "../../src/search/index.ts";

let root: string;
let svc: ContentService;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-search-"));
	svc = new ContentService(
		root,
		[
			collectionSchema.parse({ name: "posts", dir: "content/posts" }),
			collectionSchema.parse({ name: "pages", dir: "content/pages" }),
		],
		new NoopGit(),
	);
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("SearchIndex", () => {
	it("finds by title, body and frontmatter, ranks titles first and highlights safely", async () => {
		await svc.put("posts", "a", { data: { title: "Garden tips" }, body: "Water the roses <b>daily</b>." });
		await svc.put("posts", "b", { data: { title: "Roses", draft: true }, body: "Nothing here" });
		await svc.put("pages", "c", { data: { title: "About", tags: ["gardening"] }, body: "We like roses." });
		const index = new SearchIndex(svc);

		const hits = await index.search({ q: "rose" });
		expect(hits[0]?.slug).toBe("b"); // a title match outranks body matches
		expect(hits.map((h) => h.slug).toSorted()).toEqual(["a", "b", "c"]);
		const body = hits.find((h) => h.slug === "a")!;
		expect(body.excerpt).toContain("<mark>roses</mark>");
		expect(body.excerpt).toContain("&lt;b&gt;daily&lt;/b&gt;");
		expect(body.excerpt).not.toContain("<b>");

		expect((await index.search({ q: "garden" })).map((h) => h.slug).toSorted()).toEqual(["a", "c"]);
		expect((await index.search({ q: "rose", collection: "pages" })).map((h) => h.slug)).toEqual(["c"]);
		expect((await index.search({ q: "rose", status: "draft" })).map((h) => h.slug)).toEqual(["b"]);
	});

	it("never treats input as FTS syntax and picks up new writes", async () => {
		const index = new SearchIndex(svc);
		expect(await index.search({ q: '" OR * NEAR( ) -' })).toEqual([]);
		expect(await index.search({ q: "" })).toEqual([]);
		await svc.put("posts", "n", { data: { title: "Brand new" }, body: "" });
		expect((await index.search({ q: "brand" })).map((h) => h.slug)).toEqual(["n"]);
		await svc.put("posts", "n", { data: { title: "Renamed" }, body: "" });
		expect(await index.search({ q: "brand" })).toEqual([]);
	});
});
