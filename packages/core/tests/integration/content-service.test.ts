import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RealGit } from "@wuppycms/git";
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

	it("writes the collection format, lists .md and .mdx together and checks every body", async () => {
		const notes = new ContentService(
			root,
			[collectionSchema.parse({ name: "notes", dir: "content/notes", format: "mdx" })],
			await RealGit.init(root),
			{ components: ["Callout"] },
		);
		await mkdir(join(root, "content/notes"), { recursive: true });
		await writeFile(join(root, "content/notes/theme.mdx"), "---\ntitle: Theme\n---\n<Callout />\n");
		await notes.put("notes", "new", { data: {}, body: "<Callout />\n" });
		expect(await readFile(join(root, "content/notes/new.mdx"), "utf8")).toContain("<Callout");
		expect(await notes.list("notes")).toEqual(["new", "theme"]);
		await expect(notes.put("notes", "new", { data: {}, body: "<Evil />" })).rejects.toThrow(/Evil/);
		await expect(notes.put("notes", "new", { data: {}, body: "Hi {name}" })).rejects.toThrow(/expression/);
	});

	it("keeps an existing HTML-only .md entry on Markdown rules in an MDX collection", async () => {
		await mkdir(join(root, "content/posts"), { recursive: true });
		await writeFile(join(root, "content/posts/hello.md"), "---\ntitle: A\n---\nOld\n");
		const posts = new ContentService(
			root,
			[collectionSchema.parse({ name: "posts", dir: "content/posts", format: "mdx" })],
			await RealGit.init(root),
		);
		await posts.put("posts", "hello", { data: { title: "A" }, body: '<img src="/a.png" alt="A">\n' });
		expect(await readFile(join(root, "content/posts/hello.md"), "utf8")).toContain('<img src="/a.png"');
		expect(await readFile(join(root, "content/posts/hello.mdx"), "utf8").catch(() => null)).toBeNull();
	});

	it("promotes an existing .md entry when a component is inserted", async () => {
		await mkdir(join(root, "content/posts"), { recursive: true });
		await writeFile(join(root, "content/posts/hello.md"), "---\ntitle: A\n---\nText\n");
		const posts = new ContentService(
			root,
			[collectionSchema.parse({ name: "posts", dir: "content/posts", format: "mdx" })],
			await RealGit.init(root),
			{ components: ["Callout"] },
		);
		await posts.put("posts", "hello", { data: { title: "A" }, body: "Text\n\n<Callout />\n" });
		expect(await posts.get("posts", "hello")).toMatchObject({ body: "Text\n\n<Callout />\n" });
		expect(await readFile(join(root, "content/posts/hello.mdx"), "utf8")).toContain("<Callout");
		expect(await readFile(join(root, "content/posts/hello.md"), "utf8").catch(() => null)).toBeNull();
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
