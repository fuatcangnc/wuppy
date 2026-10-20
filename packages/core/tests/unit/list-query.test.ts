import { describe, expect, it } from "vitest";
import { queryEntries, type Listed } from "../../src/api/list.ts";
import { entryStatus } from "../../src/publishing/index.ts";

const row = (slug: string, data: Record<string, unknown>, modified: string): Listed => ({
	slug,
	data,
	body: "",
	modified,
});
const rows = [
	row("en/a", { title: "Apple", author: "ada" }, "2026-01-10T00:00:00Z"),
	row("tr/a", { title: "Elma", author: "bob", draft: true }, "2026-02-10T00:00:00Z"),
	row("en/b", { title: "Banana", author: "ada", publishAt: "2999-01-01T00:00:00Z" }, "2026-03-10T00:00:00Z"),
];
const slugs = (q: Parameters<typeof queryEntries>[1]) => queryEntries(rows, q).rows.map((r) => r.slug);

describe("entryStatus", () => {
	const now = new Date("2026-06-01T00:00:00Z");
	it("treats a future publishAt as scheduled, drafts as drafts, the rest as published", () => {
		expect(entryStatus({}, now)).toBe("published");
		expect(entryStatus({ draft: true }, now)).toBe("draft");
		expect(entryStatus({ publishAt: "2026-07-01" }, now)).toBe("scheduled");
		expect(entryStatus({ draft: true, publishAt: "2026-07-01" }, now)).toBe("scheduled");
		expect(entryStatus({ draft: true, publishAt: "2026-05-01" }, now)).toBe("draft");
		expect(entryStatus({ publishAt: "not a date" }, now)).toBe("published");
	});
});

describe("queryEntries filters", () => {
	it("filters by status including scheduled", () => {
		expect(slugs({ status: "scheduled" })).toEqual(["en/b"]);
		expect(slugs({ status: "draft" })).toEqual(["tr/a"]);
		expect(slugs({ status: "published" })).toEqual(["en/a"]);
	});
	it("filters by author, language and modified range, and combines them", () => {
		expect(slugs({ author: "ada", sort: "slug" })).toEqual(["en/a", "en/b"]);
		expect(slugs({ lang: "tr" })).toEqual(["tr/a"]);
		expect(slugs({ from: "2026-02-01T00:00:00Z", to: "2026-03-01T00:00:00Z" })).toEqual(["tr/a"]);
		expect(slugs({ lang: "en", author: "ada", from: "2026-03-01T00:00:00Z" })).toEqual(["en/b"]);
	});
	it("sorts by title and pages with a cursor", () => {
		expect(slugs({ sort: "title" })).toEqual(["en/a", "en/b", "tr/a"]);
		const first = queryEntries(rows, { sort: "slug", limit: "2" });
		expect(first.rows.map((r) => r.slug)).toEqual(["en/a", "en/b"]);
		expect(queryEntries(rows, { sort: "slug", limit: "2", cursor: first.nextCursor! }).rows.map((r) => r.slug)).toEqual(
			["tr/a"],
		);
	});
});
