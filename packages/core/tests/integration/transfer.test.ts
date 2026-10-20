import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NoopGit, RealGit } from "@wuppy/git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectionSchema } from "../../src/content-types/index.ts";
import { ContentService } from "../../src/content/service.ts";
import { exportContent, importContent } from "../../src/transfer/index.ts";

let root: string;
let svc: ContentService;
const posts = collectionSchema.parse({ name: "posts", dir: "content/posts", fields: { title: "string" } });
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "wuppy-xfer-"));
	svc = new ContentService(root, [posts], await RealGit.init(root), { components: [] });
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("export / import", () => {
	it("round-trips content between two sites", async () => {
		await svc.put("posts", "a/one", { data: { title: "One", custom: { x: 1 } }, body: "Body\n" });
		await svc.put("posts", "two", { data: { title: "Two" }, body: "Second\n" });
		const bundle = await exportContent(svc);
		expect(bundle.version).toBe(1);

		const other = await mkdtemp(join(tmpdir(), "wuppy-xfer2-"));
		try {
			const target = new ContentService(other, [posts], new NoopGit());
			expect(await importContent(target, bundle)).toEqual({ imported: 2, errors: [] });
			expect(await target.get("posts", "a/one")).toMatchObject({
				data: { title: "One", custom: { x: 1 } },
				body: "Body\n",
			});
		} finally {
			await rm(other, { recursive: true, force: true });
		}
	});

	it("validates every entry on the way in and reports problems without aborting the rest", async () => {
		const bundle = {
			version: 1,
			collections: {
				posts: {
					good: { data: { title: "Ok" }, body: "fine" },
					"bad-type": { data: { title: 5 }, body: "x" },
					"../evil": { data: {}, body: "x" },
					scripted: { data: {}, body: "<script>1</script>" },
				},
				ghosts: { a: { data: {}, body: "x" } },
			},
		};
		const res = await importContent(svc, bundle);
		expect(res.imported).toBe(1);
		expect(res.errors.map((e) => e.entry).toSorted()).toEqual([
			"ghosts/a",
			"posts/../evil",
			"posts/bad-type",
			"posts/scripted",
		]);
		expect(await svc.list("posts")).toEqual(["good"]);
	});

	it("rejects a malformed bundle outright", async () => {
		await expect(importContent(svc, { version: 2 })).rejects.toThrow(/bundle/i);
		await expect(importContent(svc, "nope")).rejects.toThrow(/bundle/i);
	});
});
