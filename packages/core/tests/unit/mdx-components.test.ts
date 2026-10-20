import { describe, expect, it } from "vitest";
import { findDisallowed } from "../../src/mdx/index.ts";

const allowed = ["Callout", "Figure"];

describe("findDisallowed", () => {
	it("allows plain markdown and listed components", () => {
		expect(
			findDisallowed('# Hi\n\nText with <Callout type="note">x</Callout>\n\n<Figure src="/a.png" />', allowed),
		).toEqual([]);
	});
	it("flags unlisted components", () => {
		expect(findDisallowed("<Evil />\n\n<Callout>ok</Callout>", allowed)).toEqual(["Evil"]);
	});
	it("flags every import/export (arbitrary code) and inline expressions that call things", () => {
		expect(findDisallowed('import x from "node:fs";\n\ntext', allowed)).toEqual(["import"]);
		expect(findDisallowed("export const a = 1;", allowed)).toEqual(["export"]);
	});
	it("flags raw html script/iframe/style elements even though they are lowercase", () => {
		expect(findDisallowed("<script>alert(1)</script>", allowed)).toEqual(["script"]);
		expect(findDisallowed("<iframe src=x></iframe>", allowed)).toEqual(["iframe"]);
	});
	it("ignores tags inside fenced and inline code", () => {
		expect(findDisallowed("```html\n<script>1</script>\n```\n\nUse `<Evil />` carefully.", allowed)).toEqual([]);
	});
	it("flags javascript: urls in links", () => {
		expect(findDisallowed("[x](javascript:alert(1))", allowed)).toEqual(["javascript:"]);
	});
	it("does not flag comparison text like a < b", () => {
		expect(findDisallowed("if a < b and c > d", allowed)).toEqual([]);
	});
});
