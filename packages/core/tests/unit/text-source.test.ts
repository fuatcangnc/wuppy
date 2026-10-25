import { describe, expect, it } from "vitest";
import { findTextSource } from "../../src/themes/text-source.ts";

const files = [
	{ path: "src/components/site/community.tsx", content: `<SectionHeader title="Built on a community" />` },
	{
		path: "src/components/site/data.ts",
		content: `if (a === "Twice") x(); export const items = [{ title: 'Fast' }, { title: "Twice" }, { title: "Twice" }];`,
	},
	{ path: "src/content/blog/a.md", content: `"Fast"` },
];

describe("findTextSource", () => {
	it("finds an attribute value written once and keeps it an attribute", () => {
		expect(findTextSource(files, "Built on a community", "Made by us")).toEqual({
			path: "src/components/site/community.tsx",
			start: 21,
			end: 43,
			text: '"Made by us"',
		});
		expect(findTextSource(files, "Built on a community", 'Made by "us"')).toMatchObject({ text: `'Made by "us"'` });
		expect(() => findTextSource(files, "Built on a community", `isn't "it"`)).toThrow(/both quote/);
	});

	it("writes a JS string with escapes", () => {
		expect(findTextSource(files, "Fast", 'Very "fast"')).toMatchObject({
			path: "src/components/site/data.ts",
			text: '"Very \\"fast\\""',
		});
	});

	it("counts places when the text is not unique or missing", () => {
		expect(findTextSource(files, "Twice", "x")).toBe(3);
		expect(findTextSource(files, "Nowhere", "x")).toBe(0);
	});
});
