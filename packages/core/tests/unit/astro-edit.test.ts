import { describe, expect, it } from "vitest";
import { editAstroElement } from "../../src/themes/astro-edit.ts";

const page = `---
import L from "../L.astro";
const tags = ["a"];
---
<L>
  <main class="container">
    <h1>Tags</h1>
    <p>One</p>
    <img src="/x.png" />
    {tags.map((t) => <a href={t} class={t}>#{t}</a>)}
  </main>
</L>
`;

describe("editing a theme .astro element", () => {
	it("changes static text and reports the element's location", () => {
		const out = editAstroElement(page, "7:9", { action: "text", value: "Etiketler {x} <b>" });
		expect(out.source).toContain("<h1>Etiketler &#123;x&#125; &lt;b></h1>");
		expect(out.loc).toBe("7:9");
	});

	it("sets, adds and removes class and style", () => {
		const out = editAstroElement(page, "6:27", { action: "attrs", attrs: { class: "wide", style: 'color: "red"' } });
		expect(out.source).toContain('<main style="color: &quot;red&quot;" class="wide">');
		expect(out.loc).toBe("6:53");
		expect(editAstroElement(out.source, "6:53", { action: "attrs", attrs: { class: null } }).source).toContain(
			'<main style="color: &quot;red&quot;">',
		);
		// A self-closing element is located inside its tag.
		expect(editAstroElement(page, "9:6", { action: "attrs", attrs: { class: "pic" } }).source).toContain(
			'<img class="pic" src="/x.png" />',
		);
	});

	it("sets any attribute and renames the tag", () => {
		const out = editAstroElement(page, "8:8", { action: "attrs", attrs: { hidden: "", "aria-label": "x" } });
		expect(out.source).toContain('<p aria-label="x" hidden>One</p>');
		expect(editAstroElement(page, "8:8", { action: "tag", name: "h2" }).source).toContain("<h2>One</h2>");
		expect(() => editAstroElement("<L><p>x</p></L>\n", "1:5", { action: "tag", name: "div" }, "l")).toThrow(
			/Components/,
		);
	});

	it("deletes, duplicates and moves whole lines", () => {
		expect(editAstroElement(page, "8:8", { action: "delete" }).source).not.toContain("<p>One</p>");
		expect(editAstroElement(page, "8:8", { action: "duplicate" }).source).toContain("    <p>One</p>\n    <p>One</p>\n");
		const up = editAstroElement(page, "8:8", { action: "move", by: -1 });
		expect(up.source).toContain("    <p>One</p>\n    <h1>Tags</h1>\n");
		expect(up.loc).toBe("7:8");
	});

	it("refuses text made by code and elements inside expressions", () => {
		expect(() => editAstroElement(page, "10:44", { action: "text", value: "x" })).toThrow(/Code view/);
		expect(() => editAstroElement(page, "10:44", { action: "attrs", attrs: { class: "x" } })).toThrow(/set by code/);
		expect(() => editAstroElement(page, "10:44", { action: "move", by: -1 })).toThrow(/made by code/);
	});

	it("tells an element from the empty child it opens with", () => {
		const src = '<h3><a href="/"></a></h3>\n';
		expect(editAstroElement(src, "1:6", { action: "attrs", attrs: { class: "t" } }, "h3").source).toBe(
			'<h3 class="t"><a href="/"></a></h3>\n',
		);
		expect(editAstroElement(src, "1:6", { action: "attrs", attrs: { class: "l" } }, "a").source).toBe(
			'<h3><a class="l" href="/"></a></h3>\n',
		);
	});
});
