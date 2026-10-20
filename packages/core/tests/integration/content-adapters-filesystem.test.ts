import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectionSchema } from "../../src/content-types/index.ts";
import { FilesystemContent } from "../../src/content/adapters/filesystem.ts";

let root: string;
beforeEach(async () => void (root = await mkdtemp(join(tmpdir(), "wuppy-"))));
afterEach(() => rm(root, { recursive: true, force: true }));
const posts = () => new FilesystemContent(root, collectionSchema.parse({ name: "posts", dir: "content/posts" }));

describe("FilesystemContent", () => {
	it("put/get/list/delete", async () => {
		const c = posts();
		await c.put("a/hello", { data: { title: "Hello" }, body: "Hi\n" });
		expect(await c.get("a/hello")).toEqual({ slug: "a/hello", data: { title: "Hello" }, body: "Hi\n" });
		expect(await c.list()).toEqual(["a/hello"]);
		await c.delete("a/hello");
		expect(await c.get("a/hello")).toBeNull();
		expect(await c.list()).toEqual([]);
	});
	it("blocks traversal", async () => {
		await expect(posts().put("../evil", { data: {}, body: "" })).rejects.toThrow();
	});
});
