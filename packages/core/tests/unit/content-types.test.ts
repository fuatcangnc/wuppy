import { describe, expect, it } from "vitest";
import {
	collectionSchema,
	dataSchema,
	dirClash,
	relationSchema,
	siteCollections,
} from "../../src/content-types/index.ts";

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

const make = (fields: Record<string, unknown>) =>
	dataSchema(collectionSchema.parse({ name: "posts", dir: "content/posts", fields }));

const ok = (schema: ReturnType<typeof make>, data: unknown) => schema.safeParse(data).success;

describe("rich fields", () => {
	it("select accepts only declared options", () => {
		const s = make({ kind: { type: "select", options: ["a", "b"] } });
		expect(ok(s, { kind: "a" })).toBe(true);
		expect(ok(s, { kind: "c" })).toBe(false);
	});
	it("required, min and max are enforced", () => {
		const s = make({ title: { type: "string", required: true, min: 2 }, rating: { type: "number", max: 5 } });
		expect(ok(s, {})).toBe(false);
		expect(ok(s, { title: "x" })).toBe(false);
		expect(ok(s, { title: "xy", rating: 6 })).toBe(false);
		expect(ok(s, { title: "xy", rating: 5 })).toBe(true);
	});
	it("repeater validates rows and item count", () => {
		const s = make({ faq: { type: "repeater", max: 1, fields: { q: { type: "string", required: true } } } });
		expect(ok(s, { faq: [{ q: "why" }] })).toBe(true);
		expect(ok(s, { faq: [{}] })).toBe(false);
		expect(ok(s, { faq: [{ q: "a" }, { q: "b" }] })).toBe(false);
	});
	it("blocks pick the schema by block type", () => {
		const s = make({
			body: { type: "blocks", blocks: { quote: { text: { type: "string", required: true } }, rule: {} } },
		});
		expect(ok(s, { body: [{ type: "quote", text: "hi" }, { type: "rule" }] })).toBe(true);
		expect(ok(s, { body: [{ type: "quote" }] })).toBe(false);
		expect(ok(s, { body: [{ type: "video" }] })).toBe(false);
	});
	it("json accepts any JSON; showIf makes a required field conditional", () => {
		const s = make({
			meta: "json",
			publishAt: { type: "date", required: true, showIf: { field: "draft", equals: true } },
		});
		expect(ok(s, { meta: { a: [1, "b"] }, draft: false })).toBe(true);
		expect(ok(s, { draft: true })).toBe(false);
		expect(ok(s, { draft: true, publishAt: "2030-01-01" })).toBe(true);
	});
});

describe("siteCollections", () => {
	it("adds Pages/Posts when missing, lets saved types replace, and gives a relation's from side its field", () => {
		const config = [collectionSchema.parse({ name: "landing", kind: "pages", dir: "content/landing", fields: {} })];
		const types = [collectionSchema.parse({ name: "authors", dir: "content/authors", fields: {} })];
		const relations = [
			relationSchema.parse({
				name: "posts_authors",
				from: "posts",
				to: "authors",
				fromLabel: "Posts",
				toLabel: "Authors",
				fromMany: false,
			}),
			relationSchema.parse({ name: "gone", from: "posts", to: "nope", fromLabel: "P", toLabel: "N" }),
		];
		const out = siteCollections(config, types, relations);
		expect(out.map((c) => c.name)).toEqual(["landing", "authors", "posts"]);
		const linking = out.find((c) => c.name === "posts")!;
		expect(linking.fields.posts_authors).toMatchObject({
			type: "reference",
			collection: "authors",
			multiple: true,
			unique: true,
		});
		expect(linking.fields.gone).toBeUndefined();
		expect(config[0]!.fields).toEqual({});
	});

	it("finds collections whose folders nest", () => {
		expect(
			dirClash([
				{ name: "a", dir: "content/a" },
				{ name: "b", dir: "content/b" },
			]),
		).toBeUndefined();
		expect(
			dirClash([
				{ name: "a", dir: "content/a" },
				{ name: "t", dir: "content/" },
			]),
		).toMatch(/share a folder/);
		expect(
			dirClash([
				{ name: "a", dir: "./content/a/" },
				{ name: "b", dir: "content/a" },
			]),
		).toMatch(/share a folder/);
	});
});
