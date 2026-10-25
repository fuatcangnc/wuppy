import { transform } from "@astrojs/compiler-rs";
import { describe, expect, it } from "vitest";
import { markSource } from "../../src/astro/source-marks.ts";
import { withSourceCopy } from "../../src/astro/visual.ts";

const SRC = `---
import Card from "./Card.astro";
const items = [1, 2];
---
<html><head><title>T</title><meta charset="utf-8"><style>a{}</style></head>
<body><Card><p>in</p></Card><Fragment><span>f</span></Fragment>
	<div class="a">{items.map((i) => <li>{i}</li>)}<img src="a.png" /><br></div>
	<svg><path d="M0" /></svg>
	<section>
		<h2>Title</h2>
		text <em>x</em>
	</section>
</body></html>`;

const locs = (html: string, attr: string) =>
	[...html.matchAll(new RegExp(`<([a-z0-9]+)[^>]*?${attr}="([^"]+)"`, "g"))].map((m) => `${m[1]}@${m[2]}`);

describe("production source marks", () => {
	it("marks the same elements at the same locations as Astro's dev server", async () => {
		const astro = await transform(SRC, { filename: "/t/index.astro", annotateSourceFile: true });
		const ours = await markSource(SRC, "src/pages/index.astro");
		expect(locs(ours, "data-wuppy-loc")).toHaveLength(12);
		expect(locs(ours, "data-wuppy-loc")).toEqual(locs(astro.code, "data-astro-source-loc"));
		expect(ours).toContain('data-wuppy-file="src/pages/index.astro"');
	});

	it("strips the marks for visitors and keeps them for the editor canvas", () => {
		const html = '<p data-wuppy-file="a.astro" data-wuppy-loc="1:2">x</p>';
		expect(withSourceCopy(html, false)).toBe("<p>x</p>");
		expect(withSourceCopy(html)).toBe(html);
	});
});
