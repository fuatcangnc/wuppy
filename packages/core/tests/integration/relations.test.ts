import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { RealGit } from "@wuppycms/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type User } from "../../src/api/app.ts";
import { CommentService } from "../../src/comments/index.ts";
import { collectionSchema, siteCollections, type Collection, type Relation } from "../../src/content-types/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { JsonStore } from "../../src/data/store.ts";
import { MediaService } from "../../src/media/index.ts";
import { RedirectService } from "../../src/redirects/service.ts";

const ADMIN: User = {
	id: "admin",
	permissions: ["content:read", "content:write", "content:publish", "content-types:manage"],
};
const H = { "X-Wuppy-Request": "1", "Content-Type": "application/json" };
const config = [collectionSchema.parse({ name: "posts", dir: "content/posts", fields: { title: "string" } })];

let root: string;
let json: JsonStore;
let service: ContentService;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-rel-"));
	const git = await RealGit.init(root);
	json = new JsonStore(root, git);
	const siteTypes = async () =>
		siteCollections(
			config,
			(await json.read("content-types", [])) as Collection[],
			(await json.read("relations", [])) as Relation[],
		);
	service = new ContentService(root, await siteTypes(), git);
	app = createApp({
		service,
		media: new MediaService(root, git, undefined, json),
		json,
		comments: new CommentService(new DatabaseSync(":memory:")),
		redirects: new RedirectService(json, new DatabaseSync(":memory:"), []),
		userCount: () => 1,
		getUser: async () => ADMIN,
		siteTypes,
	});
});
afterEach(() => rm(root, { recursive: true, force: true }));

const put = (name: string, data: unknown) =>
	app.request(`/api/data/${name}`, { method: "PUT", headers: H, body: JSON.stringify({ data }) });
const save = (collection: string, slug: string, data: Record<string, unknown>) =>
	app.request(`/api/content/${collection}/${slug}`, {
		method: "PUT",
		headers: H,
		body: JSON.stringify({ data, body: "" }),
	});

describe("content types and relations", () => {
	it("adds Pages next to the config's Posts, and applies a new type without a restart", async () => {
		expect(service.collections.map((c) => c.name)).toEqual(["posts", "pages"]);
		const type = { name: "authors", dir: "content/authors", format: "md", route: "/authors/{slug}", fields: {} };
		expect((await put("content-types", [type])).status).toBe(200);
		const names = ((await (await app.request("/api/collections")).json()) as { data: Collection[] }).data;
		expect(names.map((c) => c.name)).toContain("authors");
	});

	it("refuses a type whose folder holds another type's", async () => {
		const res = await put("content-types", [{ name: "test", dir: "content/", fields: {} }]);
		expect(res.status).toBe(422);
		expect(await res.text()).toMatch(/share a folder/);
	});

	it("links entries, keeps a one-sided limit and lists the other side", async () => {
		await put("content-types", [{ name: "authors", dir: "content/authors", fields: { title: "string" } }]);
		expect(
			(await put("relations", [{ name: "x", from: "posts", to: "nope", fromLabel: "P", toLabel: "N" }])).status,
		).toBe(422);
		const relation = { name: "posts_authors", from: "posts", to: "authors", fromLabel: "Posts", toLabel: "Author" };
		expect((await put("relations", [{ ...relation, toMany: false, fromMany: false }])).status).toBe(200);
		expect((await save("authors", "ada", { title: "Ada" })).status).toBe(200);
		expect((await save("posts", "one", { title: "One", posts_authors: "ada" })).status).toBe(200);
		// One author per post, and each author on one post only.
		expect((await save("posts", "two", { title: "Two", posts_authors: ["ada"] })).status).toBe(422);
		expect((await save("posts", "two", { title: "Two", posts_authors: "ada" })).status).toBe(422);
		const linked = await (await app.request("/api/relations/linked/authors/ada")).json();
		expect(linked).toEqual({
			data: [
				{
					relation: "posts_authors",
					label: "Posts",
					collection: "posts",
					entries: [{ slug: "one", title: "One" }],
				},
			],
		});
	});
});
