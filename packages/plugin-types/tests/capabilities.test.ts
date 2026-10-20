import { describe, expect, it } from "vitest";
import { canFetch, canReadContent, manifestSchema } from "../src/index.ts";

const manifest = manifestSchema.parse({
	id: "search-indexer",
	version: "1.0.0",
	hooks: ["onContentUpdated"],
	capabilities: {
		content: { read: ["posts"] },
		network: [{ host: "search.example.com", methods: ["POST"], paths: ["/v1/"] }],
	},
});

describe("manifest", () => {
	it("applies safe defaults: no capabilities, tight limits", () => {
		const m = manifestSchema.parse({ id: "a", version: "0.1.0" });
		expect(m.capabilities).toEqual({ content: { read: [] }, network: [] });
		expect(m.limits).toEqual({ timeoutMs: 2000, memoryMb: 16 });
	});
	it.each([{ id: "Bad Id" }, { id: "a", version: "x" }, { id: "a", version: "1.0.0", hooks: ["onEverything"] }])(
		"rejects %j",
		(bad) => expect(() => manifestSchema.parse({ version: "1.0.0", ...bad })).toThrow(),
	);
	it("rejects wildcard hosts and non-https-looking hosts with ports/schemes", () => {
		for (const host of ["*", "*.example.com", "https://x.com", "x.com:8080", ""]) {
			expect(() =>
				manifestSchema.parse({ id: "a", version: "1.0.0", capabilities: { network: [{ host }] } }),
			).toThrow();
		}
	});
});

describe("canReadContent", () => {
	it("only listed collections", () => {
		expect(canReadContent(manifest, "posts")).toBe(true);
		expect(canReadContent(manifest, "pages")).toBe(false);
	});
});

describe("canFetch", () => {
	it("allows exact host, method and path prefix over https", () => {
		expect(canFetch(manifest, "https://search.example.com/v1/index", "POST")).toBe(true);
	});
	it.each([
		["https://search.example.com/v1/index", "GET"],
		["https://search.example.com/admin", "POST"],
		["https://evil.com/v1/", "POST"],
		["http://search.example.com/v1/", "POST"],
		["https://search.example.com.evil.com/v1/", "POST"],
		["https://user:pw@search.example.com/v1/", "POST"],
		["https://search.example.com/v1/../admin", "POST"],
		["not a url", "POST"],
	])("denies %s %s", (url, method) => expect(canFetch(manifest, url, method)).toBe(false));
});
