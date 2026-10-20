import { describe, expect, it } from "vitest";
import { collectionSchema, dataSchema } from "../../src/content-types/index.ts";

const posts = collectionSchema.parse({
	name: "posts",
	dir: "content/posts",
	fields: { title: "string", views: "number", draft: "boolean", date: "date", tags: "list" },
});

describe("dataSchema", () => {
	it("accepts declared fields with the right types and keeps unknown ones", () => {
		const out = dataSchema(posts).parse({ title: "A", views: 3, draft: false, date: "2026-01-02", custom: { x: 1 } });
		expect(out.custom).toEqual({ x: 1 });
	});
	it("rejects wrong types", () => {
		expect(() => dataSchema(posts).parse({ title: 5 })).toThrow();
		expect(() => dataSchema(posts).parse({ views: "many" })).toThrow();
	});
	it("rejects malformed dates", () => {
		expect(() => dataSchema(posts).parse({ date: "yesterday" })).toThrow();
	});
	it("list fields are arrays of strings", () => {
		expect(dataSchema(posts).parse({ tags: ["a", "b"] }).tags).toEqual(["a", "b"]);
		expect(() => dataSchema(posts).parse({ tags: "a,b" })).toThrow();
		expect(() => dataSchema(posts).parse({ tags: [1] })).toThrow();
	});
	it("fields are optional", () => {
		expect(dataSchema(posts).parse({})).toEqual({});
	});
});
