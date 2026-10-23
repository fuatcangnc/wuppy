import { describe, expect, it } from "vitest";
import { withSourceCopy } from "../../src/astro/visual.ts";

describe("source marks for the visual editor", () => {
	it("copies Astro's dev source marks next to them", () => {
		expect(withSourceCopy('<h1 data-astro-source-file="/t/a.astro" data-astro-source-loc="3:5">x</h1>')).toBe(
			'<h1 data-astro-source-file="/t/a.astro" data-wuppy-file="/t/a.astro" data-astro-source-loc="3:5" data-wuppy-loc="3:5">x</h1>',
		);
		expect(withSourceCopy("<h1>x</h1>")).toBe("<h1>x</h1>");
	});
});
