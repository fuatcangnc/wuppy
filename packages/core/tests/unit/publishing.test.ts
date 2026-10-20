import { describe, expect, it } from "vitest";
import { isPublished } from "../../src/publishing/index.ts";

const now = new Date("2026-06-15T12:00:00Z");

describe("isPublished", () => {
	it("publishes by default", () => expect(isPublished({}, now)).toBe(true));
	it("hides drafts", () => expect(isPublished({ draft: true }, now)).toBe(false));
	it("hides entries scheduled in the future", () => {
		expect(isPublished({ publishAt: "2026-06-16" }, now)).toBe(false);
		expect(isPublished({ publishAt: "2026-06-15T12:00:01Z" }, now)).toBe(false);
	});
	it("publishes once the time has come", () => {
		expect(isPublished({ publishAt: "2026-06-15T12:00:00Z" }, now)).toBe(true);
		expect(isPublished({ publishAt: "2026-01-01" }, now)).toBe(true);
	});
	it("a draft stays hidden even after its date", () =>
		expect(isPublished({ draft: true, publishAt: "2026-01-01" }, now)).toBe(false));
	it("accepts Date objects (Astro content collections)", () => {
		expect(isPublished({ publishAt: new Date("2026-07-01") }, now)).toBe(false);
	});
	it("fails closed on an unparseable date", () => expect(isPublished({ publishAt: "soon" }, now)).toBe(false));
});
