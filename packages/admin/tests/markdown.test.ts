import { describe, expect, it } from "vitest";
import { roundTrip } from "../src/lib/markdown.ts";

describe("markdown <-> lexical", () => {
	it("keeps headings, lists, emphasis and links", () => {
		const md = "# Title\n\nSome **bold** and *italic* text with a [link](https://example.com).\n\n- one\n- two";
		expect(roundTrip(md)).toBe(md);
	});

	it("keeps fenced code blocks", () => {
		const md = "```js\nconst a = 1;\n```";
		expect(roundTrip(md)).toBe(md);
	});

	it("does not lose MDX imports/JSX it cannot edit", () => {
		const md = 'import Chart from "../Chart.astro";\n\n<Chart data={[1,2]} />\n\nText.';
		expect(roundTrip(md)).toContain("<Chart data={[1,2]} />");
		expect(roundTrip(md)).toContain('import Chart from "../Chart.astro";');
	});

	it("keeps image syntax as is", () => {
		const md = "Before\n\n![A cat](/uploads/2026/10/cat.png)\n\nAfter";
		expect(roundTrip(md)).toBe(md);
	});
});
