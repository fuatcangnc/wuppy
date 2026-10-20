import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NoopGit, RealGit } from "@wuppy/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectionSchema } from "../../src/content-types/index.ts";
import { ContentService } from "../../src/content/service.ts";

let root: string;
let svc: ContentService;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-svc-"));
	svc = new ContentService(
		root,
		[collectionSchema.parse({ name: "posts", dir: "content/posts" })],
		await RealGit.init(root),
	);
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("ContentService", () => {
	it("every write is a commit", async () => {
		await svc.put("posts", "hello", { data: { title: "A" }, body: "x\n" });
		await svc.put("posts", "hello", { data: { title: "B" }, body: "x\n" }, "fix: title");
		const h = await svc.history("posts", "hello");
		expect(h.map((c) => c.message)).toEqual(["fix: title", "content: update posts/hello"]);
	});

	it("delete moves the file to trash and records a commit", async () => {
		await svc.put("posts", "hello", { data: {}, body: "x\n" });
		await svc.delete("posts", "hello");
		expect(await svc.get("posts", "hello")).toBeNull();
		expect((await svc.history("posts", "hello"))[0]?.message).toBe("content: trash posts/hello");
		expect(await svc.listTrash()).toHaveLength(1);
		expect(await svc.restore("posts", "hello")).toBe(true);
		expect((await svc.get("posts", "hello"))?.body).toBe("x\n");
		expect(await svc.listTrash()).toHaveLength(0);
	});

	it("revert restores previous content through a new commit", async () => {
		await svc.put("posts", "hello", { data: { title: "A" }, body: "x\n" });
		await svc.put("posts", "hello", { data: { title: "B" }, body: "x\n" });
		const [latest] = await svc.history("posts", "hello");
		await svc.revert(latest!.sha);
		expect((await svc.get("posts", "hello"))?.data).toEqual({ title: "A" });
		expect(await svc.history("posts", "hello")).toHaveLength(3);
		expect(await readFile(join(root, "content/posts/hello.md"), "utf8")).toContain("title: A");
	});

	it("unknown collection throws", async () => {
		await expect(svc.get("nope", "x")).rejects.toThrow(/unknown collection/i);
	});

	it("concurrent writes do not collide on the git index", async () => {
		await Promise.all(["a", "b", "c", "d", "e", "f"].map((s) => svc.put("posts", s, { data: {}, body: s })));
		expect(await svc.list("posts")).toHaveLength(6);
		for (const s of ["a", "f"]) expect(await svc.history("posts", s)).toHaveLength(1);
	});

	it("saving unchanged content is a no-op, not an error", async () => {
		await svc.put("posts", "same", { data: {}, body: "x\n" });
		await svc.put("posts", "same", { data: {}, body: "x\n" });
		expect(await svc.history("posts", "same")).toHaveLength(1);
	});
});

describe("allowedComponents", () => {
	it("lists the MDX components the site allows, none by default", () => {
		const posts = collectionSchema.parse({ name: "posts", dir: "content/posts" });
		expect(new ContentService("/tmp", [posts], new NoopGit()).allowedComponents).toEqual([]);
		expect(new ContentService("/tmp", [posts], new NoopGit(), { components: ["Callout"] }).allowedComponents).toEqual([
			"Callout",
		]);
	});
});
