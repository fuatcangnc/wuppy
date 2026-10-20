import { describe, expect, it } from "vitest";
import { parseRedirectsCsv, redirectsSchema, redirectsToCsv, resolveRedirect } from "../../src/redirects/index.ts";

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

describe("match types, priority and query strings", () => {
	const rules = redirectsSchema.parse([
		{ from: "/blog/*", to: "/posts/$1", match: "wildcard" },
		{ from: "/blog/featured/*", to: "/featured/$1", match: "wildcard", status: 302 },
		{ from: "^/p/(\\d+)/(\\w+)$", to: "/posts/$2-$1", match: "regex" },
		{ from: "/blog/pinned", to: "/pinned" },
		{ from: "/off", to: "/x", enabled: false },
		{ from: "/keep", to: "/target?fixed=1" },
	]);

	it("exact beats wildcard, the longest wildcard beats a shorter one, regex captures fill $n", () => {
		expect(resolveRedirect(rules, "/blog/pinned")?.to).toBe("/pinned");
		expect(resolveRedirect(rules, "/blog/hello")?.to).toBe("/posts/hello");
		expect(resolveRedirect(rules, "/blog/featured/a")).toEqual({ to: "/featured/a", status: 302 });
		expect(resolveRedirect(rules, "/p/42/news")?.to).toBe("/posts/news-42");
		expect(resolveRedirect(rules, "/p/x/news")).toBeNull();
	});

	it("keeps the visitor's query string unless the target has its own or the rule opts out", () => {
		expect(resolveRedirect(rules, "/blog/a", "?utm=1")?.to).toBe("/posts/a?utm=1");
		expect(resolveRedirect(rules, "/keep", "?utm=1")?.to).toBe("/target?fixed=1");
		const off = redirectsSchema.parse([{ from: "/a", to: "/b", preserveQuery: false }]);
		expect(resolveRedirect(off, "/a", "?utm=1")?.to).toBe("/b");
	});

	it("skips disabled rules", () => expect(resolveRedirect(rules, "/off")).toBeNull());

	it("rejects bad wildcards and unsafe or invalid regexes", () => {
		expect(() => redirectsSchema.parse([{ from: "/blog", to: "/x", match: "wildcard" }])).toThrow(/wildcard/);
		expect(() => redirectsSchema.parse([{ from: "(", to: "/x", match: "regex" }])).toThrow(/regular expression/);
		expect(() => redirectsSchema.parse([{ from: "^/(a+)+$", to: "/x", match: "regex" }])).toThrow(/unsafe/);
	});

	it("a chain that ends elsewhere is allowed; only cycles are refused", () => {
		const chain = redirectsSchema.parse([
			{ from: "/a", to: "/b" },
			{ from: "/b", to: "/c" },
		]);
		expect(resolveRedirect(chain, "/a")?.to).toBe("/b");
	});
});

describe("CSV import and export", () => {
	const rules = redirectsSchema.parse([
		{ from: "/a", to: "/b" },
		{ from: "/c, d", to: 'https://x.example/"q"', status: 302, note: "has, comma\nand newline" },
	]);
	it("round-trips, including quoting", () => {
		expect(parseRedirectsCsv(redirectsToCsv(rules))).toEqual(rules);
	});
	it("accepts files without a header and reports the bad row", () => {
		expect(parseRedirectsCsv("/x,/y\n/z,/w,302")).toHaveLength(2);
		expect(() => parseRedirectsCsv("/x,/y\n/z,javascript:alert(1)")).toThrow(/Row 2/);
	});
});
