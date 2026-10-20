import { describe, expect, it } from "vitest";
import { parseDocument, serializeDocument } from "../../src/content/parsers/frontmatter.ts";

describe("frontmatter", () => {
	it("round-trips and keeps unknown fields", () => {
		const src = "---\ntitle: Hi\ncustom:\n  a: 1\n---\nBody\n";
		const doc = parseDocument(src);
		expect(doc.data).toEqual({ title: "Hi", custom: { a: 1 } });
		expect(parseDocument(serializeDocument(doc))).toEqual(doc);
	});
	it("handles no frontmatter", () => expect(parseDocument("Just text")).toEqual({ data: {}, body: "Just text" }));
	it("rejects non-mapping frontmatter", () => expect(() => parseDocument("---\n- a\n---\nx")).toThrow());
});
