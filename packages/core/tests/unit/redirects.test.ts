import { describe, expect, it } from "vitest";
import { redirectsSchema, resolveRedirect } from "../../src/redirects/index.ts";

describe("redirects", () => {
	const rules = redirectsSchema.parse([
		{ from: "/old", to: "/new" },
		{ from: "/gone", to: "https://other.example/x", status: 302 },
	]);

	it("matches exact paths and defaults to 301", () => {
		expect(resolveRedirect(rules, "/old")).toEqual({ to: "/new", status: 301 });
		expect(resolveRedirect(rules, "/gone")).toEqual({ to: "https://other.example/x", status: 302 });
		expect(resolveRedirect(rules, "/old/")).toEqual({ to: "/new", status: 301 });
		expect(resolveRedirect(rules, "/nothing")).toBeNull();
	});

	it("rejects loops, self-redirects and chains that cycle", () => {
		expect(() => redirectsSchema.parse([{ from: "/a", to: "/a" }])).toThrow(/loop/i);
		expect(() =>
			redirectsSchema.parse([
				{ from: "/a", to: "/b" },
				{ from: "/b", to: "/a" },
			]),
		).toThrow(/loop/i);
	});

	it("rejects protocol-relative and javascript: targets (open redirect / XSS)", () => {
		expect(() => redirectsSchema.parse([{ from: "/a", to: "//evil.example" }])).toThrow();
		expect(() => redirectsSchema.parse([{ from: "/a", to: "javascript:alert(1)" }])).toThrow();
	});

	it("rejects duplicate sources", () => {
		expect(() =>
			redirectsSchema.parse([
				{ from: "/a", to: "/b" },
				{ from: "/a", to: "/c" },
			]),
		).toThrow(/duplicate/i);
	});
});
